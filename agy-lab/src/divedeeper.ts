// Dive-deeper: the paid stage after a company-dive (docs/dive-deeper-plan.md, step 5).
//
// One run per company: the company-dive first (started through its own public API, never
// touched), then dive-deeper stage 1 (reviews, Maps and web findability, registers, website
// health, what AI says), stage 2 (consultation) and stage 3 (the editor), then one report stored in the
// dive_deeper table and served at /dd/<public id>.
//
// Isolation from company-dive (plan §2): own files, own table, own queue (one run at a time,
// never in company-dive's queue), read-only on company_dive (plain selects). Everything here
// is off unless DIVE_DEEPER_ENABLED is set: with it off, every handler declines and the hub
// behaves exactly as before.
//
// No kill gates: no timeouts or token caps; a lane that fails comes back partial and the run
// still finishes with a report.
import http from 'node:http';
import crypto from 'node:crypto';
import * as reportdb from './reportdb.ts';
import * as brave from './brave.ts';
import * as exa from './exa.ts';
import { configure } from './divedeeper/lib.ts';
import { runLane, stageDive, type LaneResult } from './divedeeper/runner.ts';
import { buildReport } from './divedeeper/report-html.ts';
import { buildPreview, type Offer } from './divedeeper/preview-html.ts';
import { page as browsePage } from './divedeeper-page.ts';

export const enabled = (env: NodeJS.ProcessEnv = process.env): boolean => /^(1|true|on|yes)$/i.test(String(env.DIVE_DEEPER_ENABLED ?? '').trim());

// Section G on the hub asks deepseek only (the gpt router key has no credit; decided 2026-10-26).
process.env.DD_G_MODELS ??= 'deepseek-v4.1-flash-1017';
process.env.DD_G_JUDGE ??= 'deepseek-v4.1-flash-1017';

/** The order lanes run in. E-maps reuses H-maps' listings and C-merged its Maps phones, so both wait for H-maps; S2 reads everything. */
export const STAGE1_FIRST = [['H', 'maps'], ['H', 'web'], ['D', 'registry'], ['G', 'fixed'], ['G', 'grounded']] as const;
export const STAGE1_AFTER_H = [['E', 'maps'], ['C', 'merged']] as const;
export const STAGE2 = ['S2', 'consult'] as const;
/** The editor reads everything, S2 included, and writes the report's words and screenshots. */
export const STAGE3 = ['S3', 'editor'] as const;

type Row = {
  id: number; public_id: string; company: string; dive_id: number | null;
  status: string; stage: string; log: Array<{ at: string; stage: string; msg: string }>;
  lanes: Record<string, LaneResult>; report_html: string | null; error: string | null;
  created_at: string; finished_at: string | null;
};

let tableReady: Promise<unknown> | null = null;
function ensureTable(): Promise<unknown> {
  tableReady ??= reportdb.sql(`
    create table if not exists dive_deeper (
      id bigserial primary key,
      public_id text not null unique,
      company text not null,
      dive_id bigint,
      status text not null default 'queued',
      stage text not null default '',
      log jsonb not null default '[]',
      lanes jsonb not null default '{}',
      report_html text,
      error text,
      created_at timestamptz not null default now(),
      finished_at timestamptz
    );
    create index if not exists dive_deeper_created_idx on dive_deeper (created_at desc);
  `).catch((err) => { tableReady = null; throw err; });
  return tableReady;
}

const newPublicId = () => crypto.randomBytes(15).toString('base64url');

async function update(id: number, fields: Partial<Omit<Row, 'id' | 'created_at'>>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const json = new Set(['log', 'lanes']);
  const sets = keys.map((k, i) => `${k} = $${i + 2}${json.has(k) ? '::jsonb' : ''}`).join(', ');
  const values = keys.map((k) => (json.has(k) ? JSON.stringify((fields as any)[k]) : (fields as any)[k]));
  await reportdb.sql(`update dive_deeper set ${sets} where id = $1`, [id, ...values]);
}

// ---------------------------------------------------------------- keys and the dive

let configured = false;
/** The lanes ask for keys by their vault names; on the hub they come from the hub's own sources. */
function configureKeys(): void {
  if (configured) return;
  configured = true;
  let exaKeys: string[] = [];
  let exaNext = 0;
  configure({
    secret: (name) => {
      if (name === 'VECTIDE_DEEPSEEK_KEY') return process.env.CONTACT_LLM_KEY;
      if (name === 'BRAVE_SEARCH_API_KEY') return brave.keys()[0];
      if (name === 'BRAVE_SEARCH_API_KEY_2') return brave.keys()[1];
      return undefined;
    },
    // Exa keys live in the hub's key pool and may sit behind the Exa proxy (us: keys).
    exaSearch: async (body) => {
      if (!exaKeys.length) exaKeys = await exa.loadKeys();
      let last: Response | null = null;
      for (let tried = 0; tried < exaKeys.length; tried++) {
        const key = exaKeys[exaNext++ % exaKeys.length];
        try {
          const { url, headers } = exa.endpoint(key, 'search');
          const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
          if (res.ok || ![401, 402, 403, 429].includes(res.status)) return res;
          last = res;
        } catch { /* proxy not saved for a us: key: try the next key */ }
      }
      return last ?? new Response(JSON.stringify({ error: 'no usable Exa key' }), { status: 503 });
    },
  });
}

async function diveRow(diveId: number): Promise<any | null> {
  return (await reportdb.sql(`select * from company_dive where id = $1`, [diveId])).rows[0] ?? null;
}

/** Starts a company-dive through the hub's own public API, exactly as any caller would. */
async function startDive(company: string): Promise<{ id: number } | { error: string }> {
  const port = Number(process.env.PORT ?? 8080);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/company-dive`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + (process.env.LAB_TOKEN ?? ''), 'content-type': 'application/json' },
      body: JSON.stringify({ company, country: 'Malaysia' }),
    });
    const body = await res.json() as any;
    return res.ok && body.id ? { id: Number(body.id) } : { error: body.error ?? `company-dive answered HTTP ${res.status}` };
  } catch (e) {
    return { error: `could not start the company-dive: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------- the run

const waiting: number[] = [];
let active = false;
const DIVE_POLL_MS = 20_000;

async function execute(id: number): Promise<void> {
  const row = (await reportdb.sql<Row>(`select * from dive_deeper where id = $1`, [id])).rows[0];
  if (!row) return;
  const log = row.log ?? [];
  const say = async (stage: string, msg: string, extra: Partial<Row> = {}) => {
    log.push({ at: new Date().toISOString(), stage, msg });
    console.log(`[dive-deeper ${id}] ${stage}: ${msg}`);
    await update(id, { stage, log, ...extra }).catch((err) => console.error(`[dive-deeper ${id}] log write failed`, err));
  };
  try {
    configureKeys();
    if (!row.dive_id) throw new Error('no company-dive linked to this run');

    // 1. Wait for the company-dive (it runs in its own queue, one at a time).
    let dive = await diveRow(row.dive_id);
    if (dive && !['done', 'partial', 'failed'].includes(dive.status)) {
      await say('waiting_dive', `Waiting for company-dive #${row.dive_id} to finish`, { status: 'waiting_dive' });
      while (dive && !['done', 'partial', 'failed'].includes(dive.status)) {
        await new Promise((r) => setTimeout(r, DIVE_POLL_MS));
        dive = await diveRow(row.dive_id);
      }
    }
    if (!dive) throw new Error(`company-dive #${row.dive_id} not found`);
    if (dive.status === 'failed' || !dive.result) throw new Error(`company-dive #${row.dive_id} ${dive.status}: ${dive.error ?? 'no research saved'}`);

    // 2. Stage 1, then stage 2. Each lane's result is saved as soon as it lands.
    const diveKey = String(row.dive_id);
    stageDive(diveKey, dive);
    const lanes: Record<string, LaneResult> = {};
    await say('stage1', `Company-dive #${row.dive_id} is ${dive.status}; running stage 1`, { status: 'running', lanes });
    const one = async (section: string, lane: string) => {
      const r = await runLane(section, lane, diveKey, dive);
      lanes[`${section}-${lane}`] = r;
      await say('stage1', `${section}-${lane}: ${r.findings_count} findings${r.warnings.length ? `, ${r.warnings.length} warnings` : ''}`, { lanes });
    };
    const hMaps = one('H', 'maps');
    await Promise.all([
      hMaps,
      ...STAGE1_FIRST.filter(([s, l]) => !(s === 'H' && l === 'maps')).map(([s, l]) => one(s, l)),
      hMaps.then(() => Promise.all(STAGE1_AFTER_H.map(([s, l]) => one(s, l)))),
    ]);
    await say('stage2', 'Writing the consultation');
    const s2 = await runLane(STAGE2[0], STAGE2[1], diveKey, dive);
    lanes['S2-consult'] = s2;
    await say('stage3', 'Editing the report and taking screenshots');
    lanes['S3-editor'] = await runLane(STAGE3[0], STAGE3[1], diveKey, dive);

    // 3. The report.
    const html = buildReport(dive, lanes);
    const partial = Object.values(lanes).some((l) => l.status === 'partial');
    await say('done', `Report ready${partial ? ' (some sections partial)' : ''}`, {
      status: partial ? 'partial' : 'done', lanes, report_html: html, finished_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[dive-deeper ${id}] failed`, err);
    log.push({ at: new Date().toISOString(), stage: 'failed', msg: (err as Error).message });
    await update(id, { status: 'failed', stage: 'failed', error: (err as Error).message, log, finished_at: new Date().toISOString() });
  }
}

function pump(): void {
  if (active || !waiting.length) return;
  active = true;
  const id = waiting.shift()!;
  execute(id).finally(() => { active = false; pump(); });
}

/** Runs live only in this process, so one cut off by a restart is marked failed; Retry starts it again. */
export async function failInterrupted(): Promise<void> {
  if (!enabled() || !reportdb.configured()) return;
  await ensureTable();
  await reportdb.sql(`update dive_deeper set status = 'failed', stage = 'failed', error = 'interrupted by a restart', finished_at = now()
                       where status in ('queued', 'waiting_dive', 'running')`);
}

// ---------------------------------------------------------------- HTTP

type Ctx = {
  json: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
};

function links(req: http.IncomingMessage, publicId: string, divePublicId?: string | null): Record<string, string> {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0];
  const base = `${proto}://${req.headers['x-forwarded-host'] ?? req.headers.host}`;
  return { report_url: `${base}/dd/${publicId}`, ...(divePublicId ? { dive_report_url: `${base}/d/${divePublicId}`, preview_url: `${base}/dp/${divePublicId}` } : {}) };
}

/** What the preview's order page shows; set on the hub, all optional. */
const offer = (): Offer => ({ price: process.env.DD_PREVIEW_PRICE, contact: process.env.DD_PREVIEW_CONTACT, order_url: process.env.DD_PREVIEW_ORDER_URL });

/** /dp/<company-dive public id>: the free preview, built from the company-dive alone, before anything is paid for. */
async function handlePreview(res: http.ServerResponse, publicId: string): Promise<void> {
  const dive = (await reportdb.sql(`select id, public_id, company, status, stage, result, dossier, finished_at from company_dive where public_id = $1`, [publicId])).rows[0] as any;
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };
  if (!dive) { res.writeHead(404, headers); res.end('<!doctype html><title>Not found</title><p>No such preview.</p>'); return; }
  if (dive.result && ['done', 'partial'].includes(dive.status)) { res.writeHead(200, headers); res.end(buildPreview(dive, offer())); return; }
  const live = dive.status !== 'failed';
  res.writeHead(200, headers);
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${live ? '<meta http-equiv="refresh" content="20">' : ''}
<title>${esc(dive.company)} preview</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5;color:#111418}</style></head>
<body><h1>${esc(dive.company)}</h1><p>${live ? 'Your preview is being prepared. This page refreshes every 20 seconds.' : 'The research for this preview did not finish.'}</p><p style="color:#5c636d">${esc(dive.stage ?? dive.status)}</p></body></html>`);
}

/** The console page at /dive-deeper (a shell; its data comes from the token-guarded API). */
export function handlePage(req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean {
  if (!enabled() || req.method !== 'GET' || (url.pathname !== '/dive-deeper' && url.pathname !== '/dive-deeper/')) return false;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
  res.end(browsePage());
  return true;
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** /dd/<public id>: the report, or its live progress until it is ready. The opaque id is the share capability, like /d/. */
export async function handlePublic(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const pv = url.pathname.match(/^\/dp\/([A-Za-z0-9_-]{16,40})\/?$/);
  if (pv && enabled() && req.method === 'GET' && reportdb.configured()) { await handlePreview(res, pv[1]); return true; }
  const m = url.pathname.match(/^\/dd\/([A-Za-z0-9_-]{16,40})\/?$/);
  if (!enabled() || !m || req.method !== 'GET' || !reportdb.configured()) return false;
  await ensureTable();
  const row = (await reportdb.sql<Row>(`select id, public_id, company, dive_id, status, stage, log, report_html, error, created_at, finished_at from dive_deeper where public_id = $1`, [m[1]])).rows[0];
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };
  if (!row) { res.writeHead(404, headers); res.end('<!doctype html><title>Not found</title><p>No such report.</p>'); return true; }
  if (row.report_html) { res.writeHead(200, headers); res.end(row.report_html); return true; }
  const live = !['failed'].includes(row.status);
  res.writeHead(200, headers);
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${live ? '<meta http-equiv="refresh" content="20">' : ''}
<title>${esc(row.company)} report</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5;color:#15201b;background:#f5f7f4}li{margin:4px 0}.s{color:#56635c;font-size:14px}</style></head>
<body><h1>${esc(row.company)}</h1><p><b>${live ? 'The report is being prepared.' : 'This run failed.'}</b> ${live ? 'This page refreshes every 20 seconds.' : esc(row.error)}</p>
<p class="s">Status: ${esc(row.status)} · ${esc(row.stage)}</p><ul>${(row.log ?? []).slice(-15).reverse().map((l) => `<li><span class="s">${esc(new Date(l.at).toLocaleTimeString('en-GB'))}</span> ${esc(l.msg)}</li>`).join('')}</ul></body></html>`);
  return true;
}

/** /api/dive-deeper routes, behind the operator token. Returns false for any other path or when switched off. */
export async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
  const p = url.pathname;
  if (p !== '/api/dive-deeper' && !p.startsWith('/api/dive-deeper/')) return false;
  if (!enabled()) return false;
  if (!reportdb.configured()) { ctx.json(res, 503, { error: 'no report database configured' }); return true; }
  await ensureTable();
  const method = req.method ?? 'GET';

  if (p === '/api/dive-deeper' && method === 'GET') {
    const out = await reportdb.sql(`
      select d.id, d.public_id, d.company, d.dive_id, d.status, d.stage, d.error, d.created_at, d.finished_at,
             c.public_id as dive_public_id, c.status as dive_status
        from dive_deeper d left join company_dive c on c.id = d.dive_id
       order by d.id desc limit 200`);
    ctx.json(res, 200, { runs: out.rows.map((r: any) => ({ ...r, ...links(req, r.public_id, r.dive_public_id) })), active: active ? 1 : 0, queued: waiting.length });
    return true;
  }

  // Start a run: {company} starts a fresh company-dive first; {dive_id} reuses a finished one.
  if (p === '/api/dive-deeper' && method === 'POST') {
    const body = await ctx.readJson(req);
    const company = String(body.company ?? '').trim();
    let diveId = Number(body.dive_id ?? 0) || null;
    let name = company;
    if (diveId) {
      const d = await diveRow(diveId);
      if (!d) { ctx.json(res, 404, { error: `no company-dive #${diveId}` }); return true; }
      name = d.company;
    } else {
      if (company.length < 2 || company.length > 200) { ctx.json(res, 400, { error: 'company is required' }); return true; }
      const started = await startDive(company);
      if ('error' in started) { ctx.json(res, 502, { error: started.error }); return true; }
      diveId = started.id;
    }
    const publicId = newPublicId();
    const out = await reportdb.sql<{ id: string }>(
      `insert into dive_deeper (public_id, company, dive_id) values ($1, $2, $3) returning id`, [publicId, name, diveId]);
    const id = Number(out.rows[0].id);
    waiting.push(id);
    pump();
    ctx.json(res, 202, { id, public_id: publicId, company: name, dive_id: diveId, status: 'queued', queued_behind_another: waiting.includes(id), ...links(req, publicId) });
    return true;
  }

  const one = p.match(/^\/api\/dive-deeper\/(\d+)$/);
  if (one && method === 'GET') {
    const row = (await reportdb.sql<Row>(`select id, public_id, company, dive_id, status, stage, log, lanes, error, created_at, finished_at from dive_deeper where id = $1`, [Number(one[1])])).rows[0];
    if (!row) { ctx.json(res, 404, { error: 'no such run' }); return true; }
    const lanes = Object.fromEntries(Object.entries(row.lanes ?? {}).map(([k, v]) => [k, { status: v.status, findings: v.findings_count, warnings: v.warnings?.length ?? 0, first_warnings: (v.warnings ?? []).slice(0, 3).map((w) => w.slice(0, 240)), ms: v.ms }]));
    ctx.json(res, 200, { ...row, lanes, ...links(req, row.public_id) });
    return true;
  }

  // Retry a failed run: reuses its company-dive when that finished, else starts a new one.
  const retry = p.match(/^\/api\/dive-deeper\/(\d+)\/retry$/);
  if (retry && method === 'POST') {
    const id = Number(retry[1]);
    const row = (await reportdb.sql<Row>(`select id, company, dive_id, status from dive_deeper where id = $1`, [id])).rows[0];
    if (!row) { ctx.json(res, 404, { error: 'no such run' }); return true; }
    if (row.status !== 'failed') { ctx.json(res, 409, { error: `run is ${row.status}, not failed` }); return true; }
    let diveId = row.dive_id;
    const d = diveId ? await diveRow(diveId) : null;
    if (!d || d.status === 'failed') {
      const started = await startDive(row.company);
      if ('error' in started) { ctx.json(res, 502, { error: started.error }); return true; }
      diveId = started.id;
    }
    await update(id, { status: 'queued', stage: '', error: null, dive_id: diveId, lanes: {}, report_html: null, finished_at: null, log: [] });
    waiting.push(id);
    pump();
    ctx.json(res, 202, { id, status: 'queued', dive_id: diveId });
    return true;
  }

  ctx.json(res, 404, { error: 'not found', path: p });
  return true;
}

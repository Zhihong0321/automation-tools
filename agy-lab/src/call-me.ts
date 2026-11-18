// The public "Call me" page: a visitor leaves a name and/or company and a WhatsApp
// number, and we ask the separate voice service (VoxDock) to place ONE WhatsApp
// call from the Eternalgy Telemarketing AI Agent.
//
// Every request is recorded in call_me_request, whatever happened to it, with a
// status label. Nothing here throws at the visitor: a problem is labelled on the
// record and the visitor gets a friendly {ok, code, message}.
//
//   GET  /call-me            the page            (public, before the auth gate)
//   POST /call-me            ask for the call    (public, before the auth gate)
//   GET  /api/call-me-requests   latest 200 requests, for staff (behind LAB_TOKEN)
//
// Environment values read (values, not switches):
//   VOXDOCK_URL, VOXDOCK_TOKEN   the voice service; unset -> status `not_configured`
//   CALL_ME_IP_PEPPER            optional salt for the stored IP hash
import type http from 'node:http';
import crypto from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import * as reportdb from './reportdb.ts';
import { callMePage } from './call-me-page.ts';

export type Status =
  | 'pending' // transient: saved, call not decided yet (also guards concurrent submits)
  | 'requested' | 'busy' | 'limited' | 'invalid_number' | 'missing_name_or_company'
  | 'spam' | 'not_configured' | 'error';

export interface CallMeRow {
  id: string;
  created_at: string;
  name: string;
  company: string;
  whatsapp_e164: string | null;
  ip_hash: string;
  user_agent: string;
  status: Status;
  voxdock_call_id: string | null;
  detail: string | null;
}

export interface Store {
  insert(row: CallMeRow): Promise<void>;
  update(id: string, patch: { status: Status; voxdock_call_id?: string | null; detail?: string | null }): Promise<void>;
  /** Calls placed or possibly placed for this number since `sinceMs`, not counting `excludeId`. */
  countNumber(e164: string, sinceMs: number, excludeId: string): Promise<number>;
  /** Requests from this client since `sinceMs`, not counting `excludeId` or ones already turned away as limited. */
  countIp(ipHash: string, sinceMs: number, excludeId: string): Promise<number>;
  latest(limit: number): Promise<CallMeRow[]>;
}

export interface Deps {
  store: Store;
  fetch: typeof fetch;
  env: NodeJS.ProcessEnv;
  now: () => number;
  uuid: () => string;
}

export interface Outcome {
  ok: boolean;
  code: Status | 'bad_request';
  message: string;
  http: number;
}

export const LIMIT_PER_NUMBER = 2;
export const NUMBER_WINDOW_MS = 24 * 3600_000;
export const LIMIT_PER_IP = 5;
export const IP_WINDOW_MS = 3600_000;
const FIELD_MAX = 120;
const VOICE_TIMEOUT_MS = 10_000;
const BODY_MAX = 16 * 1024;

export const MESSAGES = {
  requested: 'Calling you now — please keep WhatsApp open and answer the call from Eternalgy.',
  busy: 'Our agent is on another call right now. Please try again in a few minutes.',
  invalid_number: 'That does not look like a valid WhatsApp mobile number. Please check it and try again.',
  missing_name_or_company: 'Please enter your name or your company name.',
  limited: 'You have already requested a call recently.',
  generic: 'We could not place the call right now. We saved your request.',
  bad_request: 'Please fill in the form and try again.',
} as const;

// ---- input cleaning -----------------------------------------------------

/** Trim, drop control characters, squeeze whitespace, cap the length. Never throws. */
export function cleanText(v: unknown, max = FIELD_MAX): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/**
 * A WhatsApp-capable mobile number as E.164, or null. Numbers without a leading
 * "+" are read as Malaysian; other countries only when typed with "+".
 */
export function normalizeWhatsapp(raw: unknown): string | null {
  try {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s || s.length > 40 || !/^[+\d\s().-]+$/.test(s)) return null;
    const p = parsePhoneNumberFromString(s, 'MY');
    if (!p || !p.isValid()) return null;
    const type = p.getType();
    if (type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') return null;
    return p.number;
  } catch {
    return null;
  }
}

export function ipHash(ip: string, env: NodeJS.ProcessEnv = process.env): string {
  const pepper = env.CALL_ME_IP_PEPPER?.trim() || 'eternalgy-call-me-pepper-v1';
  return crypto.createHash('sha256').update(`${pepper}|${ip}`).digest('hex');
}

/** The same source the request log uses: first x-forwarded-for entry. The socket address otherwise. */
export function clientIp(req: http.IncomingMessage): string {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return forwarded || req.socket?.remoteAddress || '';
}

// ---- storage ------------------------------------------------------------

/** Recent requests held in this process. Limits keep working when the database does not. */
export function memoryStore(): Store {
  const rows: CallMeRow[] = [];
  const find = (id: string) => rows.find((r) => r.id === id);
  return {
    async insert(row) {
      rows.push({ ...row });
      const cutoff = Date.parse(row.created_at) - NUMBER_WINDOW_MS; // relative to the newest row, so an injected clock works
      while (rows.length > 5000 || (rows[0] && Date.parse(rows[0].created_at) < cutoff)) rows.shift();
    },
    async update(id, patch) {
      const r = find(id);
      if (r) {
        r.status = patch.status;
        if (patch.voxdock_call_id !== undefined) r.voxdock_call_id = patch.voxdock_call_id;
        if (patch.detail !== undefined) r.detail = patch.detail;
      }
    },
    async countNumber(e164, sinceMs, excludeId) {
      return rows.filter((r) => r.whatsapp_e164 === e164 && r.id !== excludeId && Date.parse(r.created_at) >= sinceMs
        && (r.status === 'requested' || r.status === 'error' || r.status === 'pending')).length;
    },
    async countIp(hash, sinceMs, excludeId) {
      return rows.filter((r) => r.ip_hash === hash && r.id !== excludeId && Date.parse(r.created_at) >= sinceMs
        && r.status !== 'limited').length;
    },
    async latest(limit) {
      return rows.slice(-limit).reverse().map((r) => ({ ...r }));
    },
  };
}

export const TABLE_DDL = `
  create table if not exists call_me_request (
    id uuid primary key,
    created_at timestamptz not null default now(),
    name text not null default '',
    company text not null default '',
    whatsapp_e164 text,
    ip_hash text not null default '',
    user_agent text not null default '',
    status text not null,
    voxdock_call_id text,
    detail text
  );
  create index if not exists call_me_request_number_idx on call_me_request (whatsapp_e164, created_at desc);
  create index if not exists call_me_request_ip_idx on call_me_request (ip_hash, created_at desc);`;

let tableReady: Promise<unknown> | null = null;
function ensureTable(): Promise<unknown> {
  tableReady ??= reportdb.sql(TABLE_DDL).catch((err) => { tableReady = null; throw err; });
  return tableReady;
}

/**
 * Postgres plus the in-process copy. A database problem is logged and the
 * in-process copy carries on, so limits still hold and the visitor is still served.
 */
export function dbStore(mem: Store = memoryStore()): Store {
  const warn = (what: string, err: unknown) => console.warn(`[call-me] ${what}: ${(err as Error)?.message ?? err}`);
  const db = async <T>(what: string, fn: () => Promise<T>): Promise<T | undefined> => {
    if (!reportdb.configured()) return undefined;
    try { await ensureTable(); return await fn(); } catch (err) { warn(what, err); return undefined; }
  };
  return {
    async insert(row) {
      await mem.insert(row);
      await db('insert', () => reportdb.sql(
        `insert into call_me_request (id, created_at, name, company, whatsapp_e164, ip_hash, user_agent, status, voxdock_call_id, detail)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [row.id, row.created_at, row.name, row.company, row.whatsapp_e164, row.ip_hash, row.user_agent, row.status, row.voxdock_call_id, row.detail]));
    },
    async update(id, patch) {
      await mem.update(id, patch);
      await db('update', () => reportdb.sql(
        `update call_me_request set status = $2, voxdock_call_id = coalesce($3, voxdock_call_id), detail = coalesce($4, detail) where id = $1`,
        [id, patch.status, patch.voxdock_call_id ?? null, patch.detail ?? null]));
    },
    async countNumber(e164, sinceMs, excludeId) {
      const local = await mem.countNumber(e164, sinceMs, excludeId);
      const remote = await db('count number', async () => Number((await reportdb.sql<{ n: number }>(
        `select count(*)::int as n from call_me_request
          where whatsapp_e164 = $1 and created_at >= $2 and id <> $3 and status in ('requested', 'error', 'pending')`,
        [e164, new Date(sinceMs).toISOString(), excludeId])).rows[0]?.n ?? 0));
      return Math.max(local, remote ?? 0);
    },
    async countIp(hash, sinceMs, excludeId) {
      const local = await mem.countIp(hash, sinceMs, excludeId);
      const remote = await db('count ip', async () => Number((await reportdb.sql<{ n: number }>(
        `select count(*)::int as n from call_me_request
          where ip_hash = $1 and created_at >= $2 and id <> $3 and status <> 'limited'`,
        [hash, new Date(sinceMs).toISOString(), excludeId])).rows[0]?.n ?? 0));
      return Math.max(local, remote ?? 0);
    },
    async latest(limit) {
      const remote = await db('list', async () => (await reportdb.sql<CallMeRow>(
        `select id, created_at, name, company, whatsapp_e164, user_agent, status, voxdock_call_id, detail
           from call_me_request order by created_at desc limit $1`, [limit])).rows);
      return remote ?? await mem.latest(limit);
    },
  };
}

const sharedStore = dbStore();
const defaults = (): Deps => ({
  store: sharedStore,
  fetch: (...a) => fetch(...a),
  env: process.env,
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
});

// ---- the voice service --------------------------------------------------

interface VoiceResult { status: Status; call_id?: string | null; detail?: string }

/** Ask VoxDock for one call. Never throws; every failure comes back as a labelled result. */
export async function placeCall(
  d: Pick<Deps, 'fetch' | 'env'>,
  body: { request_ref: string; phone: string; name?: string; company?: string },
): Promise<VoiceResult> {
  const base = d.env.VOXDOCK_URL?.trim().replace(/\/+$/, '');
  const token = d.env.VOXDOCK_TOKEN?.trim();
  if (!base || !token) return { status: 'not_configured', detail: 'VOXDOCK_URL or VOXDOCK_TOKEN is not set' };
  try {
    const res = await d.fetch(`${base}/v1/visitor-calls`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
    });
    let data: Record<string, unknown> = {};
    try { data = (await res.json()) as Record<string, unknown>; } catch { /* body optional */ }
    const err = typeof data.error === 'string' ? data.error.slice(0, 80) : '';
    if (res.status >= 200 && res.status < 300) {
      const id = typeof data.call_id === 'string' || typeof data.call_id === 'number' ? String(data.call_id).slice(0, 100) : null;
      return { status: 'requested', call_id: id, ...(id ? {} : { detail: 'accepted without a call_id' }) };
    }
    if (res.status === 409) return { status: 'busy', detail: err || 'busy' };
    if (res.status === 429) return { status: 'limited', detail: err || 'phone_limit' };
    if (res.status === 400 && (err === 'name_or_company_required' || err === 'missing_name_or_company')) return { status: 'missing_name_or_company', detail: 'refused by voice service' };
    if (res.status === 400 && (err === 'invalid_phone' || err === 'invalid_number')) return { status: 'invalid_number', detail: 'refused by voice service' };
    return { status: 'error', detail: `voice service answered ${res.status}${err ? ` (${err})` : ''}` };
  } catch (e) {
    const name = (e as Error)?.name;
    return { status: 'error', detail: name === 'TimeoutError' || name === 'AbortError' ? 'voice service timed out' : `voice service unreachable (${String((e as Error)?.message ?? e).slice(0, 80)})` };
  }
}

// ---- the request --------------------------------------------------------

function outcome(status: Status): Outcome {
  switch (status) {
    case 'requested': case 'spam': return { ok: true, code: status === 'spam' ? 'requested' : status, message: MESSAGES.requested, http: 200 };
    case 'busy': return { ok: false, code: status, message: MESSAGES.busy, http: 409 };
    case 'invalid_number': return { ok: false, code: status, message: MESSAGES.invalid_number, http: 400 };
    case 'missing_name_or_company': return { ok: false, code: status, message: MESSAGES.missing_name_or_company, http: 400 };
    case 'limited': return { ok: false, code: status, message: MESSAGES.limited, http: 429 };
    default: return { ok: false, code: status === 'not_configured' ? status : 'error', message: MESSAGES.generic, http: 503 };
  }
}

/** Record one request and, if it qualifies, ask for the call. Always resolves with something to show the visitor. */
export async function submit(
  input: Record<string, unknown>,
  ctx: { ip: string; userAgent: string },
  overrides: Partial<Deps> = {},
): Promise<Outcome> {
  const d = { ...defaults(), ...overrides };
  const id = d.uuid();
  const name = cleanText(input.name);
  const company = cleanText(input.company);
  const row: CallMeRow = {
    id, created_at: new Date(d.now()).toISOString(), name, company, whatsapp_e164: null,
    ip_hash: ipHash(ctx.ip, d.env), user_agent: String(ctx.userAgent ?? '').slice(0, 200),
    status: 'pending', voxdock_call_id: null, detail: null,
  };
  const finish = async (status: Status, patch: { voxdock_call_id?: string | null; detail?: string | null } = {}): Promise<Outcome> => {
    row.status = status;
    try { await d.store.update(id, { status, ...patch }); } catch (e) { console.warn(`[call-me] could not save status ${status}: ${(e as Error)?.message}`); }
    return outcome(status);
  };
  const record = async (status: Status, detail: string | null): Promise<Outcome> => {
    row.status = status;
    row.detail = detail;
    try { await d.store.insert(row); } catch (e) { console.warn(`[call-me] could not save request: ${(e as Error)?.message}`); }
    return outcome(status);
  };

  try {
    const rawNumber = typeof input.whatsapp === 'string' ? input.whatsapp : '';
    // Honeypot: looks like success to a bot, but nothing is dialled.
    if (typeof input.website === 'string' ? input.website.trim() !== '' : Boolean(input.website)) {
      row.whatsapp_e164 = normalizeWhatsapp(rawNumber);
      return await record('spam', 'honeypot filled');
    }
    if (!name && !company) return await record('missing_name_or_company', null);
    const e164 = normalizeWhatsapp(rawNumber);
    if (!e164) return await record('invalid_number', `typed: ${cleanText(rawNumber, 40)}`);
    row.whatsapp_e164 = e164;

    // Saved first, as `pending`, so a second tab racing this one sees it in the count.
    row.status = 'pending';
    await d.store.insert(row);
    const now = d.now();
    const byNumber = await d.store.countNumber(e164, now - NUMBER_WINDOW_MS, id);
    if (byNumber >= LIMIT_PER_NUMBER) return await finish('limited', { detail: `number: ${byNumber} in 24h` });
    const byIp = await d.store.countIp(row.ip_hash, now - IP_WINDOW_MS, id);
    if (byIp >= LIMIT_PER_IP) return await finish('limited', { detail: `client: ${byIp} in 1h` });

    const result = await placeCall(d, {
      request_ref: id, phone: e164,
      ...(name ? { name } : {}), ...(company ? { company } : {}),
    });
    return await finish(result.status, { voxdock_call_id: result.call_id ?? null, detail: result.detail ?? null });
  } catch (e) {
    console.warn(`[call-me] request failed: ${(e as Error)?.message ?? e}`);
    return await finish('error', { detail: `server error: ${String((e as Error)?.message ?? e).slice(0, 100)}` });
  }
}

// ---- HTTP ---------------------------------------------------------------

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > BODY_MAX) return {};
    chunks.push(c as Buffer);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function send(res: http.ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
  res.end(body);
}

/** GET/POST /call-me. Public; mounted before the auth gate. Same-origin: no CORS headers are added. */
export async function handlePublic(
  req: http.IncomingMessage, res: http.ServerResponse, url: URL, overrides: Partial<Deps> = {},
): Promise<boolean> {
  if (url.pathname !== '/call-me' && url.pathname !== '/call-me/') return false;
  const method = req.method ?? 'GET';
  if (method === 'GET') { send(res, 200, 'text/html', callMePage()); return true; }
  if (method !== 'POST') return false;
  let out: Outcome;
  try {
    out = await submit(await readBody(req), { ip: clientIp(req), userAgent: String(req.headers['user-agent'] ?? '') }, overrides);
  } catch (e) {
    console.warn(`[call-me] ${(e as Error)?.message ?? e}`);
    out = outcome('error');
  }
  send(res, out.http, 'application/json', JSON.stringify({ ok: out.ok, code: out.code, message: out.message }));
  return true;
}

/** GET /api/call-me-requests: the latest 200, newest first, without the IP hash. Behind LAB_TOKEN. */
export async function handleApi(
  req: http.IncomingMessage, res: http.ServerResponse, url: URL,
  ctx: { json: (res: http.ServerResponse, status: number, body: unknown) => void },
  overrides: Partial<Deps> = {},
): Promise<boolean> {
  if ((req.method ?? 'GET') !== 'GET' || url.pathname !== '/api/call-me-requests') return false;
  const d = { ...defaults(), ...overrides };
  try {
    const rows = (await d.store.latest(200)).map(({ ip_hash: _ip, ...rest }) => rest);
    ctx.json(res, 200, { count: rows.length, requests: rows });
  } catch (e) {
    ctx.json(res, 200, { count: 0, requests: [], note: `could not read requests: ${String((e as Error)?.message ?? e).slice(0, 100)}` });
  }
  return true;
}

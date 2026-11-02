// Contact-form autopilot: the email campaign's first email, sent through the contact form on a
// lead's own website instead of from a mailbox. It ships OFF.
//
// Two parts, and the hub reads no website in either:
//   1. The form check runs on a PC. The Step 2 Worker (step2-worker/worker.ts) takes batches of
//      Malaysian lead websites (/api/form-scan/worker/take), runs the list step 2 form check on
//      its own line (list-step2.ts processLead: plain HTTP, no browser) and sends each verdict
//      back (/done): bot_can_submit, captcha, script_form, no_form, unreachable, ... One
//      contact_form_scan row per company; a batch a PC never answers is free again after its lease.
//      Target companies (email-autopilot.ts TARGET_CATEGORY) are handed out first.
//   2. Sending: the same commercial and industrial companies the email autopilot picks
//      (isTargetCompany), whose site the PC found bot_can_submit, never emailed and never tried
//      here. contact-form-delivery.ts opens a browser, fills the form with the first step of the
//      template chosen for forms and the fixed form sender (name, company, mobile, email), and
//      presses send. A website
//      shared by several leads (a directory, a head office) is skipped.
// Every lead tried is one contact_form_send row, claimed before the browser opens, so a lead is
// never sent twice, even across a redeploy. Weekdays in the email window (08:00 to 15:00 KL),
// up to per_day sends a day.
import type http from 'node:http';
import * as db from './reportdb.ts';
import * as templates from './email-templates.ts';
import { klNow, inWindow, isTargetCompany, TARGET_CATEGORY, SOLAR } from './email-autopilot.ts';
import { ELIGIBLE, sharedHosts, siteHost } from './site-emails.ts';
import type { FormStatus } from './list-step2.ts';
import type { DeliverInput, DeliverResult } from './contact-form-delivery.ts';

/** Who every form says it is from. */
export interface FormSender { name: string; company: string; phone: string; email: string }
/** template_id: the email template (Templates tab) whose first step goes into the form. */
export interface Settings { enabled: boolean; per_day: number; template_id: number | null; sender: FormSender }
export const DEFAULT_SENDER: FormSender = { name: 'Mr. Alex Gan', company: 'Eternalgy Sdn Bhd', phone: '01121000099', email: 'eternalgy@atap.solar' };
export const DEFAULTS: Settings = { enabled: false, per_day: 10, template_id: null, sender: DEFAULT_SENDER };

export function readSettings(raw: any): Settings {
  const s = raw?.sender ?? {};
  const field = (k: keyof FormSender) => String(s[k] ?? '').trim().slice(0, 120) || DEFAULT_SENDER[k];
  return {
    enabled: raw?.enabled === true,
    per_day: Math.round(Math.min(Math.max(Number(raw?.per_day) || DEFAULTS.per_day, 1), 100)),
    template_id: Number(raw?.template_id) > 0 ? Number(raw.template_id) : null,
    sender: { name: field('name'), company: field('company'), phone: field('phone'), email: /@/.test(String(s.email ?? '')) ? field('email') : DEFAULT_SENDER.email },
  };
}

/** What goes into a form: the chosen template's first step, already filled for the lead, and who it is from. */
export interface Message { template_id: number; template_name: string; subject: string; body: string; sender: DeliverInput['sender'] }
export interface Lead { company_id: string; company_name: string; category: string | null; website: string }

export interface Deps {
  /** The chosen template's first step for this lead, or why there is none. */
  message(lead: Lead): Promise<Message | string>;
  deliver(input: DeliverInput): Promise<DeliverResult>;
}

/** The outcomes that pressed send: they count toward the day and block the lead from email too. */
export const SENT = ['sent', 'submitted_unconfirmed'];
/** Leads tried per tick at most, so one tick never runs for hours on forms that turn out closed. */
const MAX_TRIES_PER_TICK = 30;

/** The JavaScript patterns in Postgres words: \b there is \y. */
const pg = (re: RegExp) => re.source.replace(/\\b/g, '\\y');
const TARGET_SQL = `c.category ~* '${pg(TARGET_CATEGORY).replace(/'/g, "''")}' and (coalesce(c.category, '') || ' ' || coalesce(c.name, '')) !~* '${pg(SOLAR).replace(/'/g, "''")}'`;

// ---- storage -----------------------------------------------------------------

let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  ready ??= db.migrate()
    .then(() => db.sql(`create table if not exists contact_form_send (
      company_id   bigint primary key references company_data(id) on delete cascade,
      company_name text,
      website      text,
      campaign_id  bigint,
      status       text not null,
      detail       text,
      form_url     text,
      filled       jsonb,
      screenshot   text,
      checked_at   timestamptz not null default now(),
      sent_at      timestamptz)`))
    .then(() => db.sql(`create index if not exists contact_form_send_sent_idx on contact_form_send (sent_at) where sent_at is not null`))
    .then(() => db.sql(`alter table contact_form_send add column if not exists template_id bigint`))
    // status is 'taken' while a PC has the site, then the form verdict.
    .then(() => db.sql(`create table if not exists contact_form_scan (
      company_id  bigint primary key references company_data(id) on delete cascade,
      status      text not null,
      url         text,
      detail      text,
      taken_by    text,
      taken_until timestamptz,
      checked_at  timestamptz)`))
    .then(() => db.sql(`create index if not exists contact_form_scan_status_idx on contact_form_scan (status)`))
    // A lead claimed by a hub that died mid-way is never retried: it may have been sent.
    .then(() => db.sql(`update contact_form_send set status = 'interrupted', detail = 'the hub restarted while this lead was worked; not retried in case it was sent' where status = 'checking' and checked_at < now() - interval '1 hour'`))
    .then(() => undefined, (err) => { ready = null; throw err; });
  return ready;
}

export async function getSettings(): Promise<Settings> {
  await ensureTables();
  const out = await db.sql<{ value: unknown }>(`select value from email_marketing_setting where key = 'form_autopilot'`);
  return readSettings({ ...DEFAULTS, ...(out.rows[0]?.value as object ?? {}) });
}

export async function saveSettings(patch: any): Promise<Settings> {
  const next = readSettings({ ...await getSettings(), ...patch });
  await db.sql(`insert into email_marketing_setting (key, value) values ('form_autopilot', $1::jsonb) on conflict (key) do update set value = excluded.value`, [JSON.stringify(next)]);
  return next;
}

/** Companies that got the message through a form: the email autopilot leaves them out. */
export async function sentCompanyIds(): Promise<Set<string>> {
  await ensureTables();
  return new Set((await db.sql<{ id: string }>(`select company_id::text as id from contact_form_send where sent_at is not null`)).rows.map((r) => r.id));
}

/** The next leads to send to: target companies whose form the PC found open, never emailed, never tried here. */
async function candidates(limit: number): Promise<Lead[]> {
  const rows = (await db.sql<Lead>(`
    select c.id::text as company_id, c.name as company_name, c.category, c.website
      from contact_form_scan s join company_data c on c.id = s.company_id
     where s.status = 'bot_can_submit' and ${ELIGIBLE} and ${TARGET_SQL}
       and not exists (select 1 from contact_form_send f where f.company_id = c.id)
       and not exists (select 1 from email_marketing_lead e where e.company_id = c.id)
     order by s.checked_at limit $1`, [limit])).rows;
  const shared = await sharedHosts();
  return rows.filter((r) => isTargetCompany(r) && !shared.has(siteHost(r.website) ?? ''));
}

const sentToday = async (day: string): Promise<number> => Number((await db.sql<{ n: number }>(
  `select count(*)::int as n from contact_form_send where sent_at is not null and (sent_at at time zone 'Asia/Kuala_Lumpur')::date = $1::date`, [day])).rows[0]?.n ?? 0);

// ---- the form check, on a PC ---------------------------------------------------

/** A PC's batch is its own this long; one it never answers is handed out again. */
const SCAN_LEASE_SECONDS = 900;
const SCAN_BATCH_MAX = 50;
const VERDICTS: FormStatus[] = ['bot_can_submit', 'captcha', 'script_form', 'no_form', 'unreachable', 'no_website', 'not_own_site'];

/** Websites for a PC to check: Malaysian leads with their own site, not checked yet, target companies first. */
export async function takeScan(worker: string, limit: number): Promise<Array<{ company_id: string; company_name: string; website: string }>> {
  await ensureTables();
  return (await db.sql<{ company_id: string; company_name: string; website: string }>(`
    with picked as (
      select c.id from company_data c
       where ${ELIGIBLE}
         and not exists (select 1 from contact_form_scan s where s.company_id = c.id and (s.status <> 'taken' or s.taken_until > now()))
       order by coalesce(${TARGET_SQL}, false) desc, c.id limit $3),
    claimed as (
      insert into contact_form_scan (company_id, status, taken_by, taken_until)
      select id, 'taken', $1, now() + make_interval(secs => $2) from picked
      on conflict (company_id) do update set taken_by = excluded.taken_by, taken_until = excluded.taken_until
       where contact_form_scan.status = 'taken' and contact_form_scan.taken_until < now()
      returning company_id)
    select c.id::text as company_id, c.name as company_name, c.website from company_data c join claimed on claimed.company_id = c.id`,
  [worker, SCAN_LEASE_SECONDS, limit])).rows;
}

/** A PC's verdict on one site. Kept only while the site is still taken, so a late answer never overwrites a newer one. */
export async function saveScan(worker: string, companyId: string, form: any): Promise<boolean> {
  if (!form || !VERDICTS.includes(form.status)) throw Object.assign(new Error('form is not a step-2 form verdict'), { code: 'bad_request' });
  await ensureTables();
  const out = await db.sql(`update contact_form_scan set status = $3, url = $4, detail = $5, taken_by = $2, taken_until = null, checked_at = now()
    where company_id = $1 and status = 'taken'`,
  [companyId, worker, form.status, typeof form.url === 'string' ? form.url.slice(0, 1000) : null, String(form.detail ?? '').slice(0, 1000)]);
  return out.rowCount === 1;
}

/** How far the PC check is: verdicts for every Malaysian site and for the target companies, and what is left. */
export async function scanCounts() {
  await ensureTables();
  const rows = (await db.sql<{ status: string; n: number; target: number }>(`
    select coalesce(s.status, 'not_checked') as status, count(*)::int as n, count(*) filter (where ${TARGET_SQL})::int as target
      from company_data c left join contact_form_scan s on s.company_id = c.id
     where ${ELIGIBLE} group by 1 order by 2 desc`)).rows;
  const all: Record<string, number> = {};
  const target: Record<string, number> = {};
  for (const r of rows) { all[r.status] = r.n; target[r.status] = r.target; }
  return { all, target };
}

type Ctx = { json: (res: http.ServerResponse, status: number, body: unknown) => void; readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>> };

/** The routes a PC worker's key reaches: take a batch of websites, send back each verdict. */
export async function handleWorker(req: http.IncomingMessage, res: http.ServerResponse, url: URL, { json, readJson }: Ctx): Promise<boolean> {
  const p = url.pathname;
  if (req.method !== 'POST' || (p !== '/api/form-scan/worker/take' && p !== '/api/form-scan/worker/done')) return false;
  if (!db.configured()) return json(res, 503, { error: 'no report database configured' }), true;
  try {
    const body = await readJson(req);
    const worker = String(body.worker ?? '').trim();
    if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(worker) || /^hub-/i.test(worker)) throw Object.assign(new Error('send a worker name: letters, digits, dot, dash'), { code: 'bad_request' });
    if (p.endsWith('/take')) {
      const limit = Math.min(SCAN_BATCH_MAX, Math.max(1, Math.floor(Number(body.limit) || 10)));
      return json(res, 200, { sites: await takeScan(worker, limit), leaseSeconds: SCAN_LEASE_SECONDS }), true;
    }
    const id = String(body.company_id ?? '');
    if (!/^\d+$/.test(id)) throw Object.assign(new Error('send {worker, company_id, form}'), { code: 'bad_request' });
    return json(res, 200, { saved: await saveScan(worker, id, body.form) }), true;
  } catch (cause) {
    const err = cause as Error & { code?: string };
    return json(res, err.code === 'bad_request' ? 400 : 500, { error: err.message }), true;
  }
}

// ---- one lead ------------------------------------------------------------------

export interface Tried { company_id: string; company_name: string; website: string; status: string; detail: string; form_url: string | null; sent: boolean; screenshot?: string | null }

/** Send the message through one lead's form. dry: fill but never press send, and keep no record. */
export async function tryLead(lead: Lead, deps: Deps, options: { dry?: boolean } = {}): Promise<Tried> {
  const base = { company_id: lead.company_id, company_name: lead.company_name, website: lead.website };
  const message = await deps.message(lead);
  if (typeof message === 'string') return { ...base, status: 'no_message', detail: message, form_url: null, sent: false };
  if (!options.dry) {
    const claim = await db.sql(`insert into contact_form_send (company_id, company_name, website, template_id, status) values ($1, $2, $3, $4, 'checking') on conflict (company_id) do nothing returning company_id`,
      [lead.company_id, lead.company_name, lead.website, message.template_id]);
    if (!claim.rows.length) return { ...base, status: 'already_tried', detail: 'this lead was tried before', form_url: null, sent: false };
  }
  const save = async (t: Tried, filled: unknown = null) => {
    if (!options.dry) await db.sql(`update contact_form_send set status = $2, detail = $3, form_url = $4, filled = $5::jsonb, screenshot = $6, checked_at = now(), sent_at = case when $7::boolean then now() end where company_id = $1`,
      [lead.company_id, t.status, t.detail.slice(0, 1000), t.form_url, JSON.stringify(filled), t.sent ? t.screenshot ?? null : null, t.sent]);
    return t;
  };
  try {
    const out = await deps.deliver({ lead: { company_name: lead.company_name, website: lead.website }, sender: message.sender, subject: message.subject, message: message.body, dry_run: options.dry });
    return save({ ...base, status: out.status, detail: out.detail, form_url: out.form_url, sent: SENT.includes(out.status), screenshot: out.screenshot }, out.filled);
  } catch (err) {
    return save({ ...base, status: 'failed', detail: (err as Error).message, form_url: null, sent: false });
  }
}

// ---- the run ---------------------------------------------------------------------

export interface RunResult { at: string; reason: string | null; checked: number; sent: number; tried: Array<Omit<Tried, 'screenshot'>> }
let last: RunResult | null = null;
export const lastResult = () => last;
let running = false;
/** The run going now, for the card: how many it means to send, sent and tried so far. */
let live: { target: number; sent: number; tried: number; started_at: string; manual: boolean } | null = null;

/**
 * Try leads until today's per_day sends are reached, or MAX_TRIES_PER_TICK leads were tried.
 * count: a run started by hand from the card, "send this many now": it ignores the switch, the
 * window and per_day, and tries up to twice count leads.
 */
export async function runOnce(deps: Deps, options: { force?: boolean; count?: number } = {}): Promise<RunResult> {
  const finish = (r: Omit<RunResult, 'at'>) => (last = { ...r, at: new Date().toISOString() });
  if (running) return finish({ reason: 'A run is already going.', checked: 0, sent: 0, tried: [] });
  running = true;
  try {
    const settings = await getSettings();
    if (!settings.enabled && !options.force && !options.count) return finish({ reason: 'Contact-form autopilot is off.', checked: 0, sent: 0, tried: [] });
    const already = options.count ? 0 : await sentToday(klNow().day);
    const target = options.count ?? settings.per_day;
    const maxTries = options.count ? options.count * 2 : MAX_TRIES_PER_TICK;
    if (already >= target) return finish({ reason: `Today's ${settings.per_day} are sent.`, checked: 0, sent: 0, tried: [] });
    live = { target: target - already, sent: 0, tried: 0, started_at: new Date().toISOString(), manual: Boolean(options.count) };
    const tried: RunResult['tried'] = [];
    let sent = 0;
    for (const lead of await candidates(maxTries * 2)) {
      if (already + sent >= target || tried.length >= maxTries) break;
      const { screenshot: _, ...t } = await tryLead(lead, deps);
      if (t.status === 'no_message') return finish({ reason: t.detail, checked: tried.length, sent, tried });
      tried.push(t);
      if (t.sent) sent++;
      live = { ...live, sent, tried: tried.length };
    }
    return finish({ reason: tried.length ? null : 'No open form is waiting: the PC has not found one that was not tried or emailed yet.', checked: tried.length, sent, tried });
  } finally {
    running = false;
    live = null;
  }
}

/** "Send this many now", from the card: starts in the background and answers at once; the card follows it. */
export function startNow(deps: Deps, count: number): { started: boolean; reason?: string } {
  if (running) return { started: false, reason: 'A run is already going.' };
  void runOnce(deps, { count }).then((r) => console.log(`[form-autopilot] send-now: sent ${r.sent} of ${count} (${r.checked} tried)${r.reason ? ': ' + r.reason : ''}`),
    (err: Error) => console.warn('[form-autopilot] send-now failed: ' + err.message));
  return { started: true };
}

/** The 10-minute check: switched on and inside the window, it sends until the day is full. */
export async function tick(deps: Deps): Promise<void> {
  if (!db.configured() || !inWindow()) return;
  if (!(await getSettings()).enabled) return;
  const r = await runOnce(deps);
  if (r.checked) console.log(`[form-autopilot] tried ${r.checked} forms, sent ${r.sent}`);
}

/** What the page shows: the switch, today, the PC check, the outcome counts and the latest tries. */
export async function status() {
  const settings = await getSettings();
  const day = klNow().day;
  const counts = Object.fromEntries((await db.sql<{ status: string; n: number }>(`select status, count(*)::int as n from contact_form_send group by 1 order by 2 desc`)).rows.map((r) => [r.status, r.n]));
  const recent = (await db.sql(`select company_id::text, company_name, website, status, detail, form_url, checked_at, sent_at from contact_form_send where status <> 'checking' order by checked_at desc limit 40`)).rows;
  const tpls = (await templates.list()).map((t) => ({ id: t.id, name: t.name }));
  return { settings, templates: tpls, in_window: inWindow(), sent_today: await sentToday(day), counts, scan: await scanCounts(), recent, last: last, live };
}

// ---- the list in the app -----------------------------------------------------------

/**
 * The websites the PC checked, for the Contact forms list. waiting: an open form at a target
 * company not tried or emailed yet; sent; tried (pressed nothing, or it failed); open: every open
 * form; captcha: forms behind a captcha, never sent by the hub.
 */
export const SITE_FILTERS = ['waiting', 'sent', 'tried', 'open', 'captcha'] as const;
const PAGE = 50;

export async function sites(opts: { filter?: string; search?: string; offset?: number }) {
  await ensureTables();
  const waiting = `s.status = 'bot_can_submit' and f.company_id is null and ${TARGET_SQL}
    and not exists (select 1 from email_marketing_lead e where e.company_id = c.id)`;
  const where: Record<(typeof SITE_FILTERS)[number], string> = {
    waiting,
    sent: `f.sent_at is not null`,
    tried: `f.company_id is not null and f.sent_at is null and f.status <> 'checking'`,
    open: `s.status = 'bot_can_submit'`,
    captcha: `s.status = 'captcha'`,
  };
  const filter = (SITE_FILTERS as readonly string[]).includes(opts.filter ?? '') ? opts.filter as keyof typeof where : 'waiting';
  const from = `from contact_form_scan s join company_data c on c.id = s.company_id left join contact_form_send f on f.company_id = c.id`;
  const counts = (await db.sql<Record<string, number>>(`select ${SITE_FILTERS.map((k) => `count(*) filter (where ${where[k]})::int as ${k}`).join(', ')} ${from}`)).rows[0];
  const search = String(opts.search ?? '').trim().slice(0, 100);
  const like = search ? ['%' + search.replace(/[\\%_]/g, (m) => '\\' + m) + '%'] : [];
  const match = (n: number) => (search ? ` and (c.name ilike $${n} or c.website ilike $${n})` : '');
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const total = Number((await db.sql<{ n: number }>(`select count(*)::int as n ${from} where ${where[filter]}${match(1)}`, like)).rows[0]?.n ?? 0);
  const rows = (await db.sql(`select c.id::text as company_id, c.name as company_name, c.category, c.website, s.status as form, s.url as form_url, s.detail as form_detail,
      f.status as send_status, f.detail as send_detail, f.sent_at, f.checked_at as tried_at
    ${from} where ${where[filter]}${match(2)} order by coalesce(f.checked_at, s.checked_at) desc nulls last, c.id offset $1 limit ${PAGE}`, [offset, ...like])).rows;
  return { filter, counts, total, offset, page_size: PAGE, rows };
}

/**
 * A dry run for a test: fills one form and returns its screenshot, never presses send and keeps
 * no record. With no company_id, the next lead whose form the PC found open.
 */
export async function test(deps: Deps, companyId?: string): Promise<Tried & { checked: number }> {
  await ensureTables();
  const leads = companyId
    ? (await db.sql<Lead>(`select id::text as company_id, name as company_name, category, website from company_data where id = $1`, [companyId])).rows
    : await candidates(5);
  let t: Tried | null = null;
  let checked = 0;
  for (const lead of leads) {
    checked++;
    t = await tryLead(lead, deps, { dry: true });
    if (t.status === 'dry_run' || t.status === 'no_message') break;
  }
  return { ...(t ?? { company_id: companyId ?? '', company_name: '', website: '', status: 'no_lead', detail: 'no open form found by the PC check yet', form_url: null, sent: false }), checked };
}

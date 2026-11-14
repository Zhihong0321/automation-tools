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
//   2. Sending runs on a PC too. The same commercial and industrial companies the email autopilot
//      picks (isTargetCompany), whose site the PC found bot_can_submit, never emailed and never
//      tried here; a website shared by several leads (a directory, a head office) is skipped. The
//      hub writes the first step of the template chosen for forms, with the fixed form sender
//      (name, company, mobile, email), into contact_form_send and hands it to the PC
//      (/api/form-send/worker/take); the PC's browser (contact-form-delivery.ts) fills the form,
//      presses send and reports the outcome, the boxes it filled and a screenshot (/done).
// The hub is the log: every send is one contact_form_send row, written before it leaves the hub,
// so a lead is never sent twice. A form a PC took and never answered is marked interrupted and
// never sent again. PCs send when "Send now" on the card asks for a number of forms, or when the
// switch is on. No daily cap and no time limit: forms go out at any hour of any day.
import type http from 'node:http';
import * as db from './reportdb.ts';
import * as templates from './email-templates.ts';
import { klNow, isTargetCompany, TARGET_CATEGORY, SOLAR } from './email-autopilot.ts';
import { ELIGIBLE, sharedHosts, siteHost } from './site-emails.ts';
import type { FormStatus } from './list-step2.ts';
import type { DeliverInput, DeliverResult, AssistField, AssistFill } from './contact-form-delivery.ts';
import { llm } from './core/index.ts';

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
    per_day: Math.round(Math.min(Math.max(Number(raw?.per_day) || DEFAULTS.per_day, 1), 20000)),
    template_id: Number(raw?.template_id) > 0 ? Number(raw.template_id) : null,
    sender: { name: field('name'), company: field('company'), phone: field('phone'), email: /@/.test(String(s.email ?? '')) ? field('email') : DEFAULT_SENDER.email },
  };
}

/** What goes into a form: the chosen template's first step, already filled for the lead, and who it is from. */
export interface Message { template_id: number; template_name: string; subject: string; body: string; sender: DeliverInput['sender'] }
export interface Lead { company_id: string; company_name: string; category: string | null; website: string }

/** The outcomes that pressed send: they count toward the day and block the lead from email too. */
export const SENT = ['sent', 'submitted_unconfirmed'];

/** The JavaScript patterns in Postgres words: \b there is \y. */
const pg = (re: RegExp) => re.source.replace(/\\b/g, '\\y');
const TARGET_SQL = `c.category ~* '${pg(TARGET_CATEGORY).replace(/'/g, "''")}' and (coalesce(c.category, '') || ' ' || coalesce(c.name, '')) !~* '${pg(SOLAR).replace(/'/g, "''")}'`;

/** True for a Malaysian lead. company_data also holds other countries' Maps leads (Surat hotels with +91 phones were sent forms on 3 Nov), and only a foreign country code tells them apart. */
export const MALAYSIAN_SQL = `not (coalesce(c.phone, '') ~ '^\\s*\\+' and coalesce(c.phone, '') !~ '^\\s*\\+\\s*60')`;

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
    // The log of each send: the exact subject and message, from whom, which PC, when it left the hub.
    .then(() => db.sql(`alter table contact_form_send add column if not exists subject text, add column if not exists message text,
      add column if not exists sender jsonb, add column if not exists taken_by text, add column if not exists taken_until timestamptz,
      add column if not exists claimed_at timestamptz`))
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
    .then(() => db.sql(`create index if not exists contact_form_send_checked_idx on contact_form_send (checked_at desc)`))
    .then(() => db.sql(`create index if not exists contact_form_send_claimed_idx on contact_form_send (claimed_at) where claimed_at is not null`))
    .then(() => db.sql(`create index if not exists contact_form_send_order_idx on contact_form_send (coalesce(sent_at, checked_at) desc)`))
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
  const shared = await sharedHosts();
  const out: Lead[] = [];
  // Read the waiting list a page at a time until enough pass the name and shared-site checks, or it ends.
  for (let offset = 0; out.length < limit; offset += 500) {
    const rows = (await db.sql<Lead>(`
      select c.id::text as company_id, c.name as company_name, c.category, c.website
        from contact_form_scan s join company_data c on c.id = s.company_id
       where s.status = 'bot_can_submit' and ${TARGET_SQL}
         and coalesce(c.lead_status, 'unassigned') <> 'do_not_call'
         and c.merged_into is null and coalesce(c.is_hidden, false) = false
         and not exists (select 1 from contact_form_send f where f.company_id = c.id)
         and not exists (select 1 from email_marketing_lead e where e.company_id = c.id)
       order by coalesce(s.checked_at, now()) desc, c.id desc limit 500 offset $1`, [offset])).rows;
    out.push(...rows.filter((r) => {
      const host = siteHost(r.website);
      return isTargetCompany(r) && Boolean(host) && !shared.has(host!);
    }));
    if (rows.length < 500) break;
  }
  return out.slice(0, limit);
}

const sentToday = async (day: string): Promise<number> => Number((await db.sql<{ n: number }>(
  `select count(*)::int as n from contact_form_send
    where sent_at >= ($1::date::timestamp at time zone 'Asia/Kuala_Lumpur')
      and sent_at < (($1::date + 1)::timestamp at time zone 'Asia/Kuala_Lumpur')`, [day])).rows[0]?.n ?? 0);

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
       where ${ELIGIBLE} and ${MALAYSIAN_SQL}
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
  return db.swr('formAutopilot:scanCounts', 30_000, async () => {
    const rows = (await db.sql<{ status: string; n: number; target: number }>(`
      select coalesce(s.status, 'not_checked') as status, count(*)::int as n, count(*) filter (where ${TARGET_SQL})::int as target
        from company_data c left join contact_form_scan s on s.company_id = c.id
       where ${ELIGIBLE} group by 1 order by 2 desc`)).rows;
    const all: Record<string, number> = {};
    const target: Record<string, number> = {};
    for (const r of rows) { all[r.status] = r.n; target[r.status] = r.target; }
    return { all, target };
  });
}

type Ctx = { json: (res: http.ServerResponse, status: number, body: unknown) => void; readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>> };

const WORKER_ROUTES = ['/api/form-scan/worker/take', '/api/form-scan/worker/done', '/api/form-send/worker/take', '/api/form-send/worker/done', '/api/form-send/worker/assist'];

// The uses a required box can get when the script could not place it: sender values, the subject, or a dash.
const ASSIST_USES = ['name', 'email', 'phone', 'company', 'website', 'subject', 'dash'];

/**
 * The LLM step: a PC sends the boxes its script could not place, and the LLM says which sender value
 * fits each one. Only boxes it was sent may be answered, only with the listed uses, so no new text
 * reaches a form. A bad or empty answer is an empty list and the script carries on.
 */
export async function assistFill(body: any): Promise<{ fills: AssistFill[] }> {
  const fields: AssistField[] = (Array.isArray(body.fields) ? body.fields : []).slice(0, 80).map((f: any) => ({
    id: String(f.id ?? ''), tag: String(f.tag ?? ''), type: String(f.type ?? ''), name: String(f.name ?? '').slice(0, 80),
    label: String(f.label ?? '').slice(0, 160), required: f.required === true, options: Array.isArray(f.options) ? f.options.slice(0, 30).map(String) : undefined,
  }));
  const boxes = fields.filter((f) => f.required && f.tag !== 'select' && f.type !== 'checkbox' && f.type !== 'radio');
  if (!boxes.length) return { fills: [] };
  const prompt = [
    "A solar company is sending its first message through the contact form on a Malaysian company's website.",
    'These required boxes could not be matched to a purpose by their label. For each, pick the one use that fits, from:',
    ASSIST_USES.join(', ') + '. "dash" when nothing fits. name = the sender\'s name, email, phone, company, website, subject.',
    'Reply with JSON only: {"fills":[{"id":"<box id>","use":"<use>"}]}. Use only the ids listed.',
    'Boxes: ' + JSON.stringify(boxes.map(({ id, tag, type, name, label }) => ({ id, tag, type, name, label }))),
    'Form submit button: ' + String(body.submit_text ?? '').slice(0, 80),
  ].join('\n');
  try {
    const answer = (await llm.chat(prompt, { step: 'form-assist', temperature: 0 })).answer;
    const json = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1));
    const ids = new Set(boxes.map((f) => f.id));
    const fills = (Array.isArray(json.fills) ? json.fills : []).filter((x: any) => ids.has(String(x?.id)) && ASSIST_USES.includes(String(x?.use)))
      .map((x: any) => ({ id: String(x.id), use: String(x.use) }));
    return { fills };
  } catch {
    return { fills: [] };
  }
}

/** The routes a PC worker's key reaches: websites to check and their verdicts; forms to send and their outcomes. */
export async function handleWorker(req: http.IncomingMessage, res: http.ServerResponse, url: URL, { json, readJson }: Ctx): Promise<boolean> {
  const p = url.pathname;
  if (req.method !== 'POST' || !WORKER_ROUTES.includes(p)) return false;
  if (!db.configured()) return json(res, 503, { error: 'no report database configured' }), true;
  try {
    const body = await readJson(req);
    const worker = String(body.worker ?? '').trim();
    if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(worker) || /^hub-/i.test(worker)) throw Object.assign(new Error('send a worker name: letters, digits, dot, dash'), { code: 'bad_request' });
    const sending = p.startsWith('/api/form-send/');
    if (p.endsWith('/assist')) return json(res, 200, await assistFill(body)), true;
    if (p.endsWith('/take')) {
      if (sending) return json(res, 200, { forms: await takeSend(worker, Math.min(5, Math.max(1, Math.floor(Number(body.limit) || 1)))), leaseSeconds: SEND_LEASE_SECONDS }), true;
      const limit = Math.min(SCAN_BATCH_MAX, Math.max(1, Math.floor(Number(body.limit) || 10)));
      return json(res, 200, { sites: await takeScan(worker, limit), leaseSeconds: SCAN_LEASE_SECONDS }), true;
    }
    const id = String(body.company_id ?? '');
    if (!/^\d+$/.test(id)) throw Object.assign(new Error(sending ? 'send {worker, company_id, result}' : 'send {worker, company_id, form}'), { code: 'bad_request' });
    if (sending) return json(res, 200, { saved: await saveSend(worker, id, body.result) }), true;
    return json(res, 200, { saved: await saveScan(worker, id, body.form) }), true;
  } catch (cause) {
    const err = cause as Error & { code?: string };
    return json(res, err.code === 'bad_request' ? 400 : 500, { error: err.message }), true;
  }
}

// ---- the message ---------------------------------------------------------------

/** The chosen template, filled for one lead, from the form sender: a function, or why there is none. */
async function composer(): Promise<((lead: Lead) => Message) | string> {
  const settings = await getSettings();
  if (!settings.template_id) return 'Choose the template for contact forms first.';
  const [list, saved] = await Promise.all([templates.list(), templates.getSender()]);
  const tpl = list.find((t) => t.id === settings.template_id);
  const first = tpl?.steps[0];
  if (!tpl) return 'The template chosen for contact forms was deleted. Choose another.';
  if (!first?.body.trim()) return `The template "${tpl.name}" has no email yet.`;
  const s = settings.sender;
  // The form sender's name and mobile stand in for the email sender's in {{sender_name}} and {{sender_phone}}.
  const profile = { ...saved, sender_name: s.name, sender_phone: s.phone };
  const sender = { name: s.name, email: s.email, phone: s.phone, company: s.company, website: 'https://eternalgy.me' };
  return (lead) => {
    const fields = { company_name: lead.company_name, category: lead.category ?? '' };
    return { template_id: tpl.id, template_name: tpl.name, subject: templates.render(first.subject, profile, fields), body: templates.render(first.body, profile, fields), sender };
  };
}

// ---- sending, on a PC ------------------------------------------------------------

/** A form a PC took and never answered for this long is marked interrupted, never sent again. */
const SEND_LEASE_SECONDS = 1200;
const STATUSES = ['sent', 'submitted_unconfirmed', 'dry_run', 'captcha', 'no_form', 'not_own_site', 'site_unreachable', 'failed'];
/** When each PC last asked for forms to send, so the card can say whether one is on. */
const senders = new Map<string, number>();
let lastProblem: string | null = null;

/** A "send this many now" from the card, kept in the database so a redeploy does not lose it. started_at may be later: a scheduled start. */
type Run = { goal: number; started_at: string };
async function getRun(): Promise<Run | null> {
  const v = (await db.sql<{ value: Run }>(`select value from email_marketing_setting where key = 'form_send_run'`)).rows[0]?.value;
  return v && v.goal > 0 ? v : null;
}
async function setRun(run: Run | null): Promise<void> {
  if (!run) { await db.sql(`delete from email_marketing_setting where key = 'form_send_run'`); return; }
  await db.sql(`insert into email_marketing_setting (key, value) values ('form_send_run', $1::jsonb) on conflict (key) do update set value = excluded.value`, [JSON.stringify(run)]);
}

/** Starts "send this many", now or at startAt: PCs take them on their first ask after it, whatever the switch. */
export async function startRun(count: number, startAt?: Date): Promise<Run> {
  await ensureTables();
  const run = { goal: count, started_at: (startAt ?? new Date()).toISOString() };
  await setRun(run);
  lastProblem = null;
  return run;
}
export const stopRun = async () => { await ensureTables(); await setRun(null); };

/** The run's progress: sent and tried since it started, and forms a PC is filling now. */
async function runProgress(run: Run) {
  const r = (await db.sql<{ sent: number; tried: number; sending: number }>(`select count(*) filter (where sent_at is not null)::int as sent,
      count(*)::int as tried, count(*) filter (where status = 'sending')::int as sending
    from contact_form_send where claimed_at >= $1::timestamptz`, [run.started_at])).rows[0]!;
  return { ...run, ...r };
}

/** Forms one PC asks for at a time (the take route allows at most this many). */
const FORM_TAKE_MAX = 5;

/** How many forms PCs may take now: the run from the card, or the switch. No daily cap and no time limit. */
async function wanted(): Promise<number> {
  await db.sql(`update contact_form_send set status = 'interrupted', detail = 'the PC stopped answering while sending this form; not sent again in case it went through', taken_until = null
    where status = 'sending' and taken_until < now()`);
  const run = await getRun();
  if (run && Date.parse(run.started_at) <= Date.now()) {
    const p = await runProgress(run);
    // Up to twice the goal is tried: some forms turn out closed in the browser.
    if (p.sent < run.goal && p.tried < run.goal * 2) return Math.max(0, Math.min(run.goal - p.sent, run.goal * 2 - p.tried) - p.sending);
    if (!p.sending) await setRun(null);
  }
  const settings = await getSettings();
  if (!settings.enabled) return 0;
  // No daily cap and no cap on forms in flight: each PC lane asks for one form at a time.
  return FORM_TAKE_MAX;
}

export interface SendJob { company_id: string; company_name: string; website: string; subject: string; body: string; sender: DeliverInput['sender'] }

/**
 * Forms for a PC to send now. Each is written to contact_form_send before it leaves the hub (which
 * company and site, the exact subject and message, from whom, when, to which PC), so the hub's log
 * has every send even if the PC never answers; the PC's answer adds the outcome.
 */
export function takeSend(worker: string, limit: number): Promise<SendJob[]> {
  // One take at a time: four PC lanes that read the same candidates at once would all lose the claim
  // race, and an empty answer would wrongly end the run ("no open form is left").
  const run = takeChain.then(() => takeSendNow(worker, limit));
  takeChain = run.catch(() => {});
  return run;
}
let takeChain: Promise<unknown> = Promise.resolve();

async function takeSendNow(worker: string, limit: number): Promise<SendJob[]> {
  await ensureTables();
  senders.set(worker, Date.now());
  const n = Math.min(limit, await wanted());
  if (n <= 0) return [];
  const compose = await composer();
  lastProblem = typeof compose === 'string' ? compose : null;
  if (typeof compose === 'string') return [];
  const out: SendJob[] = [];
  for (const lead of await candidates(n * 3)) {
    if (out.length >= n) break;
    const m = compose(lead);
    const claim = await db.sql(`insert into contact_form_send (company_id, company_name, website, template_id, status, subject, message, sender, taken_by, taken_until, claimed_at, checked_at)
      values ($1, $2, $3, $4, 'sending', $5, $6, $7::jsonb, $8, now() + make_interval(secs => $9), now(), now()) on conflict (company_id) do nothing returning company_id`,
    [lead.company_id, lead.company_name, lead.website, m.template_id, m.subject, m.body, JSON.stringify(m.sender), worker, SEND_LEASE_SECONDS]);
    if (claim.rows.length) out.push({ company_id: lead.company_id, company_name: lead.company_name, website: lead.website, subject: m.subject, body: m.body, sender: m.sender });
  }
  const run = await getRun();
  // Nothing ready right now is not the end: the PCs are still checking websites and more open forms come in.
  // The run ends only when no target company is left to check or to send to; otherwise it waits for the next take.
  if (!out.length && run && Date.parse(run.started_at) <= Date.now()) {
    const left = await scanCounts().then((s) => (s.target.not_checked ?? 0) + (s.target.taken ?? 0)).catch(() => 0);
    const waiting = (await candidates(1)).length;
    if (waiting > 0) {
      lastProblem = null;
    } else if (left > 0) {
      lastProblem = `Waiting: no open form is ready yet; the PCs are still checking ${left} target websites.`;
    } else {
      lastProblem = 'Finished: no target company is left to send to.';
      await setRun(null);
    }
  }
  return out;
}

/** A PC's outcome for one form it was given. A late answer for an interrupted form is kept too: it is the truth. */
export async function saveSend(worker: string, companyId: string, r: any): Promise<boolean> {
  if (!r || !STATUSES.includes(r.status)) throw Object.assign(new Error('result is not a contact-form delivery result'), { code: 'bad_request' });
  await ensureTables();
  const sent = SENT.includes(r.status);
  const out = await db.sql(`update contact_form_send set status = $3, detail = $4, form_url = $5, filled = $6::jsonb, screenshot = $7, checked_at = now(),
      sent_at = case when $8::boolean then now() end, taken_until = null
    where company_id = $1 and taken_by = $2 and status in ('sending', 'interrupted')`,
  [companyId, worker, r.status, String(r.detail ?? '').slice(0, 1000), typeof r.form_url === 'string' ? r.form_url.slice(0, 1000) : null,
    JSON.stringify(Array.isArray(r.filled) ? r.filled.slice(0, 40) : null), typeof r.screenshot === 'string' && r.screenshot.length < 3_000_000 ? r.screenshot : null, sent]);
  return out.rowCount === 1;
}

// ---- the card ------------------------------------------------------------------------

/** What the page shows: the switch, today, the run, the PCs, the PC check, the outcome counts and the latest tries. */
export async function status() {
  await ensureTables();
  const day = klNow().day;
  const [settings, countsOut, recentOut, tplRows, run, sentCount, scan] = await Promise.all([
    getSettings(),
    db.sql<{ status: string; n: number }>(`select status, count(*)::int as n from contact_form_send group by 1 order by 2 desc`),
    db.sql(`select company_id::text, company_name, website, status, detail, form_url, subject, message, taken_by, checked_at, sent_at
      from contact_form_send order by checked_at desc limit 40`),
    templates.list(),
    getRun(),
    sentToday(day),
    scanCounts(),
  ]);
  const counts = Object.fromEntries(countsOut.rows.map((r) => [r.status, r.n]));
  const tpls = tplRows.map((t) => ({ id: t.id, name: t.name }));
  const pcs = [...senders].map(([name, at]) => ({ name, seen_at: new Date(at).toISOString() }));
  return { settings, templates: tpls, sent_today: sentCount, counts, run: run && await runProgress(run), senders: pcs, problem: lastProblem, scan, recent: recentOut.rows };
}

// ---- a preview -----------------------------------------------------------------------

export interface Tried { company_id: string; company_name: string; website: string; status: string; detail: string; form_url: string | null; sent: boolean; screenshot?: string | null }

/**
 * "Test one, no send": the hub's browser fills one form and returns its screenshot. It never
 * presses send and keeps no record. With no company_id, the next lead whose form the PC found open.
 */
export async function test(deliver: (input: DeliverInput) => Promise<DeliverResult>, companyId?: string): Promise<Tried & { checked: number }> {
  await ensureTables();
  const compose = await composer();
  const leads = companyId
    ? (await db.sql<Lead>(`select id::text as company_id, name as company_name, category, website from company_data where id = $1`, [companyId])).rows
    : await candidates(5);
  let t: Tried | null = null;
  let checked = 0;
  for (const lead of leads) {
    checked++;
    const base = { company_id: lead.company_id, company_name: lead.company_name, website: lead.website };
    if (typeof compose === 'string') { t = { ...base, status: 'no_message', detail: compose, form_url: null, sent: false }; break; }
    const m = compose(lead);
    const out = await deliver({ lead: { company_name: lead.company_name, website: lead.website }, sender: m.sender, subject: m.subject, message: m.body, dry_run: true });
    t = { ...base, status: out.status, detail: out.detail, form_url: out.form_url, sent: false, screenshot: out.screenshot };
    if (t.status === 'dry_run') break;
  }
  return { ...(t ?? { company_id: companyId ?? '', company_name: '', website: '', status: 'no_lead', detail: 'no open form found by the PC check yet', form_url: null, sent: false }), checked };
}

// ---- the sent report ------------------------------------------------------------------

/** A send's day in Kuala Lumpur: when it was sent, else when it left the hub. */
const SEND_DAY = `(coalesce(sent_at, claimed_at, checked_at) at time zone 'Asia/Kuala_Lumpur')::date`;

/**
 * The sent report: totals (today, 7 days, all), one line per day for the last 60 days, and every
 * send of one day (or all), newest first, with the exact message, sender, PC and boxes filled.
 */
export async function report(opts: { day?: string; offset?: number }) {
  await ensureTables();
  const count = (where: string) => `count(*) filter (where ${where})::int`;
  const outcome = `${count(`status = 'sent'`)} as sent, ${count(`status = 'submitted_unconfirmed'`)} as unconfirmed,
    ${count(`status = 'sending'`)} as sending, ${count(`status not in ('sent', 'submitted_unconfirmed', 'sending')`)} as other, count(*)::int as tried`;
  const today = `(now() at time zone 'Asia/Kuala_Lumpur')::date`;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(opts.day ?? '') ? opts.day! : null;
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const where = day ? `where ${SEND_DAY} = $2::date` : '';
  const params: unknown[] = day ? [offset, day] : [offset];
  const [totalsOut, daysOut, totalOut, rowsOut, run] = await Promise.all([
    db.sql(`select
      ${count(`${SEND_DAY} = ${today} and sent_at is not null`)} as today, ${count(`${SEND_DAY} > ${today} - 7 and sent_at is not null`)} as week,
      ${count(`sent_at is not null`)} as all_sent, count(*)::int as all_tried from contact_form_send`),
    db.sql(`select to_char(${SEND_DAY}, 'YYYY-MM-DD') as day, ${outcome} from contact_form_send group by 1 order by 1 desc limit 60`),
    db.sql<{ n: number }>(`select count(*)::int as n from contact_form_send ${where.replace('$2', '$1')}`, day ? [day] : []),
    db.sql(`select company_id::text, company_name, website, form_url, status, detail, subject, message, sender, filled, taken_by,
      claimed_at, sent_at, checked_at, screenshot is not null as has_screenshot
      from contact_form_send ${where} order by coalesce(sent_at, checked_at) desc offset $1 limit ${PAGE}`, params),
    getRun().then((r) => (r ? runProgress(r) : null)),
  ]);
  const totals = totalsOut.rows[0];
  const days = daysOut.rows;
  const total = Number(totalOut.rows[0]?.n ?? 0);
  const rows = rowsOut.rows;
  return { totals, days, day, total, offset, page_size: PAGE, rows, run };
}

/** One send's screenshot, as the PC took it after pressing send. */
export async function screenshot(companyId: string): Promise<string | null> {
  await ensureTables();
  return (await db.sql<{ screenshot: string | null }>(`select screenshot from contact_form_send where company_id = $1`, [companyId])).rows[0]?.screenshot ?? null;
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
  const search = String(opts.search ?? '').trim().slice(0, 100);
  const like = search ? ['%' + search.replace(/[\\%_]/g, (m) => '\\' + m) + '%'] : [];
  const match = (n: number) => (search ? ` and (c.name ilike $${n} or c.website ilike $${n})` : '');
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const [counts, totalOut, rowsOut] = await Promise.all([
    db.swr('formAutopilot:siteCounts', 30_000, async () =>
      (await db.sql<Record<string, number>>(`select ${SITE_FILTERS.map((k) => `count(*) filter (where ${where[k]})::int as ${k}`).join(', ')} ${from}`)).rows[0]),
    db.sql<{ n: number }>(`select count(*)::int as n ${from} where ${where[filter]}${match(1)}`, like),
    db.sql(`select c.id::text as company_id, c.name as company_name, c.category, c.website, s.status as form, s.url as form_url, s.detail as form_detail,
      f.status as send_status, f.detail as send_detail, f.sent_at, f.checked_at as tried_at, f.subject, f.message, f.taken_by
      ${from} where ${where[filter]}${match(2)} order by coalesce(f.checked_at, s.checked_at) desc nulls last, c.id offset $1 limit ${PAGE}`, [offset, ...like]),
  ]);
  return { filter, counts, total: Number(totalOut.rows[0]?.n ?? 0), offset, page_size: PAGE, rows: rowsOut.rows };
}

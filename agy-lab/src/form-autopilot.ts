// Contact-form autopilot: the email campaign's first email, sent through the contact form on a
// lead's own website instead of from a mailbox. It ships OFF.
//
// Who is picked: the same Malaysian commercial and industrial companies the email autopilot
// picks (email-autopilot.ts isTargetCompany), but by website, not email: a lead with its own
// site, not do-not-call, never emailed by a campaign and never tried here before. A website
// shared by several leads (a directory, a head office) is skipped.
// Per lead, in two steps:
//   1. the form check of list step 2 (list-step2.ts processLead, plain HTTP, no browser, in its
//      own thread): bot_can_submit, captcha, script_form, no_form, unreachable, ...
//   2. only on bot_can_submit, contact-form-delivery.ts opens a browser, fills the form with the
//      campaign's step-1 subject and body and the campaign mailbox as the sender, and presses send.
// Every lead tried is one contact_form_send row, claimed before anything is read, so a lead is
// never sent twice, even across a redeploy. Weekdays in the email window (08:00 to 15:00 KL),
// up to per_day sends a day.
import * as db from './reportdb.ts';
import { klNow, inWindow, isTargetCompany, TARGET_CATEGORY } from './email-autopilot.ts';
import { ELIGIBLE, sharedHosts, siteHost } from './site-emails.ts';
import { makeReader, type FormVerdict } from './list-step2.ts';
import type { DeliverInput, DeliverResult } from './contact-form-delivery.ts';

export interface Settings { enabled: boolean; per_day: number }
export const DEFAULTS: Settings = { enabled: false, per_day: 10 };

export function readSettings(raw: any): Settings {
  return { enabled: raw?.enabled === true, per_day: Math.round(Math.min(Math.max(Number(raw?.per_day) || DEFAULTS.per_day, 1), 100)) };
}

/** What goes into a form: the campaign's step 1, already filled for the lead, and who it is from. */
export interface Message { campaign_id: number; campaign_name: string; subject: string; body: string; sender: DeliverInput['sender'] }
export interface Lead { company_id: string; company_name: string; category: string | null; website: string }

export interface Deps {
  /** The campaign's step 1 for this lead, or why there is none. */
  message(lead: Lead): Promise<Message | string>;
  scan(lead: Lead): Promise<FormVerdict>;
  deliver(input: DeliverInput): Promise<DeliverResult>;
}

/** The outcomes that pressed send: they count toward the day and block the lead from email too. */
export const SENT = ['sent', 'submitted_unconfirmed'];
/** Leads checked per tick at most, so one tick never runs for hours on a list of closed forms. */
const MAX_CHECKS_PER_TICK = 60;

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

/** The next leads to try: target companies with their own website, never emailed, never tried here. */
async function candidates(limit: number): Promise<Lead[]> {
  const rows = (await db.sql<Lead>(`
    select c.id::text as company_id, c.name as company_name, c.category, c.website from company_data c
     where ${ELIGIBLE} and c.category ~* $1
       and not exists (select 1 from contact_form_send f where f.company_id = c.id)
       and not exists (select 1 from email_marketing_lead e where e.company_id = c.id)
     order by c.id limit $2`,
  // The JavaScript pattern in Postgres words: \b there is \y.
  [TARGET_CATEGORY.source.replace(/\\b/g, '\\y'), limit])).rows;
  const shared = await sharedHosts();
  return rows.filter((r) => isTargetCompany(r) && !shared.has(siteHost(r.website) ?? ''));
}

const sentToday = async (day: string): Promise<number> => Number((await db.sql<{ n: number }>(
  `select count(*)::int as n from contact_form_send where sent_at is not null and (sent_at at time zone 'Asia/Kuala_Lumpur')::date = $1::date`, [day])).rows[0]?.n ?? 0);

// ---- one lead ------------------------------------------------------------------

export interface Tried { company_id: string; company_name: string; website: string; status: string; detail: string; form_url: string | null; sent: boolean; screenshot?: string | null }

/** Check one lead's form and, when a bot may submit it, send the message. dry: fill but never press send, and keep no record. */
export async function tryLead(lead: Lead, deps: Deps, options: { dry?: boolean } = {}): Promise<Tried> {
  const base = { company_id: lead.company_id, company_name: lead.company_name, website: lead.website };
  const message = await deps.message(lead);
  if (typeof message === 'string') return { ...base, status: 'no_message', detail: message, form_url: null, sent: false };
  if (!options.dry) {
    const claim = await db.sql(`insert into contact_form_send (company_id, company_name, website, campaign_id, status) values ($1, $2, $3, $4, 'checking') on conflict (company_id) do nothing returning company_id`,
      [lead.company_id, lead.company_name, lead.website, message.campaign_id]);
    if (!claim.rows.length) return { ...base, status: 'already_tried', detail: 'this lead was tried before', form_url: null, sent: false };
  }
  const save = async (t: Tried, filled: unknown = null) => {
    if (!options.dry) await db.sql(`update contact_form_send set status = $2, detail = $3, form_url = $4, filled = $5::jsonb, screenshot = $6, checked_at = now(), sent_at = case when $7::boolean then now() end where company_id = $1`,
      [lead.company_id, t.status, t.detail.slice(0, 1000), t.form_url, JSON.stringify(filled), t.sent ? t.screenshot ?? null : null, t.sent]);
    return t;
  };
  try {
    const form = await deps.scan(lead);
    if (form.status !== 'bot_can_submit') return save({ ...base, status: form.status, detail: form.detail, form_url: form.url, sent: false });
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

/** Try leads until today's per_day sends are reached, or MAX_CHECKS_PER_TICK leads were checked. */
export async function runOnce(deps: Deps, options: { force?: boolean } = {}): Promise<RunResult> {
  const finish = (r: Omit<RunResult, 'at'>) => (last = { ...r, at: new Date().toISOString() });
  if (running) return finish({ reason: 'A run is already going.', checked: 0, sent: 0, tried: [] });
  running = true;
  try {
    const settings = await getSettings();
    if (!settings.enabled && !options.force) return finish({ reason: 'Contact-form autopilot is off.', checked: 0, sent: 0, tried: [] });
    let done = await sentToday(klNow().day);
    if (done >= settings.per_day) return finish({ reason: `Today's ${settings.per_day} are sent.`, checked: 0, sent: 0, tried: [] });
    const tried: RunResult['tried'] = [];
    let sent = 0;
    for (const lead of await candidates(MAX_CHECKS_PER_TICK * 2)) {
      if (done >= settings.per_day || tried.length >= MAX_CHECKS_PER_TICK) break;
      const { screenshot: _, ...t } = await tryLead(lead, deps);
      if (t.status === 'no_message') return finish({ reason: t.detail, checked: tried.length, sent, tried });
      tried.push(t);
      if (t.sent) { done++; sent++; }
    }
    return finish({ reason: tried.length ? null : 'No lead is left to try: every target company with a website was tried or emailed.', checked: tried.length, sent, tried });
  } finally {
    running = false;
  }
}

/** The 10-minute check: switched on and inside the window, it sends until the day is full. */
export async function tick(deps: Deps): Promise<void> {
  if (!db.configured() || !inWindow()) return;
  if (!(await getSettings()).enabled) return;
  const r = await runOnce(deps);
  if (r.checked) console.log(`[form-autopilot] checked ${r.checked} sites, sent ${r.sent}`);
}

/** The reader every scan shares: one thread, replaced when a page stalls it. */
let reader: ReturnType<typeof makeReader> | null = null;
export async function scan(lead: Lead): Promise<FormVerdict> {
  reader ??= makeReader();
  const out = await reader.read({ business: { name: lead.company_name, website: lead.website }, contact: null, country: 'Malaysia' });
  return out.form;
}

/** What the page shows: the switch, today, the outcome counts and the latest tries. */
export async function status() {
  const settings = await getSettings();
  const day = klNow().day;
  const counts = Object.fromEntries((await db.sql<{ status: string; n: number }>(`select status, count(*)::int as n from contact_form_send group by 1 order by 2 desc`)).rows.map((r) => [r.status, r.n]));
  const recent = (await db.sql(`select company_id::text, company_name, website, status, detail, form_url, checked_at, sent_at from contact_form_send where status <> 'checking' order by checked_at desc limit 40`)).rows;
  return { settings, in_window: inWindow(), sent_today: await sentToday(day), counts, recent, last: last };
}

/**
 * A dry run for a test: fills one form and returns its screenshot, never presses send and keeps
 * no record. With no company_id, the next leads are checked until one has a form a bot may submit.
 */
export async function test(deps: Deps, companyId?: string): Promise<Tried & { checked: number }> {
  await ensureTables();
  const leads = companyId
    ? (await db.sql<Lead>(`select id::text as company_id, name as company_name, category, website from company_data where id = $1`, [companyId])).rows
    : await candidates(MAX_CHECKS_PER_TICK);
  let t: Tried | null = null;
  let checked = 0;
  for (const lead of leads) {
    checked++;
    t = await tryLead(lead, deps, { dry: true });
    if (t.status === 'dry_run' || t.status === 'no_message' || checked >= MAX_CHECKS_PER_TICK) break;
  }
  return { ...(t ?? { company_id: companyId ?? '', company_name: '', website: '', status: 'no_lead', detail: 'no lead to test', form_url: null, sent: false }), checked };
}

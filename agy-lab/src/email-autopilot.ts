// Email autopilot: every weekday morning the hub picks the day's new leads and adds
// them to the Smartlead campaign you chose; Smartlead sends them inside the
// campaign's schedule. It ships OFF. Nothing is added until it is switched on here
// and the campaign is started in Smartlead.
//
// Who is picked (pickBatch):
//   - leads in no campaign yet, whose mail host is known and takes mail
//   - one email per company, and no company that already has an email in a campaign
//   - never a lead marked do-not-call
//   - spread over mail hosts in proportion to the list, no host above max_provider_share
//     of the day, so one provider (Google is 43% of the list) never gets the whole day
// How many (plan): a ramp from ramp_start up to new_per_day over ramp_days, then no more
// than the campaign's own new-per-day, minus leads already waiting in it unsent.
// Brakes: campaign not active, bounce rate 3% or more after 20 sent, a backlog.
import * as db from './reportdb.ts';
import { NO_MX } from './email-mx.ts';

export interface Settings {
  enabled: boolean;
  campaign_id: number | null;
  new_per_day: number;
  ramp_start: number;
  ramp_days: number;
  started_on: string | null;
  max_provider_share: number;
}

export const DEFAULTS: Settings = { enabled: false, campaign_id: null, new_per_day: 10, ramp_start: 5, ramp_days: 14, started_on: null, max_provider_share: 0.5 };

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function readSettings(raw: any): Settings {
  const newPerDay = Math.round(clamp(Number(raw?.new_per_day) || DEFAULTS.new_per_day, 1, 200));
  return {
    enabled: raw?.enabled === true,
    campaign_id: Number(raw?.campaign_id) > 0 ? Number(raw.campaign_id) : null,
    new_per_day: newPerDay,
    ramp_start: Math.round(clamp(Number(raw?.ramp_start) || DEFAULTS.ramp_start, 1, newPerDay)),
    ramp_days: Math.round(clamp(Number(raw?.ramp_days ?? DEFAULTS.ramp_days), 0, 60)),
    started_on: /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.started_on ?? '')) ? String(raw.started_on) : null,
    max_provider_share: clamp(Number(raw?.max_provider_share) || DEFAULTS.max_provider_share, 0.2, 1),
  };
}

// ---- time (Kuala Lumpur) -------------------------------------------------------

export function klNow(now: Date = new Date()): { day: string; hour: number; weekday: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(now).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: String(parts.weekday) };
}

/** The window the daily batch goes in: weekdays 08:00 to 15:00 KL, so Smartlead has the day to send it. */
export function inWindow(now: Date = new Date()): boolean {
  const t = klNow(now);
  return !['Sat', 'Sun'].includes(t.weekday) && t.hour >= 8 && t.hour < 15;
}

/** New leads for today: ramp_start on the first day, rising evenly to new_per_day after ramp_days. */
export function todaysTarget(s: Settings, today: string): number {
  if (!s.started_on || s.ramp_days <= 0 || s.new_per_day <= s.ramp_start) return s.new_per_day;
  const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(s.started_on)) / 86_400_000));
  return Math.max(1, Math.round(s.ramp_start + (s.new_per_day - s.ramp_start) * Math.min(1, days / s.ramp_days)));
}

// ---- picking -------------------------------------------------------------------

export interface PoolRow { email: string; company_id: string; mail_host: string | null; person_name: string | null; lead_status: string | null }

/** n leads spread over mail hosts in proportion to the pool, no host above maxShare of n. */
export function pickBatch<T extends PoolRow>(pool: T[], n: number, maxShare: number): T[] {
  const bestPerCompany = new Map<string, T>();
  for (const r of pool) {
    if (!r.mail_host || r.mail_host === NO_MX || r.lead_status === 'do_not_call') continue;
    const have = bestPerCompany.get(r.company_id);
    if (!have || (!have.person_name && r.person_name)) bestPerCompany.set(r.company_id, r);
  }
  const seen = new Set<string>();
  const byHost = new Map<string, T[]>();
  for (const r of bestPerCompany.values()) {
    if (seen.has(r.email)) continue;
    seen.add(r.email);
    const list = byHost.get(r.mail_host!) ?? [];
    list.push(r);
    byHost.set(r.mail_host!, list);
  }
  // A named person first, then the list's own order.
  for (const list of byHost.values()) list.sort((a, b) => Number(Boolean(b.person_name)) - Number(Boolean(a.person_name)));
  const total = [...byHost.values()].reduce((s, l) => s + l.length, 0);
  // Rounded up, so an odd day (15 leads, half each) still fills from two hosts.
  const cap = Math.max(1, Math.ceil(n * maxShare));
  const taken = new Map<string, number>();
  const out: T[] = [];
  while (out.length < Math.min(n, total)) {
    let host: string | null = null;
    let most = -Infinity;
    for (const [h, list] of byHost) {
      const got = taken.get(h) ?? 0;
      if (got >= cap || got >= list.length) continue;
      const owed = (list.length / total) * (out.length + 1) - got;
      if (owed > most) { most = owed; host = h; }
    }
    if (!host) break;
    const got = taken.get(host) ?? 0;
    out.push(byHost.get(host)![got]!);
    taken.set(host, got + 1);
  }
  return out;
}

export const mixOf = (rows: Array<{ mail_host: string | null }>): Record<string, number> => {
  const mix: Record<string, number> = {};
  for (const r of rows) mix[r.mail_host ?? 'unchecked'] = (mix[r.mail_host ?? 'unchecked'] ?? 0) + 1;
  return mix;
};

// ---- the plan for today ----------------------------------------------------------

export interface CampaignState { name: string; status: string; max_new_per_day: number; not_started: number; sent: number; bounced: number }

const ACTIVE = new Set(['ACTIVE', 'START', 'STARTED']);

export interface Plan<T> { skip: string | null; target: number; rows: T[] }

export function plan<T extends PoolRow>(input: { settings: Settings; today: string; campaign: CampaignState | null; pool: T[]; contacted: Set<string> }): Plan<T> {
  const { settings: s, campaign: c } = input;
  const target = todaysTarget(s, input.today);
  const skip = (why: string): Plan<T> => ({ skip: why, target, rows: [] });
  if (!s.campaign_id) return skip('Choose the campaign to feed.');
  if (!c) return skip('The campaign was not found in Smartlead.');
  if (!ACTIVE.has(c.status.toUpperCase())) return skip(`The campaign is ${c.status.toLowerCase()}. Start it in Smartlead and the next check adds leads.`);
  if (c.sent >= 20 && c.bounced / c.sent >= 0.03) return skip(`Paused: ${(100 * c.bounced / c.sent).toFixed(1)}% of ${c.sent} sent emails bounced. Check the leads, then raise or reset the limit.`);
  const room = c.max_new_per_day > 0 ? Math.min(target, c.max_new_per_day) : target;
  const want = room - c.not_started;
  if (want <= 0) return skip(`${c.not_started} leads are still waiting to be sent in the campaign, so nothing is added.`);
  const pool = input.pool.filter((r) => !input.contacted.has(r.company_id));
  const rows = pickBatch(pool, want, s.max_provider_share);
  if (!rows.length) return skip('No lead is ready: every remaining lead is in a campaign, has no checked mail host, or has no mail server.');
  return { skip: null, target, rows };
}

// ---- storage and the run ---------------------------------------------------------

let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  ready ??= db.sql(`create table if not exists email_marketing_setting (key text primary key, value jsonb not null)`)
    .then(() => db.sql(`create table if not exists email_autopilot_run (
      day date primary key,
      campaign_id bigint not null,
      campaign_name text,
      target int not null,
      picked int not null default 0,
      added int not null default 0,
      mix jsonb not null default '{}',
      note text,
      ran_at timestamptz not null default now())`))
    .then(() => undefined, (err) => { ready = null; throw err; });
  return ready;
}

export async function getSettings(): Promise<Settings> {
  await ensureTables();
  const out = await db.sql<{ value: unknown }>(`select value from email_marketing_setting where key = 'autopilot'`);
  return readSettings({ ...DEFAULTS, ...(out.rows[0]?.value as object ?? {}) });
}

/** Saves the changes. Turning it on starts the ramp from today. */
export async function saveSettings(patch: any): Promise<Settings> {
  const before = await getSettings();
  const next = readSettings({ ...before, ...patch });
  if (next.enabled && (!before.enabled || !next.started_on)) next.started_on = klNow().day;
  await db.sql(`insert into email_marketing_setting (key, value) values ('autopilot', $1::jsonb) on conflict (key) do update set value = excluded.value`, [JSON.stringify(next)]);
  return next;
}

export interface RunRow { day: string; campaign_id: string; campaign_name: string | null; target: number; picked: number; added: number; mix: Record<string, number>; note: string | null; ran_at: string }

export async function recentRuns(limit = 14): Promise<RunRow[]> {
  await ensureTables();
  return (await db.sql<RunRow>(`select to_char(day, 'YYYY-MM-DD') as day, campaign_id::text, campaign_name, target, picked, added, mix, note, ran_at from email_autopilot_run order by day desc limit $1`, [limit])).rows;
}

export interface Deps<T extends PoolRow> {
  /** Lead rows that are in no campaign yet. */
  pool(): Promise<T[]>;
  campaign(id: number): Promise<CampaignState | null>;
  push(campaignId: number, campaignName: string | null, rows: T[]): Promise<{ added: number; sent: number; failed: number; errors: string[] }>;
}

export interface RunResult { ran: boolean; reason: string | null; target: number; picked: number; added: number; mix: Record<string, number>; campaign: string | null; sample: Array<{ email: string; mail_host: string | null; company_name?: string }> }

let last: (RunResult & { at: string; dry: boolean }) | null = null;
export const lastResult = () => last;

/** dry: only shows what would be added. Otherwise adds today's batch, once per day. */
export async function runOnce<T extends PoolRow & { company_name?: string }>(deps: Deps<T>, options: { dry?: boolean } = {}): Promise<RunResult> {
  const settings = await getSettings();
  const empty = (reason: string, target = 0): RunResult => ({ ran: false, reason, target, picked: 0, added: 0, mix: {}, campaign: null, sample: [] });
  const finish = (r: RunResult) => { last = { ...r, at: new Date().toISOString(), dry: Boolean(options.dry) }; return r; };
  if (!options.dry && !settings.enabled) return finish(empty('Autopilot is off.'));
  const today = klNow().day;
  if (!options.dry && (await db.sql(`select 1 from email_autopilot_run where day = $1`, [today])).rows.length) return finish(empty('Already added today\'s batch.'));

  const campaign = settings.campaign_id ? await deps.campaign(settings.campaign_id) : null;
  const contacted = new Set((await db.sql<{ id: string }>(`select distinct company_id::text as id from email_marketing_lead where company_id is not null`)).rows.map((r) => r.id));
  const p = plan({ settings, today, campaign, pool: await deps.pool(), contacted });
  const base = { target: p.target, campaign: campaign?.name ?? null };
  if (p.skip) return finish({ ...empty(p.skip, p.target), campaign: base.campaign });

  const sample = p.rows.map((r) => ({ email: r.email, mail_host: r.mail_host, company_name: r.company_name }));
  if (options.dry) return finish({ ran: false, reason: null, ...base, picked: p.rows.length, added: 0, mix: mixOf(p.rows), sample });

  // Claim the day first so a restart or a second instance never adds it twice.
  const claim = await db.sql(`insert into email_autopilot_run (day, campaign_id, campaign_name, target, picked, mix) values ($1, $2, $3, $4, $5, $6::jsonb) on conflict (day) do nothing returning day`,
    [today, settings.campaign_id, campaign!.name, p.target, p.rows.length, JSON.stringify(mixOf(p.rows))]);
  if (!claim.rows.length) return finish(empty('Already added today\'s batch.'));
  try {
    const out = await deps.push(settings.campaign_id!, campaign!.name, p.rows);
    if (!out.added && !out.sent) throw new Error(out.errors.join('; ') || 'Smartlead took none of them');
    await db.sql(`update email_autopilot_run set added = $2, note = $3 where day = $1`, [today, out.added, out.failed ? `${out.failed} failed: ${out.errors.join('; ')}` : null]);
    return finish({ ran: true, reason: null, ...base, picked: p.rows.length, added: out.added, mix: mixOf(p.rows), sample });
  } catch (err) {
    await db.sql(`delete from email_autopilot_run where day = $1`, [today]).catch(() => {});
    return finish({ ...empty('Adding to Smartlead failed: ' + (err as Error).message, p.target), campaign: base.campaign });
  }
}

/** The 10-minute check: inside the window and switched on, add the day's batch once. */
export async function tick<T extends PoolRow & { company_name?: string }>(deps: Deps<T>): Promise<void> {
  if (!db.configured() || !inWindow()) return;
  const settings = await getSettings();
  if (!settings.enabled) return;
  const r = await runOnce(deps);
  if (r.ran) console.log(`[email-autopilot] added ${r.added} of ${r.picked} leads to "${r.campaign}": ${JSON.stringify(r.mix)}`);
}

// Email templates for the /email-marketing page, and the sender profile they share.
//
// A template is a named list of steps (subject, body, days to wait), saved once and
// loaded into any campaign. Two kinds of {{field}} appear in the text:
//   lead fields    {{company_name}} {{first_name}} ... Smartlead fills one per lead
//                  (the fields email-marketing.ts toSmartlead sends).
//   sender fields  {{sender_name}} {{sender_title}} {{sender_phone}} {{sender_footer}}
//                  Filled by the hub from the sender profile when a campaign is saved,
//                  so a name, title or address is typed once and not in every email.
// check() catches what would go out broken: a field nobody fills, a sender field
// still empty, a "[CONFIRM ...]" note left in the text.
import * as db from './reportdb.ts';

export const LEAD_FIELDS = ['company_name', 'first_name', 'last_name', 'category', 'role', 'email'] as const;
export const SENDER_FIELDS = ['sender_name', 'sender_title', 'sender_phone', 'sender_footer'] as const;

export interface Step { subject: string; body: string; delay_days: number }
export type Sender = Record<(typeof SENDER_FIELDS)[number], string>;
export interface Problem { level: 'error' | 'warn'; text: string }

export const DEFAULT_SENDER: Sender = {
  sender_name: '',
  sender_title: '',
  sender_phone: '+60 11-2100 0099',
  sender_footer: 'Eternalgy Sdn Bhd (1523087-A), 01-23, Jalan Mutiara Emas 10/19, Taman Mount Austin, 81100 Johor Bahru. Not relevant? Reply "stop" and we won\'t write again.',
};

const FIELD = /\{\{\s*([a-z_]+)\s*\}\}/gi;
/** A note to self left in the text: [CONFIRM wording], [TODO], [Sender name]. */
const NOTE = /\[(?:confirm|todo|tbd|verif|insert|sender|your|name|title)[^\]\n]*\]/gi;

const fieldsIn = (text: string) => [...text.matchAll(FIELD)].map((m) => m[1]!.toLowerCase());

/** Replaces the sender fields with the profile's values; lead fields stay for Smartlead. */
export function fillSender(text: string, sender: Sender): string {
  return text.replace(FIELD, (whole, name: string) => {
    const key = name.toLowerCase() as keyof Sender;
    return (SENDER_FIELDS as readonly string[]).includes(key) ? sender[key].trim() : whole;
  });
}

/** What one lead sees: sender and lead fields both filled. Unknown fields stay visible. */
export function render(text: string, sender: Sender, lead: Partial<Record<(typeof LEAD_FIELDS)[number], string>>): string {
  return fillSender(text, sender).replace(FIELD, (whole, name: string) => {
    const key = name.toLowerCase() as (typeof LEAD_FIELDS)[number];
    return (LEAD_FIELDS as readonly string[]).includes(key) ? (lead[key] ?? '') : whole;
  });
}

export function check(steps: Step[], sender: Sender): Problem[] {
  const out: Problem[] = [];
  const add = (level: Problem['level'], text: string) => { if (!out.some((p) => p.text === text)) out.push({ level, text }); };
  const known = new Set<string>([...LEAD_FIELDS, ...SENDER_FIELDS]);
  steps.forEach((s, i) => {
    const where = i === 0 ? 'Email 1' : 'Follow-up ' + i;
    const text = s.subject + '\n' + s.body;
    for (const f of new Set(fieldsIn(text))) {
      if (!known.has(f)) add('error', `${where}: {{${f}}} is not filled by anything and would go out blank. Use one of: ${[...LEAD_FIELDS, ...SENDER_FIELDS].map((k) => '{{' + k + '}}').join(' ')}`);
      else if ((SENDER_FIELDS as readonly string[]).includes(f) && !sender[f as keyof Sender].trim()) add('error', `{{${f}}} is used but the sender profile has no value for it. Fill it in under Sender.`);
    }
    for (const note of text.match(NOTE) ?? []) add('error', `${where}: "${note}" is a note to yourself still in the text.`);
    if (fieldsIn(text).includes('first_name')) add('warn', 'Most leads are company inboxes with no person name, so {{first_name}} comes out blank (the greeting would read "Hi ,"). Lead with {{company_name}}.');
  });
  const first = steps[0];
  if (first && first.body.trim() && !/\b(stop|unsubscribe|opt[- ]?out)\b/i.test(fillSender(first.body, sender))) {
    add('warn', 'Email 1 has no way to opt out. Add a line like: Not relevant? Reply "stop" and we won\'t write again.');
  }
  return out;
}

// ---- storage -----------------------------------------------------------------

let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  ready ??= db.sql(`create table if not exists email_template (
      id bigserial primary key,
      name text not null unique,
      steps jsonb not null default '[]',
      updated_at timestamptz not null default now())`)
    .then(() => db.sql(`create table if not exists email_marketing_setting (key text primary key, value jsonb not null)`))
    .then(() => undefined, (err) => { ready = null; throw err; });
  return ready;
}

const cleanStep = (s: any): Step => ({ subject: String(s?.subject ?? ''), body: String(s?.body ?? ''), delay_days: Math.max(0, Math.round(Number(s?.delay_days) || 0)) });
export const cleanSteps = (raw: unknown): Step[] => (Array.isArray(raw) ? raw.map(cleanStep) : []);

export interface Template { id: number; name: string; steps: Step[]; updated_at: string }

export async function list(): Promise<Template[]> {
  await ensureTables();
  const out = await db.sql<{ id: string; name: string; steps: unknown; updated_at: string }>('select id::text, name, steps, updated_at from email_template order by lower(name)');
  return out.rows.map((r) => ({ id: Number(r.id), name: r.name, steps: cleanSteps(r.steps), updated_at: r.updated_at }));
}

/** Saves under the name (a new template, or the same name replaced). */
export async function save(name: string, steps: Step[]): Promise<number> {
  await ensureTables();
  const out = await db.sql<{ id: string }>(
    `insert into email_template (name, steps) values ($1, $2::jsonb)
     on conflict (name) do update set steps = excluded.steps, updated_at = now() returning id::text`,
    [name, JSON.stringify(steps)]);
  return Number(out.rows[0]!.id);
}

/** Changes one template by id; it may be renamed. */
export async function update(id: number, name: string, steps: Step[]): Promise<boolean> {
  await ensureTables();
  const out = await db.sql(`update email_template set name = $2, steps = $3::jsonb, updated_at = now() where id = $1 returning id`, [id, name, JSON.stringify(steps)]);
  return out.rows.length > 0;
}

export async function remove(id: number): Promise<boolean> {
  await ensureTables();
  return (await db.sql('delete from email_template where id = $1 returning id', [id])).rows.length > 0;
}

export async function getSender(): Promise<Sender> {
  await ensureTables();
  const out = await db.sql<{ value: Partial<Sender> }>(`select value from email_marketing_setting where key = 'sender'`);
  return readSender({ ...DEFAULT_SENDER, ...(out.rows[0]?.value ?? {}) });
}

export function readSender(raw: any): Sender {
  return Object.fromEntries(SENDER_FIELDS.map((k) => [k, String(raw?.[k] ?? '').trim()])) as Sender;
}

export async function saveSender(sender: Sender): Promise<void> {
  await ensureTables();
  await db.sql(`insert into email_marketing_setting (key, value) values ('sender', $1::jsonb) on conflict (key) do update set value = excluded.value`, [JSON.stringify(sender)]);
}

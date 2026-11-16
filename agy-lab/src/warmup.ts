// Inbox warm-up for the Google Workspace sending mailboxes (Email hub, Warm-up tab).
//
// The other side is our own catch-all mail server, ee-mail: every *@eternalgy.me address is a
// mailbox there, so the partner addresses below need no setup. Only eternalgy.me can send from
// there (Resend has not verified eternalgy.com, checked 2026-11-16), so every partner is on .me.
// A partner address is a proper name with `.wm` appended (daniel.ong.wm@eternalgy.me), which
// keeps warm-up mail apart from the real business mail ee-mail also holds. ee-mail is only
// ever asked for mail that one of our warm-up mailboxes sent to a `.wm` address.
//
// One tick (every 4 minutes, in this process, so it runs with the app and not on a PC):
//   1. every mailbox: rescue partner mail out of Spam into INBOX, read the INBOX over IMAP,
//      keep what partners wrote, mark it read, and schedule our answer a few minutes out;
//   2. ee-mail: see which of our mails arrived there, schedule the partner's answer;
//   3. due answers: the AI writes them; a partner's go out through ee-mail, a mailbox's go
//      out over SMTP in the same thread;
//   4. new threads: each mailbox sends the day's share of its daily number of new mails.
//
// The AI writes every mail (the /workers deepseek lanes through core llm, Vectide among them).
// When it cannot, a plain template is sent and the row says source "template": the run goes on.
// Nothing here blocks, hides or drops mail. A failure is written to warmup_event and on the
// row, and tried again on the next tick.
import type http from 'node:http';
import * as db from './reportdb.ts';
import { llm, mailbox } from './core/index.ts';

interface Ctx { json: (res: http.ServerResponse, status: number, body: unknown) => void; readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>> }

export const EE_MAIL = 'https://ee-mail-production.up.railway.app';
export const TICK_MS = 4 * 60_000;
/** New threads a mailbox starts on its first day, how many more each day, and the most a day. */
export const RAMP = { start: 5, perDay: 2, cap: 30 };
/** A thread is at most this many mails: mailbox, partner, mailbox, partner. */
export const MAX_DEPTH = 4;
/** The other side answers after a human-looking wait, between these minutes. */
export const ANSWER_MIN = { from: 2, to: 30 };

export const PARTNERS = [
  'daniel.ong.wm@eternalgy.me', 'priya.nair.wm@eternalgy.me', 'farah.hassan.wm@eternalgy.me', 'jason.lau.wm@eternalgy.me', 'nadia.karim.wm@eternalgy.me',
  'kevin.tan.wm@eternalgy.me', 'siti.aminah.wm@eternalgy.me', 'ravi.menon.wm@eternalgy.me', 'amanda.ho.wm@eternalgy.me', 'hafiz.yusof.wm@eternalgy.me',
];
const PARTNER_RE = /\.wm@eternalgy\.(me|com)$/i;
export const isPartner = (address: string) => PARTNER_RE.test(address.trim());

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** michelle.tan@x -> Michelle Tan; daniel.ong.wm@x -> Daniel Ong. */
export function personName(address: string): string {
  return address.split('@')[0].replace(/\.wm$/i, '').split(/[._-]+/).filter(Boolean).map(cap).join(' ') || address;
}

// ---------------------------------------------------------------- time and volume

const KL = 'Asia/Kuala_Lumpur';
export const klDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: KL });
/** Share of today (Kuala Lumpur) already gone, 0..1. */
export function dayFraction(d: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: KL, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second)) / 86400;
}
/** New threads one mailbox starts today, by how many days it has been warming. */
export function dailyTarget(ageDays: number): number {
  return Math.min(RAMP.cap, RAMP.start + RAMP.perDay * Math.max(0, ageDays));
}
/** How many of today's new threads should have gone by now: spread over the whole day, no window. */
export function dueNow(target: number, fraction: number): number {
  return Math.min(target, Math.ceil(target * fraction));
}
const between = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

// ---------------------------------------------------------------- database

async function migrate(): Promise<void> {
  await db.migrate();
  await db.sql(`
    create table if not exists warmup_mailbox (
      email      text primary key,
      pass       text not null,
      name       text not null,
      started_on date not null default current_date,
      created_at timestamptz not null default now()
    );
    comment on table warmup_mailbox is 'warmup.ts: the Google Workspace mailboxes being warmed up (app password for IMAP and SMTP)';
    create table if not exists warmup_message (
      id           bigserial primary key,
      mailbox      text not null,
      partner      text not null,
      author       text not null,
      message_id   text,
      in_reply_to  text,
      thread       text not null,
      depth        integer not null default 1,
      subject      text not null,
      body         text not null,
      source       text not null default 'ai',
      folder       text,
      sent_at      timestamptz not null default now(),
      arrived_at   timestamptz,
      reply_due_at timestamptz,
      replied_at   timestamptz,
      attempts     integer not null default 0,
      retry_at     timestamptz,
      note         text
    );
    comment on table warmup_message is 'warmup.ts: every warm-up mail. author is mailbox or partner; arrived_at is when ee-mail (mailbox mail) or the mailbox (partner mail) saw it; replied_at when the other side answered';
    create unique index if not exists warmup_message_mid on warmup_message (mailbox, message_id) where message_id is not null;
    create index if not exists warmup_message_sent on warmup_message (mailbox, sent_at desc);
    create table if not exists warmup_cursor (
      mailbox      text primary key,
      uid_validity text,
      last_uid     bigint not null default 0,
      checked_at   timestamptz,
      error        text
    );
    create table if not exists warmup_event (
      id      bigserial primary key,
      at      timestamptz not null default now(),
      mailbox text,
      kind    text not null,
      detail  text
    );
    create index if not exists warmup_event_at on warmup_event (at desc);
    delete from warmup_message where partner like '%@eternalgy.com';
  `);
}
let migrated: Promise<void> | null = null;
export const ready = () => (migrated ??= migrate().catch((err) => { migrated = null; throw err; }));

async function event(box: string | null, kind: string, detail: string): Promise<void> {
  console.warn(`[warmup] ${box ?? '-'} ${kind}: ${detail.slice(0, 300)}`);
  await db.sql('insert into warmup_event (mailbox, kind, detail) values ($1,$2,$3)', [box, kind, detail.slice(0, 1000)]).catch(() => {});
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);

interface Box { email: string; pass: string; name: string; started_on: string }
const login = (b: Box): mailbox.Login => ({ email: b.email, pass: b.pass, imap: null, smtp: null });

async function boxes(): Promise<Box[]> {
  const out = await db.sql<Box>(`select email, pass, name, to_char(started_on,'YYYY-MM-DD') as started_on from warmup_mailbox order by email`);
  return out.rows;
}

/** Saves mailboxes from lines of `email app-password`. Answers how many. */
export async function saveMailboxes(text: string): Promise<number> {
  await ready();
  const found = mailbox.parseLogins(text);
  for (const l of found) {
    await db.sql(
      `insert into warmup_mailbox (email, pass, name, started_on) values ($1,$2,$3,(now() at time zone '${KL}')::date)
       on conflict (email) do update set pass = excluded.pass`,
      [l.email, l.pass, personName(l.email)],
    );
  }
  return found.length;
}

// ---------------------------------------------------------------- writing (the AI)

const TOPICS = [
  'a weekly task report on what got done and what is next', 'moving a meeting to another day', 'a follow-up on a quotation sent last week',
  'a question about a document that was shared', 'a supplier delivery that is running late', 'booking a site visit next week', 'a customer who asked for a status update',
  'thanking them for help with something last week', 'planning who covers what while someone is on leave', 'an invoice that needs a second look',
  'a short training session for the team', 'photos needed from a site inspection', 'agreeing the agenda for a call', 'a small mix-up in a schedule that needs fixing',
  'lunch or coffee after a busy week', 'a quick question about a project deadline', 'feedback on a draft proposal', 'confirming a delivery address and time',
  'a progress check on an installation job', 'sharing the minutes of a meeting and the action points',
];
const TONES = ['friendly and relaxed', 'brief and to the point', 'polite and a little formal', 'warm, with one light remark', 'practical and organised'];

const stripFences = (s: string) => s.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();

export function parseDraft(answer: string): { subject: string | null; body: string } {
  const text = stripFences(answer);
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      const body = typeof j.body === 'string' ? j.body.trim() : '';
      const subject = typeof j.subject === 'string' ? j.subject.trim() : '';
      if (body) return { subject: subject || null, body };
    } catch { /* not JSON: the whole answer is the body */ }
  }
  return { subject: null, body: text };
}

interface Draft { subject: string | null; body: string; source: 'ai' | 'template' }

async function writeNew(from: string, to: string): Promise<Draft & { subject: string }> {
  const topic = pick(TOPICS), tone = pick(TONES), sentences = pick(['2 or 3', '3 to 5', '4 to 6']);
  const prompt =
    `Write one work email from ${personName(from)} to ${personName(to)}. They are colleagues in a Malaysian company in the solar and renewable energy business and know each other.\n` +
    `Subject of the email: ${topic}.\nTone: ${tone}. Length: ${sentences} sentences. Plain text, no links, no emojis, no placeholders like [name], no marketing. ` +
    `It must read like a real person typed it, maybe with a small question that invites an answer. Sign off with the first name only.\n` +
    `Answer with JSON only: {"subject": "a natural short subject line", "body": "the email text"}`;
  try {
    const out = await llm.chat(prompt, { step: 'warmup-new', temperature: 1 });
    const d = parseDraft(out.answer);
    if (d.body) return { subject: d.subject || cap(topic.split(' ').slice(0, 5).join(' ')), body: d.body, source: 'ai' };
  } catch (err) { await event(from, 'ai_failed', msg(err)); }
  const first = personName(from).split(' ')[0], other = personName(to).split(' ')[0];
  return {
    subject: 'Quick update for this week',
    body: `Hi ${other},\n\nJust a quick update from my side: the tasks for this week are moving along and I will send the details once everything is confirmed. Let me know if there is anything you need from me before then.\n\nThanks,\n${first}`,
    source: 'template',
  };
}

async function writeReply(author: string, to: string, history: string, last: boolean): Promise<Draft> {
  const prompt =
    `You are ${personName(author)}, replying by email to ${personName(to)}, a colleague at a Malaysian solar and renewable energy company. The conversation so far, oldest first, separated by ---:\n\n${history}\n\n` +
    `Write ${personName(author)}'s reply to the last message. 1 to 4 sentences, plain text, natural and human, answer what was asked or add one useful detail. ` +
    (last ? 'This closes the conversation: wrap up politely and do not ask a new question. ' : 'You may ask one short follow-up question. ') +
    `No links, no emojis, no placeholders, do not repeat the earlier mail, no quoted text. Sign off with the first name only. Answer with the reply text only.`;
  try {
    const out = await llm.chat(prompt, { step: 'warmup-reply', temperature: 1 });
    const d = parseDraft(out.answer);
    if (d.body) return { subject: null, body: d.body, source: 'ai' };
  } catch (err) { await event(author, 'ai_failed', msg(err)); }
  const first = personName(author).split(' ')[0], other = personName(to).split(' ')[0];
  return { subject: null, source: 'template', body: `Hi ${other},\n\nThanks for your email. Noted, I will get back to you with the details shortly.\n\nRegards,\n${first}` };
}

const toHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const reSubject = (s: string) => (/^re:/i.test(s.trim()) ? s.trim() : `Re: ${s.trim()}`);
const baseSubject = (s: string) => s.replace(/^((re|fwd?)\s*:\s*)+/i, '').trim().toLowerCase();
const cutQuote = (t: string) => t.split(/\r?\n/).reduce<{ out: string[]; done: boolean }>((a, line) => {
  if (a.done) return a;
  if (/^on .+wrote:\s*$/i.test(line.trim()) || /^>/.test(line) || /^-{2,}\s*original message/i.test(line.trim())) return { out: a.out, done: true };
  a.out.push(line); return a;
}, { out: [], done: false }).out.join('\n').trim();
const norm = (id: string | null | undefined) => String(id ?? '').trim().replace(/^<|>$/g, '').toLowerCase();

// ---------------------------------------------------------------- ee-mail (the partner side)

async function eeGet(path: string): Promise<any> {
  const r = await fetch(EE_MAIL + path);
  if (!r.ok) throw new Error(`ee-mail ${path} answered HTTP ${r.status}`);
  return r.json();
}

async function eeSend(from: string, to: string, subject: string, text: string, inReplyTo: string | null, refs: string[]): Promise<void> {
  const domain = from.split('@')[1];
  const headers: Record<string, string> = {};
  if (inReplyTo) { headers['In-Reply-To'] = inReplyTo; if (refs.length) headers['References'] = refs.join(' '); }
  const r = await fetch(EE_MAIL + '/send', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain, from, to: [to], subject, text, html: toHtml(text), ...(Object.keys(headers).length ? { headers } : {}) }),
  });
  const body: any = await r.json().catch(() => ({}));
  if (!r.ok || body?.success === false) throw new Error(`ee-mail send answered HTTP ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
}

/** Which of our mails reached ee-mail: sets arrived_at and schedules the partner's answer. */
async function pollEeMail(): Promise<void> {
  const waiting = await db.sql<{ id: string; mailbox: string; partner: string; message_id: string | null; subject: string; depth: number }>(
    `select id::text, mailbox, partner, message_id, subject, depth from warmup_message
      where author = 'mailbox' and arrived_at is null and sent_at > now() - interval '3 days' order by id`);
  if (!waiting.rows.length) return;
  const list = await eeGet('/received-emails?q=' + encodeURIComponent('.wm@') + '&field=to_email&limit=300');
  const rows: any[] = Array.isArray(list?.data) ? list.data : [];
  for (const w of waiting.rows) {
    const hit = rows.find((r) => w.message_id && norm(r.message_id) === norm(w.message_id))
      ?? rows.find((r) => String(r.from_email).toLowerCase() === w.mailbox && String(r.to_email).toLowerCase() === w.partner && baseSubject(String(r.subject ?? '')) === baseSubject(w.subject));
    if (!hit) continue;
    const due = w.depth < MAX_DEPTH ? `now() + interval '${Math.round(between(ANSWER_MIN.from, ANSWER_MIN.to) * 60)} seconds'` : 'null';
    await db.sql(`update warmup_message set arrived_at = $2, folder = 'ee-mail inbox', reply_due_at = ${due} where id = $1 and arrived_at is null`, [w.id, hit.received_at ?? new Date().toISOString()]);
  }
}

// ---------------------------------------------------------------- a mailbox: spam, read, answer

async function readMailbox(b: Box): Promise<void> {
  const l = login(b);
  const rescuedIds = new Set<string>();
  try {
    const moved = await mailbox.rescueSpam(l, isPartner);
    for (const m of moved) {
      rescuedIds.add(norm(m.message_id));
      await event(b.email, 'rescued', `Spam to Inbox: "${m.subject ?? ''}" from ${m.from}`);
    }
  } catch (err) { await event(b.email, 'error', 'spam check: ' + msg(err)); }

  const cur = (await db.sql<{ uid_validity: string | null; last_uid: string }>('select uid_validity, last_uid::text from warmup_cursor where mailbox = $1', [b.email])).rows[0];
  const since = new Date(Date.now() - 3 * 24 * 3600_000);
  try {
    const got = await mailbox.fetchNew(l, { uid_validity: cur?.uid_validity ?? null, last_uid: Number(cur?.last_uid ?? 0) }, since);
    const seen: number[] = [];
    for (const m of got.mails) {
      if (!m.from || !isPartner(m.from) || !m.message_id) continue;
      seen.push(m.uid);
      const folder = rescuedIds.has(norm(m.message_id)) ? 'Spam, rescued to Inbox' : 'Inbox';
      const text = cutQuote(m.text) || m.text.trim();
      const subject = m.subject || '(no subject)';
      const parent = (await db.sql<{ thread: string; depth: number }>(
        `select thread, depth from warmup_message where mailbox = $1 and author = 'mailbox' and message_id = any($2::text[]) order by id desc limit 1`,
        [b.email, [m.in_reply_to, ...m.references].filter(Boolean).flatMap((x) => [x as string, norm(x)])])).rows[0];
      const due = `now() + interval '${Math.round(between(ANSWER_MIN.from, ANSWER_MIN.to) * 60)} seconds'`;
      // The row written when ee-mail sent this answer: fill it in with what the mailbox received.
      const mine = (await db.sql<{ id: string; depth: number }>(
        `select id::text, depth from warmup_message where mailbox = $1 and partner = $2 and author = 'partner' and message_id is null
          and lower(regexp_replace(subject, '^((re|fwd?)\\s*:\\s*)+', '', 'i')) = $3 order by id limit 1`,
        [b.email, m.from, baseSubject(subject)])).rows[0];
      if (mine) {
        await db.sql(
          `update warmup_message set message_id = $2, in_reply_to = $3, body = $4, folder = $5, arrived_at = $6,
             reply_due_at = case when depth < ${MAX_DEPTH} then ${due} else null end where id = $1`,
          [mine.id, m.message_id, m.in_reply_to, text, folder, m.received_at]);
      } else if (parent) {
        await db.sql(
          `insert into warmup_message (mailbox, partner, author, message_id, in_reply_to, thread, depth, subject, body, folder, sent_at, arrived_at, reply_due_at)
           values ($1,$2,'partner',$3,$4,$5,$6,$7,$8,$9,$10,$10,${parent.depth + 1 < MAX_DEPTH ? due : 'null'}) on conflict do nothing`,
          [b.email, m.from, m.message_id, m.in_reply_to, parent.thread, parent.depth + 1, subject, text, folder, m.received_at]);
      }
    }
    await db.sql(
      `insert into warmup_cursor (mailbox, uid_validity, last_uid, checked_at, error) values ($1,$2,$3,now(),null)
       on conflict (mailbox) do update set uid_validity = $2, last_uid = $3, checked_at = now(), error = null`,
      [b.email, got.uid_validity, got.last_uid]);
    await mailbox.markSeen(l, seen).catch(() => {});
  } catch (err) {
    await db.sql(
      `insert into warmup_cursor (mailbox, checked_at, error) values ($1, now(), $2) on conflict (mailbox) do update set checked_at = now(), error = $2`,
      [b.email, msg(err)]).catch(() => {});
    await event(b.email, 'error', 'reading the inbox: ' + msg(err));
  }
}

// ---------------------------------------------------------------- answers

interface Due { id: string; mailbox: string; partner: string; author: string; message_id: string | null; thread: string; depth: number; subject: string; attempts: number }

async function answer(d: Due, boxByEmail: Map<string, Box>): Promise<void> {
  const history = (await db.sql<{ author: string; body: string; message_id: string | null }>(
    'select author, body, message_id from warmup_message where thread = $1 and mailbox = $2 order by id', [d.thread, d.mailbox])).rows;
  const last = d.depth + 1 >= MAX_DEPTH;
  const told = history.map((h) => `${personName(h.author === 'mailbox' ? d.mailbox : d.partner)}: ${h.body}`).join('\n---\n');
  try {
    if (d.author === 'mailbox') {
      // The partner answers a mail our mailbox sent, through ee-mail.
      const draft = await writeReply(d.partner, d.mailbox, told, last);
      const refs = history.map((h) => h.message_id).filter(Boolean) as string[];
      await eeSend(d.partner, d.mailbox, reSubject(d.subject), draft.body, d.message_id, refs);
      await db.sql(
        `insert into warmup_message (mailbox, partner, author, thread, depth, subject, body, source, folder, in_reply_to)
         values ($1,$2,'partner',$3,$4,$5,$6,$7,'sent by ee-mail, not seen in the mailbox yet',$8)`,
        [d.mailbox, d.partner, d.thread, d.depth + 1, reSubject(d.subject), draft.body, draft.source, d.message_id]);
    } else {
      // Our mailbox answers a partner's mail, over SMTP, in the same thread.
      const box = boxByEmail.get(d.mailbox);
      if (!box) throw new Error('mailbox no longer saved');
      const draft = await writeReply(d.mailbox, d.partner, told, last);
      const refs = history.map((h) => h.message_id).filter(Boolean) as string[];
      const id = await mailbox.send(login(box), {
        to: d.partner, from_name: box.name, subject: reSubject(d.subject), text: draft.body, html: toHtml(draft.body),
        in_reply_to: d.message_id, references: refs,
      });
      await db.sql(
        `insert into warmup_message (mailbox, partner, author, message_id, in_reply_to, thread, depth, subject, body, source)
         values ($1,$2,'mailbox',$3,$4,$5,$6,$7,$8,$9)`,
        [d.mailbox, d.partner, id, d.message_id, d.thread, d.depth + 1, reSubject(d.subject), draft.body, draft.source]);
    }
    await db.sql('update warmup_message set replied_at = now(), reply_due_at = null where id = $1', [d.id]);
  } catch (err) {
    const wait = Math.min(60, 5 * (d.attempts + 1));
    await db.sql(`update warmup_message set attempts = attempts + 1, retry_at = now() + interval '${wait} minutes', note = $2 where id = $1`, [d.id, msg(err)]).catch(() => {});
    await event(d.mailbox, 'error', `answer to "${d.subject}": ${msg(err)}`);
  }
}

async function dueAnswers(boxByEmail: Map<string, Box>): Promise<void> {
  const due = (await db.sql<Due>(
    `select id::text, mailbox, partner, author, message_id, thread, depth, subject, attempts from warmup_message
      where replied_at is null and reply_due_at <= now() and (retry_at is null or retry_at <= now()) order by reply_due_at limit 40`)).rows;
  await pool(due, 5, (d) => answer(d, boxByEmail));
}

// ---------------------------------------------------------------- new threads

async function sendNew(b: Box): Promise<void> {
  const now = new Date();
  const age = Math.max(0, Math.round((Date.parse(klDay(now)) - Date.parse(b.started_on)) / 86400_000));
  const target = dailyTarget(age);
  const sent = Number((await db.sql<{ n: string }>(
    `select count(*)::text as n from warmup_message where mailbox = $1 and author = 'mailbox' and depth = 1 and (sent_at at time zone '${KL}')::date = (now() at time zone '${KL}')::date`, [b.email])).rows[0]?.n ?? 0);
  if (sent >= dueNow(target, dayFraction(now))) return;
  // One new thread per mailbox per tick keeps the sending spread through the day.
  const partner = pick(PARTNERS);
  const draft = await writeNew(b.email, partner);
  try {
    const id = await mailbox.send(login(b), { to: partner, from_name: b.name, subject: draft.subject, text: draft.body, html: toHtml(draft.body) });
    await db.sql(
      `insert into warmup_message (mailbox, partner, author, message_id, thread, depth, subject, body, source)
       values ($1,$2,'mailbox',$3,$3,1,$4,$5,$6)`,
      [b.email, partner, id, draft.subject, draft.body, draft.source]);
  } catch (err) { await event(b.email, 'error', 'sending to ' + partner + ': ' + msg(err)); }
}

// ---------------------------------------------------------------- the tick

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try { await fn(item); } catch (err) { await event(null, 'error', msg(err)); }
    }
  }));
}

let running = false;
export let lastTick: { at: string; ms: number; error: string | null } | null = null;

export async function tick(): Promise<boolean> {
  if (running || !db.configured()) return false;
  running = true;
  const t0 = Date.now();
  let error: string | null = null;
  try {
    await ready();
    const all = await boxes();
    const byEmail = new Map(all.map((b) => [b.email, b]));
    await pool(all, 10, readMailbox);
    await pollEeMail().catch((err) => event(null, 'error', 'ee-mail: ' + msg(err)));
    await dueAnswers(byEmail).catch((err) => event(null, 'error', 'answers: ' + msg(err)));
    await pool(all, 10, sendNew);
  } catch (err) {
    error = msg(err);
    await event(null, 'error', 'tick: ' + error);
  } finally {
    lastTick = { at: new Date().toISOString(), ms: Date.now() - t0, error };
    running = false;
  }
  return true;
}

export function start(): void {
  const go = () => void tick().catch((err: Error) => console.warn('[warmup] ' + err.message));
  setTimeout(go, 45_000);
  setInterval(go, TICK_MS);
}

// ---------------------------------------------------------------- the page's data

async function overview() {
  await ready();
  const rows = (await db.sql<any>(
    `select b.email, b.name, to_char(b.started_on,'YYYY-MM-DD') as started_on,
       (select count(*) from warmup_message m where m.mailbox = b.email and m.author = 'mailbox')::int as sent,
       (select count(*) from warmup_message m where m.mailbox = b.email and m.author = 'mailbox' and (m.sent_at at time zone '${KL}')::date = (now() at time zone '${KL}')::date)::int as sent_today,
       (select count(*) from warmup_message m where m.mailbox = b.email and m.author = 'mailbox' and m.depth = 1)::int as threads,
       (select count(*) from warmup_message m where m.mailbox = b.email and m.author = 'mailbox' and m.depth = 1 and m.replied_at is not null)::int as threads_answered,
       (select count(*) from warmup_message m where m.mailbox = b.email and m.author = 'mailbox' and m.arrived_at is not null)::int as arrived,
       (select count(*) from warmup_message m where m.mailbox = b.email and m.author = 'partner' and m.message_id is not null)::int as received,
       (select count(*) from warmup_message m where m.mailbox = b.email and m.folder like 'Spam%')::int as rescued,
       (select count(*) from warmup_event e where e.mailbox = b.email and e.kind in ('error','ai_failed') and e.at > now() - interval '24 hours')::int as errors_24h,
       (select e.detail from warmup_event e where e.mailbox = b.email and e.kind = 'error' order by e.id desc limit 1) as last_error,
       (select c.error from warmup_cursor c where c.mailbox = b.email) as read_error,
       (select max(m.sent_at) from warmup_message m where m.mailbox = b.email and m.author = 'mailbox') as last_sent
     from warmup_mailbox b order by b.email`)).rows;
  const days = (await db.sql<any>(
    `select mailbox, (sent_at at time zone '${KL}')::date::text as day,
       count(*) filter (where author = 'mailbox')::int as sent,
       count(*) filter (where author = 'mailbox' and depth = 1)::int as new_threads,
       count(*) filter (where author = 'partner' and message_id is not null)::int as received,
       count(*) filter (where author = 'partner' and folder like 'Spam%')::int as rescued
     from warmup_message where sent_at > now() - interval '14 days' group by 1, 2 order by 2 desc`)).rows;
  const now = new Date();
  return {
    ramp: RAMP, max_depth: MAX_DEPTH, answer_minutes: ANSWER_MIN, tick_minutes: TICK_MS / 60_000, last_tick: lastTick,
    partners: PARTNERS.length, day_fraction: dayFraction(now),
    mailboxes: rows.map((r: any) => {
      const age = Math.max(0, Math.round((Date.parse(klDay(now)) - Date.parse(r.started_on)) / 86400_000));
      return { ...r, age_days: age, target_today: dailyTarget(age), days: days.filter((d: any) => d.mailbox === r.email) };
    }),
  };
}

async function log(url: URL) {
  await ready();
  const box = url.searchParams.get('mailbox');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 40, 1), 200);
  const before = Number(url.searchParams.get('before')) || 0;
  const rows = (await db.sql<any>(
    `select id::text, mailbox, partner, author, depth, subject, left(body, 4000) as body, source, folder, sent_at, arrived_at, replied_at, reply_due_at, attempts, note, (message_id is null and author = 'partner') as unseen
       from warmup_message where ($1::text is null or mailbox = $1) and ($2::bigint = 0 or id < $2) order by id desc limit $3`,
    [box, before, limit])).rows;
  const events = before ? [] : (await db.sql<any>(
    `select at, mailbox, kind, detail from warmup_event where ($1::text is null or mailbox = $1) order by id desc limit 15`, [box])).rows;
  return { rows, events };
}

export async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
  const p = url.pathname;
  if (p !== '/api/warmup' && !p.startsWith('/api/warmup/')) return false;
  const method = req.method ?? 'GET';
  try {
    if (!db.configured()) { ctx.json(res, 503, { error: 'no report database configured' }); return true; }
    if (method === 'GET' && p === '/api/warmup') { ctx.json(res, 200, await overview()); return true; }
    if (method === 'GET' && p === '/api/warmup/log') { ctx.json(res, 200, await log(url)); return true; }
    if (method === 'POST' && p === '/api/warmup/mailboxes') {
      const body = await ctx.readJson(req);
      const n = await saveMailboxes(String(body.logins ?? ''));
      ctx.json(res, 200, { saved: n });
      return true;
    }
    if (method === 'POST' && p === '/api/warmup/run') {
      const started = !running;
      void tick();
      ctx.json(res, 200, { started });
      return true;
    }
    ctx.json(res, 404, { error: 'not found' });
  } catch (err) {
    ctx.json(res, 500, { error: msg(err) });
  }
  return true;
}

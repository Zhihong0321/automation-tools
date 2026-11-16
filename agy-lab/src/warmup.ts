// Inbox warm-up for the Google Workspace sending mailboxes (Email hub, Warm-up tab).
//
// One job type. A job is one short conversation, driven by the LLM:
//   1. the LLM writes a work email (subject and body, its own choice)
//   2. the mailbox sends it over SMTP to a partner address on ee-mail (@eternalgy.me)
//   3. wait 10s, read it on ee-mail (every 10s until it shows, up to 2 min)
//   4. the LLM writes the partner's reply; wait 1-5 min; ee-mail sends it
//   5. wait 10s, read it in Gmail the same way (Inbox, else Spam, moved to Inbox), mark it read
//   6. the LLM writes the mailbox's reply; wait 1-5 min; send it over SMTP in the same thread
// The job is logged success or failed with the step it failed at. A failed job is not retried.
//
// Partner addresses end in `.wm@eternalgy.me`: ee-mail is a catch-all, so they need no setup,
// and ee-mail also holds real business mail, which this file never reads.
import type http from 'node:http';
import * as db from './reportdb.ts';
import { llm, mailbox } from './core/index.ts';

interface Ctx { json: (res: http.ServerResponse, status: number, body: unknown) => void; readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>> }

export const EE_MAIL = 'https://ee-mail-production.up.railway.app';
/** Jobs each mailbox runs a day. */
export const JOBS_PER_DAY = 10;
export const PARTNERS = [
  'daniel.ong.wm@eternalgy.me', 'priya.nair.wm@eternalgy.me', 'farah.hassan.wm@eternalgy.me', 'jason.lau.wm@eternalgy.me', 'nadia.karim.wm@eternalgy.me',
  'kevin.tan.wm@eternalgy.me', 'siti.aminah.wm@eternalgy.me', 'ravi.menon.wm@eternalgy.me', 'amanda.ho.wm@eternalgy.me', 'hafiz.yusof.wm@eternalgy.me',
];
export const isPartner = (address: string) => /\.wm@eternalgy\.me$/i.test(address.trim());

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** michelle.tan@x -> Michelle Tan; daniel.ong.wm@x -> Daniel Ong. */
export function personName(address: string): string {
  return address.split('@')[0].replace(/\.wm$/i, '').split(/[._-]+/).filter(Boolean).map(cap).join(' ') || address;
}
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const replyWait = () => 60_000 + Math.random() * 4 * 60_000;
/** Waits 10s, then looks every 10s until `look` finds the mail, for up to 2 minutes. Null when it never showed. */
async function waitForMail<T>(look: () => Promise<T | null>): Promise<T | null> {
  for (let i = 0; i < 12; i++) {
    await sleep(10_000);
    const found = await look();
    if (found) return found;
  }
  return null;
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
const toHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const reSubject = (s: string) => (/^re:/i.test(s.trim()) ? s.trim() : `Re: ${s.trim()}`);
const cutQuote = (t: string) => {
  const out: string[] = [];
  for (const line of t.split(/\r?\n/)) {
    if (/^on .+wrote:\s*$/i.test(line.trim()) || /^>/.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim();
};

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
    create table if not exists warmup_job (
      id          bigserial primary key,
      mailbox     text not null,
      partner     text not null,
      subject     text,
      status      text not null default 'running',
      step        text not null default 'start',
      error       text,
      folder      text,
      mails       jsonb not null default '[]',
      started_at  timestamptz not null default now(),
      finished_at timestamptz
    );
    comment on table warmup_job is 'warmup.ts: one warm-up conversation. status running, success or failed; step is where it is or where it failed; mails is every mail sent; folder is where the partner reply landed in Gmail';
    create index if not exists warmup_job_mailbox on warmup_job (mailbox, id desc);
    update warmup_job set status = 'failed', error = 'the app restarted while this job ran', finished_at = now() where status = 'running';
  `);
}
let migrated: Promise<void> | null = null;
export const ready = () => (migrated ??= migrate().catch((err) => { migrated = null; throw err; }));

interface Box { email: string; pass: string; name: string }
const login = (b: Box): mailbox.Login => ({ email: b.email, pass: b.pass, imap: null, smtp: null });
const boxes = async () => (await db.sql<Box>('select email, pass, name from warmup_mailbox order by email')).rows;

/** Saves mailboxes from lines of `email app-password`. Answers how many. */
export async function saveMailboxes(text: string): Promise<number> {
  await ready();
  const found = mailbox.parseLogins(text);
  for (const l of found) {
    await db.sql(
      `insert into warmup_mailbox (email, pass, name) values ($1,$2,$3) on conflict (email) do update set pass = excluded.pass`,
      [l.email, l.pass, personName(l.email)]);
  }
  return found.length;
}

// ---------------------------------------------------------------- the LLM

export function parseDraft(answer: string): { subject: string | null; body: string } {
  const text = answer.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (typeof j.body === 'string' && j.body.trim()) return { subject: typeof j.subject === 'string' && j.subject.trim() ? j.subject.trim() : null, body: j.body.trim() };
    } catch { /* not JSON: the answer is the body */ }
  }
  return { subject: null, body: text };
}

async function writeFirst(from: string, to: string): Promise<{ subject: string; body: string }> {
  const out = await llm.chat(
    `Write one business or work email from ${personName(from)} to ${personName(to)}, colleagues who know each other. ` +
    `You choose what it is about and the subject. It must read like a real person typed it. Plain text, no links, no placeholders. Sign off with the first name.\n` +
    `Answer with JSON only: {"subject": "...", "body": "..."}`,
    { step: 'warmup-write', temperature: 1 });
  const d = parseDraft(out.answer);
  if (!d.body) throw new Error('the LLM wrote an empty email');
  return { subject: d.subject || 'Quick question', body: d.body };
}

async function writeReply(author: string, to: string, thread: Array<{ from: string; body: string }>): Promise<string> {
  const told = thread.map((m) => `${personName(m.from)}:\n${m.body}`).join('\n---\n');
  const out = await llm.chat(
    `You are ${personName(author)}. Reply by email to ${personName(to)}, a colleague. The conversation so far, oldest first:\n\n${told}\n\n` +
    `Write the reply to the last email, like a real person would. Plain text, no links, no placeholders, no quoted text. Sign off with the first name. Answer with the reply text only.`,
    { step: 'warmup-reply', temperature: 1 });
  const body = parseDraft(out.answer).body;
  if (!body) throw new Error('the LLM wrote an empty reply');
  return body;
}

// ---------------------------------------------------------------- ee-mail

async function eeFind(from: string, to: string, subject: string): Promise<{ id: number; text: string } | null> {
  const list: any = await (await fetch(`${EE_MAIL}/received-emails?q=${encodeURIComponent(to)}&field=to_email&limit=20`)).json();
  const hit = (Array.isArray(list?.data) ? list.data : []).find((r: any) =>
    String(r.from_email).toLowerCase() === from && String(r.to_email).toLowerCase() === to && String(r.subject ?? '').trim() === subject.trim());
  if (!hit) return null;
  const one: any = await (await fetch(`${EE_MAIL}/received-emails/${hit.id}`)).json();
  const row = one?.data ?? one;
  return { id: hit.id, text: cutQuote(String(row?.text_content ?? '')) };
}

async function eeSend(from: string, to: string, subject: string, text: string, inReplyTo: string): Promise<void> {
  const r = await fetch(`${EE_MAIL}/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain: 'eternalgy.me', from, to: [to], subject, text, html: toHtml(text), headers: { 'In-Reply-To': inReplyTo, References: inReplyTo } }),
  });
  const body: any = await r.json().catch(() => ({}));
  if (!r.ok || body?.success === false) throw new Error(`ee-mail send answered HTTP ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
}

// ---------------------------------------------------------------- the job

const running = new Set<string>();

export async function runJob(b: Box): Promise<void> {
  const partner = pick(PARTNERS);
  const id = (await db.sql<{ id: string }>('insert into warmup_job (mailbox, partner) values ($1,$2) returning id::text', [b.email, partner])).rows[0].id;
  const mails: Array<{ from: string; to: string; subject: string; body: string; at: string }> = [];
  const step = (s: string, extra: Record<string, unknown> = {}) => db.sql(
    `update warmup_job set step = $2, mails = $3, subject = coalesce($4, subject), folder = coalesce($5, folder) where id = $1`,
    [id, s, JSON.stringify(mails), extra.subject ?? null, extra.folder ?? null]).catch(() => {});
  let at = 'write the email';
  running.add(b.email);
  try {
    const first = await writeFirst(b.email, partner);
    at = 'send from Gmail';
    const sent = await mailbox.send(login(b), { to: partner, from_name: b.name, subject: first.subject, text: first.body, html: toHtml(first.body) });
    mails.push({ from: b.email, to: partner, subject: first.subject, body: first.body, at: new Date().toISOString() });
    await step('sent, waiting for it on ee-mail', { subject: first.subject });

    at = 'read on ee-mail';
    const got = await waitForMail(() => eeFind(b.email, partner, first.subject));
    if (!got) throw new Error('not on ee-mail 2 minutes after sending');

    at = 'write the partner reply';
    const reply = await writeReply(partner, b.email, [{ from: b.email, body: got.text || first.body }]);
    await step('partner reply written, waiting 1-5 min');
    await sleep(replyWait());
    at = 'send the partner reply from ee-mail';
    const subject = reSubject(first.subject);
    const since = new Date();
    await eeSend(partner, b.email, subject, reply, sent);
    mails.push({ from: partner, to: b.email, subject, body: reply, at: new Date().toISOString() });
    await step('partner replied, waiting for it in Gmail');

    at = 'read in Gmail';
    const inbox = await waitForMail(() => mailbox.findMail(login(b), { from: partner, subject, since }));
    if (!inbox) throw new Error('partner reply not in Gmail Inbox or Spam 2 minutes after sending');
    await step('read in Gmail, writing the reply', { folder: inbox.folder });

    at = 'write the Gmail reply';
    const back = await writeReply(b.email, partner, [{ from: b.email, body: first.body }, { from: partner, body: cutQuote(inbox.text) || reply }]);
    await step('Gmail reply written, waiting 1-5 min');
    await sleep(replyWait());
    at = 'send the Gmail reply';
    await mailbox.send(login(b), {
      to: partner, from_name: b.name, subject, text: back, html: toHtml(back),
      in_reply_to: inbox.message_id, references: [sent, inbox.message_id].filter(Boolean) as string[],
    });
    mails.push({ from: b.email, to: partner, subject, body: back, at: new Date().toISOString() });
    await db.sql(`update warmup_job set status = 'success', step = 'done', mails = $2, finished_at = now() where id = $1`, [id, JSON.stringify(mails)]);
  } catch (err) {
    console.warn(`[warmup] job ${id} ${b.email} failed at ${at}: ${msg(err)}`);
    await db.sql(`update warmup_job set status = 'failed', step = $2, error = $3, mails = $4, finished_at = now() where id = $1`,
      [id, at, msg(err), JSON.stringify(mails)]).catch(() => {});
  } finally {
    running.delete(b.email);
  }
}

/** One job for every mailbox (or one mailbox), each on its own. Answers how many started. */
export async function runAll(only?: string | null): Promise<number> {
  await ready();
  const list = (await boxes()).filter((b) => !only || b.email === only);
  for (const b of list) void runJob(b).catch((err) => console.warn('[warmup] ' + msg(err)));
  return list.length;
}

/** Starts a job for each mailbox whose last job began more than a day / JOBS_PER_DAY ago (read from the log, so a restart keeps the pace). */
async function schedule(): Promise<void> {
  await ready();
  const gap = Math.round((24 * 3600) / JOBS_PER_DAY);
  const due = (await db.sql<Box>(
    `select b.email, b.pass, b.name from warmup_mailbox b
      where not exists (select 1 from warmup_job j where j.mailbox = b.email and j.started_at > now() - make_interval(secs => $1))`, [gap])).rows;
  for (const b of due) if (!running.has(b.email)) void runJob(b).catch((err) => console.warn('[warmup] ' + msg(err)));
}

export function start(): void {
  if (!db.configured()) return;
  setInterval(() => void schedule().catch((err) => console.warn('[warmup] ' + msg(err))), 10 * 60_000);
}

// ---------------------------------------------------------------- the page's data

async function overview() {
  await ready();
  const rows = (await db.sql<any>(
    `select b.email, b.name,
       count(j.id) filter (where j.started_at > now() - interval '24 hours')::int as jobs_24h,
       count(j.id) filter (where j.status = 'success' and j.started_at > now() - interval '24 hours')::int as success_24h,
       count(j.id) filter (where j.status = 'failed' and j.started_at > now() - interval '24 hours')::int as failed_24h,
       count(j.id) filter (where j.status = 'success')::int as success,
       count(j.id) filter (where j.status = 'failed')::int as failed,
       count(j.id) filter (where j.folder like 'Spam%')::int as rescued,
       max(j.started_at) as last_job
     from warmup_mailbox b left join warmup_job j on j.mailbox = b.email group by b.email, b.name order by b.email`)).rows;
  return { jobs_per_day: JOBS_PER_DAY, partners: PARTNERS.length, mailboxes: rows.map((r) => ({ ...r, running: running.has(r.email) })) };
}

async function jobs(url: URL) {
  await ready();
  const box = url.searchParams.get('mailbox') || null;
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 200);
  const before = Number(url.searchParams.get('before')) || 0;
  return {
    rows: (await db.sql<any>(
      `select id::text, mailbox, partner, subject, status, step, error, folder, mails, started_at, finished_at from warmup_job
        where ($1::text is null or mailbox = $1) and ($2::bigint = 0 or id < $2) order by id desc limit $3`, [box, before, limit])).rows,
  };
}

export async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
  const p = url.pathname;
  if (p !== '/api/warmup' && !p.startsWith('/api/warmup/')) return false;
  const method = req.method ?? 'GET';
  try {
    if (!db.configured()) { ctx.json(res, 503, { error: 'no report database configured' }); return true; }
    if (method === 'GET' && p === '/api/warmup') { ctx.json(res, 200, await overview()); return true; }
    if (method === 'GET' && p === '/api/warmup/jobs') { ctx.json(res, 200, await jobs(url)); return true; }
    if (method === 'POST' && p === '/api/warmup/mailboxes') {
      const body = await ctx.readJson(req);
      ctx.json(res, 200, { saved: await saveMailboxes(String(body.logins ?? '')) });
      return true;
    }
    if (method === 'POST' && p === '/api/warmup/run') {
      const body = await ctx.readJson(req).catch(() => ({} as Record<string, unknown>));
      ctx.json(res, 200, { started: await runAll(typeof body.mailbox === 'string' ? body.mailbox : null) });
      return true;
    }
    ctx.json(res, 404, { error: 'not found' });
  } catch (err) {
    ctx.json(res, 500, { error: msg(err) });
  }
  return true;
}

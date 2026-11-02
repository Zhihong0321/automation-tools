// Leads who write to us directly. Smartlead tracks only replies in its own threads, so
// a lead who starts a new email to the sending mailbox, a colleague who answers from
// another address, or a mail to any other mailbox saved on /workers never reached
// /email-marketing. Every two minutes each saved mailbox's INBOX is read over IMAP
// (core mailbox, nothing marked read); a mail whose sender is a lead, or shares a
// lead's company domain, is kept in email_marketing_inbox. Mail from anyone else is
// not kept.
//
// A kept mail is the same reply Smartlead reported when an EMAIL_REPLY webhook for that
// sender landed around it, or Smartlead's thread holds it: then it is left to the
// Smartlead side. The rest is direct: after a quarter hour (Smartlead's reply check
// can trail the mail) it joins the sender's conversation, the lead is paused in its
// campaign so no follow-up goes out on top, the telemarketer's log notes it, and a
// draft is written like for any reply. Approve & send answers it from the mailbox it
// came to, over SMTP, in its own thread (email-replies.ts send()).
import * as db from './reportdb.ts';
import { mailbox, secrets, smartlead as sl } from './core/index.ts';
import { htmlToText, stripQuoted, textToHtml } from './email-marketing.ts';

export interface InboxRow {
  id: string; mailbox: string; message_id: string; inbound: boolean; email: string; email_name: string | null;
  lead_email: string | null; campaign_id: string; campaign_name: string | null; company_id: string | null; matched_by: string;
  subject: string | null; body_text: string | null; body_html: string | null; in_reply_to: string | null; refs: string[] | null;
  received_at: string; handled_at: string | null; direct: boolean | null; company?: string | null;
}

async function migrate(): Promise<void> {
  await db.migrate();
  await db.sql(`
    create table if not exists email_marketing_inbox (
      id            bigserial primary key,
      mailbox       text not null,
      message_id    text not null,
      inbound       boolean not null default true,
      email         text not null,
      email_name    text,
      lead_email    text,
      campaign_id   bigint not null default 0,
      campaign_name text,
      company_id    bigint,
      matched_by    text not null,
      subject       text,
      body_text     text,
      body_html     text,
      in_reply_to   text,
      refs          text[],
      received_at   timestamptz not null,
      handled_at    timestamptz,
      direct        boolean,
      created_at    timestamptz not null default now(),
      unique (mailbox, message_id)
    );
    comment on table email_marketing_inbox is 'email-inbox.ts: mail a lead sent our mailboxes (inbound), and our SMTP answers (outbound). email is the other side''s address; direct is false when Smartlead reported the same reply';
    create index if not exists email_marketing_inbox_email_idx on email_marketing_inbox (email);
    create table if not exists email_marketing_inbox_cursor (
      mailbox      text primary key,
      uid_validity text,
      last_uid     bigint not null default 0,
      checked_at   timestamptz,
      kept         integer not null default 0,
      error        text
    );
  `);
}
let migrated: Promise<void> | null = null;
export const ready = () => (migrated ??= migrate().catch((err) => { migrated = null; throw err; }));

/** First read of a mailbox goes this far back. */
const FIRST_READ_DAYS = 14;
/** Smartlead's reply check can trail the mail by minutes; a mail is judged direct only after this. */
const SETTLE_MS = 15 * 60_000;
/** Only mail this fresh gets a draft and a pause; older mail found on a first read is listed, not acted on. */
const ACT_WITHIN_MS = 3 * 24 * 3600_000;

const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|icloud|me|aol|msn|proton|protonmail|qq|163|126|zoho)\./i;
const SYSTEM_SENDER = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?|bounce[s]?)[@+]/i;

export const normId = (id: string | null | undefined) => String(id ?? '').trim().replace(/^<|>$/g, '').toLowerCase();

interface Match { lead_email: string; campaign_id: number; campaign_name: string | null; company_id: number | null; matched_by: 'lead' | 'domain' }

/** The lead a sender belongs to: themself, else (not on a free-mail domain) a lead at their company's domain. */
export async function matchSender(email: string): Promise<Match | null> {
  const own = await db.sql<{ email: string; campaign_id: string; campaign_name: string | null; company_id: string | null }>(
    `select email, campaign_id::text, campaign_name, company_id::text from email_marketing_lead where lower(email) = $1 order by pushed_at desc limit 1`, [email]);
  const row = own.rows[0];
  if (row) return { lead_email: row.email.toLowerCase(), campaign_id: Number(row.campaign_id), campaign_name: row.campaign_name, company_id: row.company_id ? Number(row.company_id) : null, matched_by: 'lead' };
  // A lead pushed into Smartlead outside the hub is in no table of ours.
  if (sl.configured()) {
    const lead = await sl.call('GET', '/leads/?email=' + encodeURIComponent(email)).catch(() => null);
    const camp = (lead?.lead_campaign_data ?? [])[0];
    if (lead?.id && camp) return { lead_email: email, campaign_id: Number(camp.campaign_id), campaign_name: camp.campaign_name ?? null, company_id: null, matched_by: 'lead' };
  }
  const domain = email.split('@')[1] ?? '';
  if (!domain || FREE_MAIL.test(domain)) return null;
  const peer = await db.sql<{ email: string; campaign_id: string; campaign_name: string | null; company_id: string | null }>(
    `select email, campaign_id::text, campaign_name, company_id::text from email_marketing_lead where split_part(lower(email), '@', 2) = $1 order by pushed_at desc limit 1`, [domain]);
  const p = peer.rows[0];
  return p ? { lead_email: p.email.toLowerCase(), campaign_id: Number(p.campaign_id), campaign_name: p.campaign_name, company_id: p.company_id ? Number(p.company_id) : null, matched_by: 'domain' } : null;
}

export interface MailboxState { email: string; ok: boolean | null; error: string | null; checked_at: string | null; kept: number }
export const state = { running: false, last_poll: null as string | null, mailboxes: [] as MailboxState[] };

/** Reads every saved mailbox once and keeps the leads' mail; then settles what is old enough. */
export async function poll(): Promise<typeof state> {
  if (state.running || !db.configured()) return state;
  state.running = true;
  try {
    await Promise.all([ready(), secrets.load()]);
    const list = mailbox.logins();
    const ours = new Set(list.map((l) => l.email));
    const ourDomains = new Set(list.map((l) => l.email.split('@')[1]));
    const next: MailboxState[] = [];
    for (const login of list) {
      const cur = (await db.sql<{ uid_validity: string | null; last_uid: string; kept: number }>(
        `select uid_validity, last_uid::text, kept from email_marketing_inbox_cursor where mailbox = $1`, [login.email])).rows[0];
      try {
        const got = await mailbox.fetchNew(login, { uid_validity: cur?.uid_validity ?? null, last_uid: Number(cur?.last_uid ?? 0) }, new Date(Date.now() - FIRST_READ_DAYS * 86400_000));
        let kept = 0;
        for (const m of got.mails) {
          const from = m.from ?? '';
          if (!from || ours.has(from) || ourDomains.has(from.split('@')[1]) || SYSTEM_SENDER.test(from) || !m.message_id) continue;
          const match = await matchSender(from);
          if (!match) continue;
          const saved = await db.sql(
            `insert into email_marketing_inbox (mailbox, message_id, inbound, email, email_name, lead_email, campaign_id, campaign_name, company_id, matched_by, subject, body_text, body_html, in_reply_to, refs, received_at)
             values ($1, $2, true, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz) on conflict (mailbox, message_id) do nothing`,
            [login.email, m.message_id, from, m.from_name, match.lead_email, match.campaign_id, match.campaign_name, match.company_id, match.matched_by,
              m.subject, m.text || htmlToText(m.html), m.html || null, m.in_reply_to, m.references, m.received_at]);
          kept += saved.rowCount ?? 0;
        }
        await db.sql(
          `insert into email_marketing_inbox_cursor (mailbox, uid_validity, last_uid, checked_at, kept, error) values ($1, $2, $3, now(), $4, null)
           on conflict (mailbox) do update set uid_validity = excluded.uid_validity, last_uid = excluded.last_uid, checked_at = now(), kept = email_marketing_inbox_cursor.kept + excluded.kept, error = null`,
          [login.email, got.uid_validity, got.last_uid, kept]);
        next.push({ email: login.email, ok: true, error: null, checked_at: new Date().toISOString(), kept: (cur?.kept ?? 0) + kept });
      } catch (err) {
        const error = (err as { responseText?: string }).responseText || (err as Error).message;
        await db.sql(
          `insert into email_marketing_inbox_cursor (mailbox, checked_at, error) values ($1, now(), $2)
           on conflict (mailbox) do update set checked_at = now(), error = excluded.error`, [login.email, error]).catch(() => {});
        next.push({ email: login.email, ok: false, error, checked_at: new Date().toISOString(), kept: cur?.kept ?? 0 });
      }
    }
    state.mailboxes = next;
    state.last_poll = new Date().toISOString();
    await settle();
  } finally {
    state.running = false;
  }
  return state;
}

/** Times Smartlead reported a reply from this address: its webhooks' arrival and its master inbox's reply time. */
async function smartleadReplyTimes(email: string): Promise<number[]> {
  const out = await db.sql<{ at: string }>(
    `select received_at as at from email_marketing_event where event_type = 'EMAIL_REPLY' and lower(email) = $1
     union all select replied_at from email_marketing_lead where lower(email) = $1 and replied_at is not null`, [email]);
  return out.rows.map((r) => new Date(r.at).getTime());
}

/** Smartlead saw this mail when it reported a reply from the sender from a little before it to an hour after. */
export const coveredBy = (receivedAt: number, smartleadTimes: number[]) =>
  smartleadTimes.some((t) => t >= receivedAt - 5 * 60_000 && t <= receivedAt + 60 * 60_000);

/** Inbound mail old enough to judge: direct or Smartlead's; a fresh direct one is acted on. */
async function settle(): Promise<void> {
  const due = await db.sql<InboxRow>(
    `select * from email_marketing_inbox where inbound and handled_at is null and received_at < $1::timestamptz order by received_at`, [new Date(Date.now() - SETTLE_MS).toISOString()]);
  for (const row of due.rows) {
    const direct = !coveredBy(new Date(row.received_at).getTime(), await smartleadReplyTimes(row.email));
    await db.sql(`update email_marketing_inbox set handled_at = now(), direct = $2 where id = $1`, [row.id, direct]);
    if (!direct || Date.now() - new Date(row.received_at).getTime() > ACT_WITHIN_MS) continue;
    await act(row).catch((err: Error) => console.warn(`[email-inbox] ${row.email}: ${err.message}`));
  }
}

/** A lead wrote to us directly: stop the campaign's follow-ups, tell the telemarketer, draft the answer. */
async function act(row: InboxRow): Promise<void> {
  const campaignId = Number(row.campaign_id);
  if (campaignId && row.lead_email && sl.configured()) {
    const lead = await sl.call('GET', '/leads/?email=' + encodeURIComponent(row.lead_email)).catch(() => null);
    if (lead?.id) await sl.pauseLead(campaignId, Number(lead.id)).catch((err: Error) => console.warn(`[email-inbox] pause ${row.lead_email}: ${err.message}`));
  }
  if (row.company_id) {
    const who = row.matched_by === 'domain' ? `${row.email} (same company as ${row.lead_email})` : row.email;
    await db.sql(
      `insert into lead_activity_log (company_id, action, previous_status, new_status, notes, is_mock, created_at)
       select c.id, 'email_event', coalesce(c.lead_status, 'unassigned'), 'email_replied', $2, false, now() from company_data c where c.id = $1`,
      [row.company_id, `Email from ${who} to ${row.mailbox}, outside the campaign thread: ${stripQuoted(row.body_text ?? '').slice(0, 600) || row.subject || '(no text)'}`]).catch(() => {});
  }
  const replies = await import('./email-replies.ts');
  replies.draftSoon(row.email, campaignId || null);
}

/** Direct mail to show: inbound judged direct, and our answers. */
export async function rows(email?: string): Promise<InboxRow[]> {
  if (!db.configured()) return [];
  await ready();
  const out = await db.sql<InboxRow>(
    `select id::text, mailbox, message_id, inbound, email, email_name, lead_email, campaign_id::text, campaign_name, company_id::text, matched_by,
            subject, body_text, body_html, in_reply_to, refs, received_at, handled_at, direct,
            (select c.name from company_data c where c.id = i.company_id) as company
       from email_marketing_inbox i
      where direct and ($1::text is null or email = $1)
      order by received_at`, [email ?? null]);
  return out.rows;
}

export const byMessageId = async (messageId: string): Promise<InboxRow | null> => {
  await ready();
  return (await db.sql<InboxRow>(`select * from email_marketing_inbox where message_id = $1 order by inbound desc limit 1`, [messageId])).rows[0] ?? null;
};

/** One kept row as a thread message (email-replies.ts Message), with the mailbox it came to. */
export function asMessage(r: InboxRow) {
  const text = r.body_text ?? htmlToText(r.body_html ?? '');
  return {
    inbound: r.inbound, stats_id: null, message_id: r.message_id, time: new Date(r.received_at).toISOString(),
    from: r.inbound ? r.email : r.mailbox, to: r.inbound ? r.mailbox : r.email, subject: r.subject,
    body_html: r.body_html ?? textToHtml(text), body: r.inbound ? stripQuoted(text) : text, seq: null, mailbox: r.mailbox,
  };
}

/**
 * Smartlead's thread and the direct mail in one list, oldest first. A direct inbound
 * Smartlead's thread also holds (same Message-ID, or a lead reply within ten
 * minutes of it) is shown once, as Smartlead's.
 */
export function merge<T extends { inbound: boolean; message_id: string | null; time: string | null }>(smartlead: T[], direct: T[]): T[] {
  const ids = new Set(smartlead.map((m) => normId(m.message_id)).filter(Boolean));
  const replyTimes = smartlead.filter((m) => m.inbound && m.time).map((m) => new Date(m.time!).getTime());
  const extra = direct.filter((m) => {
    if (ids.has(normId(m.message_id))) return false;
    if (!m.inbound || !m.time) return true;
    const t = new Date(m.time).getTime();
    return !replyTimes.some((r) => Math.abs(r - t) <= 10 * 60_000);
  });
  const at = (m: T) => (m.time ? new Date(m.time).getTime() : 0);
  return [...smartlead, ...extra].sort((a, b) => at(a) - at(b));
}

/**
 * Answers a direct mail from the mailbox it came to, in its own thread, with the
 * sender name, signature and BCC that mailbox carries in Smartlead. The answer is kept
 * as an outbound row so the thread shows it.
 */
export async function answer(to: InboxRow, text: string): Promise<string> {
  const login = mailbox.logins().find((l) => l.email === to.mailbox);
  if (!login) throw Object.assign(new Error(`no login saved for ${to.mailbox} on /workers, so the answer cannot be sent from it`), { status: 503 });
  const box = sl.configured() ? ((await sl.listMailboxes().catch(() => [])) ?? []).find((m: any) => String(m.from_email ?? '').toLowerCase() === login.email) : null;
  const subject = /^re:/i.test(to.subject ?? '') ? String(to.subject) : 'Re: ' + (to.subject || 'your email');
  const when = new Date(to.received_at).toUTCString();
  const theirs = to.body_text ?? htmlToText(to.body_html ?? '');
  const signature = box?.signature ? String(box.signature) : '';
  const html = textToHtml(text) + (signature ? '<br>' + signature : '') +
    `<br><div>On ${when}, ${to.email_name ? to.email_name + ' &lt;' + to.email + '&gt;' : to.email} wrote:</div>` +
    `<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${to.body_html || textToHtml(theirs)}</blockquote>`;
  const plain = text + (signature ? '\n\n' + htmlToText(signature) : '') + `\n\nOn ${when}, ${to.email} wrote:\n` + theirs.split('\n').map((l) => '> ' + l).join('\n');
  const refs = [...(to.refs ?? []), to.message_id].filter(Boolean);
  const messageId = await mailbox.send(login, {
    to: to.email, from_name: box?.from_name ?? null, bcc: box?.bcc_email ?? null,
    subject, text: plain, html, in_reply_to: to.message_id, references: refs,
  });
  await db.sql(
    `insert into email_marketing_inbox (mailbox, message_id, inbound, email, lead_email, campaign_id, campaign_name, company_id, matched_by, subject, body_text, in_reply_to, refs, received_at, handled_at, direct)
     values ($1, $2, false, $3, $4, $5, $6, $7, 'sent', $8, $9, $10, $11, now(), now(), true) on conflict (mailbox, message_id) do nothing`,
    [login.email, messageId, to.email, to.lead_email, to.campaign_id, to.campaign_name, to.company_id, subject, text, to.message_id, refs]);
  return messageId;
}

/** What /api/email-marketing/inbox shows: each saved mailbox, its last read and what it kept. */
export async function status() {
  const list = mailbox.logins();
  if (!db.configured()) return { configured: list.length > 0, mailboxes: [] };
  await ready();
  const cur = await db.sql<{ mailbox: string; checked_at: string | null; kept: number; error: string | null; last_uid: string }>(
    `select mailbox, checked_at, kept, error, last_uid::text from email_marketing_inbox_cursor`);
  const counts = await db.sql<{ mailbox: string; direct: string; smartlead: string; settling: string }>(
    `select mailbox, count(*) filter (where direct)::text as direct, count(*) filter (where direct = false)::text as smartlead,
            count(*) filter (where handled_at is null)::text as settling
       from email_marketing_inbox where inbound group by mailbox`);
  return {
    configured: list.length > 0, running: state.running, last_poll: state.last_poll, every_minutes: 2,
    mailboxes: list.map((l) => {
      const c = cur.rows.find((r) => r.mailbox === l.email);
      const n = counts.rows.find((r) => r.mailbox === l.email);
      return {
        email: l.email, ok: c ? !c.error : null, error: c?.error ?? null, checked_at: c?.checked_at ?? null, last_uid: Number(c?.last_uid ?? 0),
        kept: c?.kept ?? 0, direct: Number(n?.direct ?? 0), smartlead_replies: Number(n?.smartlead ?? 0), settling: Number(n?.settling ?? 0),
      };
    }),
  };
}

export function start(): void {
  const tick = () => void (async () => {
    await secrets.load();
    if (mailbox.configured()) await poll();
  })().catch((err: Error) => console.warn('[email-inbox] ' + err.message));
  setTimeout(tick, 30_000);
  setInterval(tick, 2 * 60_000);
}

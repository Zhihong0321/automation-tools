// Mailboxes the hub reads and sends from itself, over IMAP and SMTP: the Smartlead
// sending mailbox and any other saved here. Smartlead sees only replies in its own
// threads; a lead who writes a new email instead reaches the hub through this
// (email-inbox.ts).
//
// Logins: on /workers under "Other API keys" (secrets kind `mailboxes`), one per line:
//   email password [imap=host:port] [smtp=host:port]
// A Google mailbox (Workspace or Gmail) takes an app password, not its sign-in one;
// Google shows it in four groups ("abcd efgh ijkl mnop"), pasted as shown is fine.
// Hosts default from the address's mail provider. MAILBOX_LOGINS serves a hub with
// none saved.
//
// Reading never changes the mailbox: messages are fetched with BODY.PEEK, so nothing
// is marked read, moved or deleted.
import dns from 'node:dns/promises';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import * as secrets from './secrets.ts';

export interface Host { host: string; port: number }
export interface Login { email: string; pass: string; imap: Host | null; smtp: Host | null }

function hostPort(value: string, port: number): Host {
  const m = value.match(/^([^:]+)(?::(\d+))?$/);
  return { host: (m?.[1] ?? value).toLowerCase(), port: m?.[2] ? Number(m[2]) : port };
}

/** The saved logins: one per line, `#` lines and lines without an address skipped. */
export function parseLogins(text: string): Login[] {
  const out: Login[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const words = line.split(/\s+/);
    const email = words.shift()!.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    let imap: Host | null = null, smtp: Host | null = null;
    while (words.length && /^(imap|smtp)=/i.test(words[words.length - 1])) {
      const [key, value] = words.pop()!.split('=');
      if (key.toLowerCase() === 'imap') imap = hostPort(value, 993); else smtp = hostPort(value, 465);
    }
    let pass = words.join(' ');
    if (/^[a-z]{4}( [a-z]{4}){3}$/i.test(pass)) pass = pass.replace(/ /g, '');
    if (pass) out.push({ email, pass, imap, smtp });
  }
  return out;
}

export function logins(): Login[] {
  return parseLogins(secrets.get('mailboxes'));
}

export function configured(): boolean {
  return logins().length > 0;
}

/** The address's IMAP and SMTP servers: what the login names, else its mail provider's. */
export async function servers(l: Login): Promise<{ imap: Host; smtp: Host }> {
  if (l.imap && l.smtp) return { imap: l.imap, smtp: l.smtp };
  const domain = l.email.split('@')[1];
  let mx = '';
  if (/^(gmail|googlemail)\.com$/.test(domain)) mx = 'google.com';
  else mx = (await dns.resolveMx(domain).catch(() => [])).sort((a, b) => a.priority - b.priority).map((r) => r.exchange.toLowerCase()).join(' ');
  const known: Array<[RegExp, Host, Host]> = [
    [/google\.com|googlemail\.com/, { host: 'imap.gmail.com', port: 993 }, { host: 'smtp.gmail.com', port: 465 }],
    [/outlook\.com|office365|microsoft/, { host: 'outlook.office365.com', port: 993 }, { host: 'smtp.office365.com', port: 587 }],
    [/hostinger/, { host: 'imap.hostinger.com', port: 993 }, { host: 'smtp.hostinger.com', port: 465 }],
    [/zoho/, { host: 'imap.zoho.com', port: 993 }, { host: 'smtp.zoho.com', port: 465 }],
  ];
  const hit = known.find(([re]) => re.test(mx));
  return {
    imap: l.imap ?? hit?.[1] ?? { host: 'imap.' + domain, port: 993 },
    smtp: l.smtp ?? hit?.[2] ?? { host: 'smtp.' + domain, port: 465 },
  };
}

export interface Mail {
  uid: number;
  message_id: string | null;
  in_reply_to: string | null;
  references: string[];
  from: string | null;
  from_name: string | null;
  to: string[];
  cc: string[];
  subject: string | null;
  text: string;
  html: string;
  /** When the mailbox received it (IMAP INTERNALDATE), else the Date header. */
  received_at: string;
}

const addresses = (field: any): Array<{ address: string; name: string }> =>
  (Array.isArray(field) ? field : field ? [field] : []).flatMap((f: any) => f.value ?? [])
    .filter((a: any) => a.address).map((a: any) => ({ address: String(a.address).toLowerCase(), name: String(a.name ?? '') }));

async function connect(l: Login): Promise<ImapFlow> {
  const { imap } = await servers(l);
  const client = new ImapFlow({ host: imap.host, port: imap.port, secure: imap.port === 993, auth: { user: l.email, pass: l.pass }, logger: false });
  // A dropped connection rejects the call in flight; without a listener it would also crash the process.
  client.on('error', () => {});
  await client.connect();
  return client;
}

/** Signs in and out, to say whether a saved login works. */
export async function check(l: Login): Promise<void> {
  const client = await connect(l);
  await client.logout();
}

/**
 * INBOX mail newer than the cursor: every uid above last_uid while the mailbox's
 * uidValidity is unchanged, else (first read, or the mailbox was rebuilt) everything
 * received since `since`.
 */
export async function fetchNew(l: Login, cursor: { uid_validity: string | null; last_uid: number }, since: Date): Promise<{ uid_validity: string; last_uid: number; mails: Mail[] }> {
  const client = await connect(l);
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const box = client.mailbox;
      const validity = String(box ? box.uidValidity : '');
      const same = cursor.uid_validity === validity;
      const found = same
        ? await client.search({ uid: `${cursor.last_uid + 1}:*` }, { uid: true })
        : await client.search({ since }, { uid: true });
      // "n:*" always answers the newest message, even one at or below n.
      const uids = (found || []).filter((u) => !same || u > cursor.last_uid).sort((a, b) => a - b);
      const mails: Mail[] = [];
      if (uids.length) {
        for await (const m of client.fetch(uids.join(','), { uid: true, source: true, internalDate: true }, { uid: true })) {
          if (!m.source) continue;
          const p = await simpleParser(m.source);
          const from = addresses(p.from)[0];
          const refs = Array.isArray(p.references) ? p.references : p.references ? [p.references] : [];
          const when = m.internalDate ? new Date(m.internalDate) : p.date ?? new Date();
          mails.push({
            uid: m.uid,
            message_id: p.messageId ?? null,
            in_reply_to: p.inReplyTo ?? null,
            references: refs,
            from: from?.address ?? null,
            from_name: from?.name || null,
            to: addresses(p.to).map((a) => a.address),
            cc: addresses(p.cc).map((a) => a.address),
            subject: p.subject ?? null,
            text: p.text ?? '',
            html: typeof p.html === 'string' ? p.html : '',
            received_at: when.toISOString(),
          });
        }
      }
      const top = uids.length ? uids[uids.length - 1] : 0;
      return { uid_validity: validity, last_uid: Math.max(top, same ? cursor.last_uid : 0), mails };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export interface Outgoing {
  to: string;
  from_name?: string | null;
  bcc?: string | null;
  subject: string;
  text: string;
  html: string;
  in_reply_to?: string | null;
  references?: string[];
}

/** Sends one email from this mailbox; answers its Message-ID. Google keeps a copy in Sent itself. */
export async function send(l: Login, m: Outgoing): Promise<string> {
  const { smtp } = await servers(l);
  const transport = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: l.email, pass: l.pass } });
  try {
    const info = await transport.sendMail({
      from: m.from_name ? { name: m.from_name, address: l.email } : l.email,
      to: m.to,
      bcc: m.bcc || undefined,
      subject: m.subject,
      text: m.text,
      html: m.html,
      inReplyTo: m.in_reply_to || undefined,
      references: m.references?.length ? m.references : undefined,
    });
    return String(info.messageId);
  } finally {
    transport.close();
  }
}

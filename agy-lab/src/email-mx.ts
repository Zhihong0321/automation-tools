// Who hosts each lead email, from the MX records of its domain.
//
// Email marketing sends from a few mailboxes. Too many messages to one provider
// (Google, Microsoft, ...) in a short time reads as spam to that provider, so every
// lead carries a mail host and the lead list can be filtered and counted by it.
//
// Host, one per domain, kept in email_domain_mx so a domain is asked once:
//   a major provider's name  Google, Microsoft, Yahoo, Zoho, ... (list-step2 MAJOR_MX)
//   Unknown                  mail goes to a host that is not a major provider
//   No mail server           the domain has no MX: a message to it bounces
//   (no value)               not checked yet
// A DNS hiccup stores nothing; the next run asks that domain again.
import dns from 'node:dns/promises';
import * as db from './reportdb.ts';
import * as emailList from './email-list.ts';
import { mxProvider, type Mx } from './list-step2.ts';

export const UNKNOWN = 'Unknown';
export const NO_MX = 'No mail server';
/** The filter value for leads whose domain has not been looked up yet. */
export const UNCHECKED = 'unchecked';

export type Resolve = (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const domainOf = (email: string) => email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase();

/** What a lead shows as its mail host. */
export function hostLabel(mx: Pick<Mx, 'mx_class' | 'mx_provider'>): string {
  if (mx.mx_class === 'major' && mx.mx_provider) return mx.mx_provider;
  return mx.mx_class === 'none' ? NO_MX : UNKNOWN;
}

/** The domain's mail host, or null when DNS would not answer twice (not an answer; ask again later). */
export async function resolveHost(domain: string, resolve: Resolve = (d) => dns.resolveMx(d)): Promise<Mx | null> {
  for (let i = 0; i < 2; i++) {
    try { return mxProvider(await resolve(domain)); }
    catch (cause) {
      // The domain does not exist, or has no MX: an answer.
      if (/^(ENOTFOUND|ENODATA)$/.test(String((cause as NodeJS.ErrnoException).code ?? ''))) return { mx_class: 'none', mx_provider: null, mx: [] };
      if (i === 0) await sleep(1_000);
    }
  }
  return null;
}

// ---- stored hosts ------------------------------------------------------------

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  ready ??= db.sql(`create table if not exists email_domain_mx (
    domain text primary key,
    mx_class text not null,
    mx_provider text,
    mx jsonb not null default '[]',
    checked_at timestamptz not null default now())`).then(() => undefined, (err) => { ready = null; throw err; });
  return ready;
}

/** domain → host label, for every domain looked up so far. */
export async function hostLabels(): Promise<Map<string, string>> {
  await ensureTable();
  const out = await db.sql<{ domain: string; mx_class: Mx['mx_class']; mx_provider: string | null }>('select domain, mx_class, mx_provider from email_domain_mx');
  return new Map(out.rows.map((r) => [r.domain, hostLabel(r)]));
}

// ---- lead rows ---------------------------------------------------------------

/** mail_host: all | unchecked | a host label (Google, Unknown, ...), case does not matter. */
export function filterHost<T extends { mail_host: string | null }>(rows: T[], mailHost: string | null | undefined): T[] {
  const want = (mailHost ?? '').trim().toLowerCase();
  if (!want || want === 'all') return rows;
  if (want === UNCHECKED) return rows.filter((r) => !r.mail_host);
  return rows.filter((r) => r.mail_host?.toLowerCase() === want);
}

/** Distinct emails per host; hosts not looked up yet count under "unchecked". */
export function countHosts(rows: Array<{ email: string; mail_host: string | null }>): Record<string, number> {
  const seen = new Map<string, string>();
  for (const r of rows) seen.set(r.email, r.mail_host ?? UNCHECKED);
  const out: Record<string, number> = {};
  for (const host of seen.values()) out[host] = (out[host] ?? 0) + 1;
  return out;
}

// ---- the lookup run ----------------------------------------------------------

export interface RunState {
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  total: number;
  done: number;
  failed: number;
  error: string | null;
}

const state: RunState = { running: false, started_at: null, finished_at: null, total: 0, done: 0, failed: 0, error: null };

export const runState = (): RunState => ({ ...state });

/** Domains of the lead emails, and how many of them are already looked up. */
export async function progress(): Promise<{ domains: number; checked: number }> {
  await ensureTable();
  const [rows, have] = await Promise.all([emailList.allRows(), db.sql<{ n: string }>('select count(*)::text as n from email_domain_mx')]);
  return { domains: new Set(rows.map((r) => domainOf(r.email))).size, checked: Number(have.rows[0]?.n ?? 0) };
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  }));
}

async function run(resolve: Resolve | undefined, concurrency: number): Promise<void> {
  await ensureTable();
  const [rows, have] = await Promise.all([emailList.allRows(), db.sql<{ domain: string }>('select domain from email_domain_mx')]);
  const known = new Set(have.rows.map((r) => r.domain));
  const todo = [...new Set(rows.map((r) => domainOf(r.email)))].filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && !known.has(d));
  state.total = todo.length;

  let batch: Array<{ domain: string; mx_class: string; mx_provider: string | null; mx: string[] }> = [];
  const flush = async () => {
    if (!batch.length) return;
    const part = batch;
    batch = [];
    await db.sql(
      `insert into email_domain_mx (domain, mx_class, mx_provider, mx)
       select d.domain, d.mx_class, d.mx_provider, d.mx
         from jsonb_to_recordset($1::jsonb) as d(domain text, mx_class text, mx_provider text, mx jsonb)
       on conflict (domain) do update set mx_class = excluded.mx_class, mx_provider = excluded.mx_provider, mx = excluded.mx, checked_at = now()`,
      [JSON.stringify(part)]);
  };
  await pool(todo, concurrency, async (domain) => {
    const mx = await resolveHost(domain, resolve);
    if (mx) batch.push({ domain, mx_class: mx.mx_class, mx_provider: mx.mx_provider, mx: mx.mx });
    else state.failed++;
    state.done++;
    if (batch.length >= 200) await flush();
  });
  await flush();
}

/** Looks up every lead domain not stored yet, in the background. False when a run is already going. */
export function startRun(options: { resolve?: Resolve; concurrency?: number } = {}): boolean {
  if (state.running) return false;
  Object.assign(state, { running: true, started_at: new Date().toISOString(), finished_at: null, total: 0, done: 0, failed: 0, error: null });
  void run(options.resolve, options.concurrency ?? 25)
    .catch((err: Error) => { state.error = err.message; console.warn('[email-mx] ' + err.message); })
    .finally(() => { state.running = false; state.finished_at = new Date().toISOString(); });
  return true;
}

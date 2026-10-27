// Website email lane: reads the homepage and contact page of every lead with its
// own website, keeps the emails it finds, and saves them to company_email. No LLM.
//
// Off until switched on: SITE_EMAIL_AUTO=1 (Railway env) or POST /api/site-emails/start.
// POST /api/site-emails/run {company_id} checks one lead on demand.
import type http from 'node:http';
import * as db from './reportdb.ts';

const CONCURRENCY = 4;
const IDLE_MS = 60_000;
// The one guard in this lane: a site that never answers would hold its slot
// forever. The page counts as unreachable and the lane moves on.
const PAGE_WAIT_MS = 20_000;
const MAX_HTML = 2_000_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Hosts that are a listing, a social page or a link shortener, not the company's own site. */
const NOT_OWN_SITE = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|wa\.me|whatsapp\.com|linktr\.ee|tiktok\.com|shopee\.com\.my|shopee\.com|lazada\.com\.my|lazada\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|business\.site|google\.com|goo\.gl|g\.page|bit\.ly|mudah\.my|carousell\.com\.my|grab\.com|foodpanda\.my|beacons\.ai|linkin\.bio|taplink\.cc)$/i;

/** The lead's website as a fetchable URL, or null when it is not the company's own site. */
export function ownSiteUrl(website: string | null | undefined): string | null {
  const raw = String(website ?? '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
  if (NOT_OWN_SITE.test(url.hostname.replace(/^www\./i, ''))) return null;
  return url.toString();
}

const JUNK_DOMAIN = /(^|\.)(example\.(com|org|net)|domain\.com|yourdomain\.com|yoursite\.com|mysite\.com|email\.com|test\.com|company\.com|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com|ingest\.sentry\.io)$/i;
const JUNK_LOCAL = /^(name|email|user|username|your|yourname|youremail|john\.?doe|jane\.?doe|someone|xxx+|abc|test)$/i;
const FILE_TAIL = /\.(png|jpe?g|gif|webp|svg|bmp|ico|css|js|mjs|json|woff2?|ttf|pdf|mp4|webm)$/i;

/** One email as it should be stored, or null when it is markup noise or a template placeholder. */
export function cleanEmail(raw: string): string | null {
  let e = raw.trim().toLowerCase().replace(/^mailto:/, '').replace(/^[.\-_]+|[.\-_]+$/g, '');
  try { e = decodeURIComponent(e); } catch { /* keep as is */ }
  const m = /^([a-z0-9][a-z0-9._%+-]{0,63})@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24})$/.exec(e);
  if (!m) return null;
  const [, local, domain] = m;
  if (FILE_TAIL.test(domain) || FILE_TAIL.test(local)) return null;
  if (JUNK_DOMAIN.test(domain) || JUNK_LOCAL.test(local)) return null;
  // Error-tracker ids: a long hex local part.
  if (/^[a-f0-9]{20,}$/.test(local)) return null;
  // Retina image names such as logo@2x.png are caught by FILE_TAIL; "x@2x" without a tail is not an email either.
  if (/^\d+x$/.test(domain.split('.')[0])) return null;
  return e;
}

/** Cloudflare's email-protection encoding: the first byte is the XOR key. */
export function decodeCfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

function decodeEntities(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&commat;/gi, '@').replace(/&period;/gi, '.').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
}

/** Every email published on a page: mailto links, Cloudflare-protected addresses, and visible text. */
export function extractEmails(html: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => { const e = cleanEmail(raw); if (e) found.add(e); };
  const text = decodeEntities(html);
  for (const m of text.matchAll(/mailto:([^"'?<>\s]+)/gi)) for (const part of m[1].split(/[,;]/)) add(part);
  for (const m of text.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) add(decodeCfEmail(m[1]));
  for (const m of text.matchAll(/email-protection#([0-9a-f]+)/gi)) add(decodeCfEmail(m[1]));
  // "sales [at] acme [dot] my" and "sales(at)acme.my"
  const plain = text
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@')
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.');
  for (const m of plain.matchAll(/[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi)) add(m[0]);
  return [...found];
}

const CONTACT_WORDS = /contact|hubungi|get-in-touch|getintouch|reach-us|enquir|inquir|联系|联络/i;
const ABOUT_WORDS = /about|tentang|company-profile|关于/i;

/** Up to `max` same-site links that look like a contact page, contact pages before about pages. */
export function contactLinks(html: string, pageUrl: string, max = 2): string[] {
  const base = new URL(pageUrl);
  const host = base.hostname.replace(/^www\./i, '');
  const contact: string[] = [];
  const about: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const href = m[1].trim();
    if (/^(mailto|tel|javascript|whatsapp):/i.test(href)) continue;
    let url: URL;
    try { url = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.hostname.replace(/^www\./i, '') !== host) continue;
    if (FILE_TAIL.test(url.pathname)) continue;
    url.hash = '';
    const key = url.toString();
    if (key === base.toString() || contact.includes(key) || about.includes(key)) continue;
    const label = href + ' ' + m[2].replace(/<[^>]+>/g, ' ');
    if (CONTACT_WORDS.test(label)) contact.push(key);
    else if (ABOUT_WORDS.test(label)) about.push(key);
  }
  return [...contact, ...about].slice(0, max);
}

type Fetched = { url: string; html: string } | null;

async function fetchPage(url: string): Promise<Fetched> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'en-MY,en;q=0.9,ms;q=0.8' },
      signal: AbortSignal.timeout(PAGE_WAIT_MS),
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (type && !/html|text\/plain|xml/i.test(type)) return null;
    const html = (await res.text()).slice(0, MAX_HTML);
    return { url: res.url || url, html };
  } catch {
    return null;
  }
}

export type SiteResult = {
  status: 'found' | 'none' | 'unreachable' | 'no_site';
  emails: { email: string; source_url: string }[];
  pages: string[];
};

/** Read one site: homepage, then its contact page (or /contact-us and /contact when it links none). */
export async function scanSite(website: string | null | undefined, fetcher: (url: string) => Promise<Fetched> = fetchPage): Promise<SiteResult> {
  const start = ownSiteUrl(website);
  if (!start) return { status: 'no_site', emails: [], pages: [] };
  // Plain http as the fallback, for sites with a broken certificate.
  const home = await fetcher(start) ?? (start.startsWith('https://') ? await fetcher('http://' + start.slice(8)) : null);
  if (!home) return { status: 'unreachable', emails: [], pages: [] };
  const seen = new Map<string, string>();
  const pages = [home.url];
  const keep = (page: { url: string; html: string }) => {
    for (const email of extractEmails(page.html)) if (!seen.has(email)) seen.set(email, page.url);
  };
  keep(home);
  const linked = contactLinks(home.html, home.url);
  const next = linked.length ? linked : ['/contact-us', '/contact'].map((p) => new URL(p, home.url).toString());
  for (const url of next) {
    const page = await fetcher(url);
    if (!page) continue;
    pages.push(page.url);
    keep(page);
    // The guessed paths are alternatives: stop at the first that answers.
    if (!linked.length) break;
  }
  const emails = [...seen].map(([email, source_url]) => ({ email, source_url }));
  return { status: emails.length ? 'found' : 'none', emails, pages };
}

// ---- storage -----------------------------------------------------------------

/** SQL that is true for a lead the lane should read. */
const ELIGIBLE = `c.merged_into is null and coalesce(c.is_hidden, false) = false and c.blacklist_reason is null
  and coalesce(c.lead_status, 'unassigned') <> 'do_not_call'
  and coalesce(c.website, '') <> ''
  and c.website !~* '(facebook\\.com|fb\\.com|fb\\.me|instagram\\.com|wa\\.me|whatsapp|linktr\\.ee|tiktok\\.com|shopee\\.|lazada\\.|linkedin\\.com|twitter\\.com|youtube\\.com|business\\.site|goo\\.gl|g\\.page|bit\\.ly)'`;

type Lead = { id: string; name: string; website: string };

/** Claim the next leads no lane has read yet, so parallel slots never take the same one. */
async function claim(limit: number): Promise<Lead[]> {
  const res = await db.sql<Lead>(`
    update company_data c set site_email_status = 'checking', site_email_checked_at = now()
     where c.id in (select c.id from company_data c where ${ELIGIBLE} and c.site_email_checked_at is null
                     order by c.id limit $1 for update skip locked)
    returning c.id::text, c.name, c.website`, [limit]);
  return res.rows;
}

async function save(companyId: string, result: SiteResult): Promise<void> {
  for (const e of result.emails) {
    await db.sql(
      `insert into company_email (company_id, email, source, source_url) values ($1, $2, 'website', $3)
       on conflict (company_id, email) do nothing`,
      [companyId, e.email, e.source_url],
    );
  }
  await db.sql(`update company_data set site_email_status = $2, site_email_checked_at = now() where id = $1`, [companyId, result.status]);
}

/** Read one lead's site and save what it finds, whatever its checked state. */
export async function runOne(companyId: string): Promise<SiteResult & { company_id: string; name: string; website: string | null }> {
  await db.migrate();
  const row = (await db.sql<{ id: string; name: string; website: string | null }>(
    `select id::text, name, website from company_data where id = $1`, [companyId])).rows[0];
  if (!row) throw new Error('no lead with id ' + companyId);
  const result = await scanSite(row.website);
  await save(row.id, result);
  return { company_id: row.id, name: row.name, website: row.website, ...result };
}

// ---- the lane ------------------------------------------------------------------

let running = /^(1|true|yes|on)$/i.test(process.env.SITE_EMAIL_AUTO?.trim() ?? '');
let slots = 0;
const totals = { checked: 0, found: 0, emails: 0, unreachable: 0 };
let lastError: string | null = null;

async function slot(): Promise<void> {
  slots++;
  try {
    while (running) {
      let lead: Lead | undefined;
      try {
        [lead] = await claim(1);
      } catch (err) {
        lastError = (err as Error).message;
        await new Promise((r) => setTimeout(r, IDLE_MS));
        continue;
      }
      if (!lead) { running = false; console.log('[site-emails] every eligible lead has been read'); break; }
      let result: SiteResult;
      try {
        result = await scanSite(lead.website);
      } catch (err) {
        lastError = (err as Error).message;
        result = { status: 'unreachable', emails: [], pages: [] };
      }
      try {
        await save(lead.id, result);
      } catch (err) {
        lastError = (err as Error).message;
        continue;
      }
      totals.checked++;
      if (result.status === 'found') { totals.found++; totals.emails += result.emails.length; }
      if (result.status === 'unreachable') totals.unreachable++;
    }
  } finally {
    slots--;
  }
}

function fillSlots(): void {
  while (running && slots < CONCURRENCY) void slot();
}

/** Leads left 'checking' by a restart go back in the queue. */
export async function start(): Promise<void> {
  if (!db.configured()) return;
  try {
    await db.migrate();
    await db.sql(`update company_data set site_email_status = null, site_email_checked_at = null where site_email_status = 'checking'`);
  } catch (err) {
    console.warn('[site-emails] could not reset interrupted leads: ' + (err as Error).message);
  }
  if (running) { console.log('[site-emails] lane on (SITE_EMAIL_AUTO)'); fillSlots(); }
}

export async function status(): Promise<Record<string, unknown>> {
  await db.migrate();
  const counts = (await db.sql<Record<string, number>>(`
    select count(*) filter (where ${ELIGIBLE})::int as eligible,
           count(*) filter (where ${ELIGIBLE} and c.site_email_checked_at is null)::int as remaining,
           count(*) filter (where c.site_email_status = 'found')::int as found,
           count(*) filter (where c.site_email_status = 'none')::int as none,
           count(*) filter (where c.site_email_status = 'unreachable')::int as unreachable,
           count(*) filter (where c.site_email_status = 'no_site')::int as no_site,
           (select count(*)::int from company_email where source = 'website') as emails
      from company_data c`)).rows[0];
  return { running, slots, concurrency: CONCURRENCY, thisProcess: totals, lastError, ...counts };
}

type Ctx = {
  json: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
};

/** /api/site-emails routes, behind the operator token. */
export async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
  const p = url.pathname;
  if (p !== '/api/site-emails' && !p.startsWith('/api/site-emails/')) return false;
  if (!db.configured()) { ctx.json(res, 503, { error: 'no report database configured' }); return true; }
  const method = req.method ?? 'GET';
  if (p === '/api/site-emails' && method === 'GET') {
    ctx.json(res, 200, await status());
    return true;
  }
  if (p === '/api/site-emails/run' && method === 'POST') {
    const body = await ctx.readJson(req);
    const id = String(body.company_id ?? '').trim();
    if (!/^\d+$/.test(id)) { ctx.json(res, 400, { error: 'company_id is required' }); return true; }
    try {
      ctx.json(res, 200, await runOne(id));
    } catch (err) {
      ctx.json(res, 404, { error: (err as Error).message });
    }
    return true;
  }
  if (p === '/api/site-emails/start' && method === 'POST') {
    running = true;
    fillSlots();
    ctx.json(res, 200, await status());
    return true;
  }
  if (p === '/api/site-emails/stop' && method === 'POST') {
    running = false;
    ctx.json(res, 200, await status());
    return true;
  }
  return false;
}

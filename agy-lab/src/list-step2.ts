// List processing step 2: every business a search list found gets one best
// contact method, ready for outreach. No LLM, no browser.
//
// Per lead, in plain code:
//   - its website is read again (homepage plus up to three contact, team or
//     about pages, the country pipeline's reader), and the HTML is checked for a
//     contact form a bot could submit: a message box plus an email or phone box
//     (contact-form-delivery.ts pickForm), with no captcha on the form or page.
//     Nothing is filled in and nothing is sent.
//   - every email linked to the company: the ones search-list step 1 stored,
//     plus the ones on the pages read now.
//   - each email domain's MX records: hosted by a major mailbox provider
//     (Google, Microsoft, Zoho, ...) or unknown.
//   - phones from Maps and the website, typed by libphonenumber (mobile or
//     not), WhatsApp links, and social links.
// Then best_contact_method, in this order:
//   contact-via-website, unknown-hosting-email, major-brand-email-hosting,
//   mobile-phone, social-media, no-viable-contact-method.
//
// A job is one list_step2_lead row per business, in the report database beside
// search_list_place. A finished lead is one row update, and that row is the
// checkpoint: a redeploy loses only the leads in flight. The lease is the one
// search-list.ts uses, so one hub works a job at a time.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import type http from 'node:http';
import { parsePhoneNumberFromString, getCountries, type CountryCode } from 'libphonenumber-js/max';
import * as db from './reportdb.ts';
import { pickForm, classify, type Field, type FormInfo } from './contact-form-delivery.ts';
import { cleanEmail, extractEmails, ownSiteUrl } from './site-emails.ts';
// @ts-ignore: plain .mjs from the pipeline repo
import { researchWebsite, getPage } from './country/country-industry-research.mjs';

const LEAD_CONCURRENCY = 10;
const LEAD_BATCH = 30;
/** A lead taken this many times without finishing (a hub that died on it) is closed with an error. */
const MAX_ATTEMPTS = 3;
const LEASE_SECONDS = 120;
const BEAT_MS = 30_000;
const MAX_SAMPLE = 5_000;
const OWNER = 'hub-' + crypto.randomBytes(4).toString('hex');

export const METHODS = ['contact-via-website', 'unknown-hosting-email', 'major-brand-email-hosting', 'mobile-phone', 'social-media', 'no-viable-contact-method'] as const;
export type Method = typeof METHODS[number];

/**
 * bot_can_submit: a contact form in the page HTML, no captcha. captcha: the form or page has one.
 * script_form: the contact form is drawn by script (Wix, HubSpot, Jotform, ...), not checked.
 * no_form, unreachable, no_website, not_own_site (a social or marketplace page as the website).
 */
export type FormStatus = 'bot_can_submit' | 'captcha' | 'script_form' | 'no_form' | 'unreachable' | 'no_website' | 'not_own_site';
export type FormVerdict = { status: FormStatus; url: string | null; detail: string; pages?: string[] };
export type MxClass = 'major' | 'unknown' | 'none';
export type Mx = { mx_class: MxClass; mx_provider: string | null; mx: string[]; error?: string };
export type Email = { email: string; domain: string; source: string } & Mx;
export type Phone = { phone: string; e164: string | null; type: string; source: string };
export type LeadResult = { best_contact_method: Method; form: FormVerdict; emails: Email[]; phones: Phone[]; social: string[] };

type Page = { url: string; html: string };
export type Deps = {
  fetchPage: (url: string) => Promise<Page>;
  resolveMx: (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jsonParam = (value: unknown): string =>
  JSON.stringify(value ?? null, (_k, v) => (typeof v === 'string' ? v.toWellFormed() : v)) ?? 'null';
function invalid(message: string): Error {
  return Object.assign(new Error(message), { code: 'bad_request' });
}

// ---- the contact form, from the page HTML ------------------------------------

const decode = (s: string): string => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&');
const textOf = (html: string): string => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function attrs(inside: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of inside.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) out[m[1]!.toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'file']);
// The same markers contact-form-delivery.ts snapshot() looks for in the browser.
const FORM_CAPTCHA = /class\s*=\s*["'][^"']*\b(g-recaptcha|h-captcha|cf-turnstile)\b|data-sitekey|<iframe[^>]+src\s*=\s*["'][^"']*(captcha|turnstile)|<img[^>]+src\s*=\s*["'][^"']*captcha|<input[^>]+name\s*=\s*["'][^"']*captcha/i;
const FORM_QUIZ = /\d+\s*[+x×*-]\s*\d+\s*=|captcha|are you human|bukan robot/i;

/** The forms in a page's HTML, as contact-form-delivery.ts reads them in a browser. Forms drawn by script are not here. */
export function formsInHtml(html: string): FormInfo[] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const forms: FormInfo[] = [];
  for (const [n, m] of [...clean.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)].entries()) {
    const body = m[1]!;
    const id = `f${n}`;
    const labels = new Map<string, string>();
    for (const l of body.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
      const a = attrs(l[1]!);
      if (a.for) labels.set(a.for, textOf(l[2]!));
    }
    const fields: Field[] = [];
    let submitText = '';
    for (const f of body.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
      const tag = f[1]!.toLowerCase();
      const a = attrs(f[2]!);
      const type = (a.type || (tag === 'input' ? 'text' : '')).toLowerCase();
      if (type === 'submit' && !submitText) submitText = a.value || 'submit';
      if (SKIP_TYPES.has(type) || 'disabled' in a || 'readonly' in a) continue;
      let label = [labels.get(a.id ?? ''), a['aria-label'], a.placeholder, a.title].filter(Boolean).join(' ');
      // <label>Email <input></label>, or a caption just before the box.
      if (!label.trim()) label = textOf(body.slice(Math.max(0, f.index! - 300), f.index)).slice(-80);
      label = label.replace(/\s+/g, ' ').trim().slice(0, 160);
      fields.push({ id: `${id}-${fields.length}`, tag, type, name: a.name || a.id || '', label,
        required: 'required' in a || a['aria-required'] === 'true' || /\*/.test(label) });
    }
    submitText ||= textOf(/<button\b[^>]*>([\s\S]*?)<\/button>/i.exec(body)?.[1] ?? '');
    forms.push({ id, fields, submitText, captcha: FORM_CAPTCHA.test(body) ? 'a captcha on the form' : FORM_QUIZ.test(textOf(body)) ? 'a question that checks for robots' : null });
  }
  return forms;
}

/** A captcha anywhere on the page, as contact-form-delivery.ts snapshot() judges it. */
export function pageCaptcha(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  if (/just a moment|attention required|verify you are human/i.test(title)) return 'a Cloudflare check guards the page';
  if (/google\.com\/recaptcha|recaptcha\/api\.js|grecaptcha|g-recaptcha/i.test(html)) return 'reCAPTCHA';
  if (/hcaptcha\.com|h-captcha/i.test(html)) return 'hCaptcha';
  if (/challenges\.cloudflare\.com|cf-turnstile/i.test(html)) return 'Cloudflare Turnstile';
  if (/friendlycaptcha|frc-captcha|mtcaptcha|captcha\.(png|jpg|php)|really-simple-captcha|wpcf7-quiz|si_captcha/i.test(html)) return 'a captcha';
  return null;
}

/** Site builders and form services that draw the form with script, so the HTML has none to read. */
const SCRIPT_FORM = /static\.parastorage\.com|wix\.com\/|hbspt\.forms|js\.hsforms\.net|jotform\.com|typeform\.com|forms\.gle|docs\.google\.com\/forms|formstack\.com|cognitoforms\.com|tally\.so|squarespace\.com|weebly\.com|webflow\.com/i;

/** The verdict on a lead's pages, in reading order: the first page with a contact form decides, as in delivery. */
export function formVerdict(pages: Page[]): FormVerdict {
  let challenge: string | null = null;
  for (const page of pages) {
    const pick = pickForm(formsInHtml(page.html));
    const onPage = pageCaptcha(page.html);
    if (!pick) {
      if (onPage === 'a Cloudflare check guards the page') challenge ??= page.url;
      continue;
    }
    const captcha = pick.captcha ?? onPage;
    if (captcha) return { status: 'captcha', url: page.url, detail: captcha };
    const kinds = [...new Set(pick.fields.map(classify).filter(Boolean))].join(', ');
    return { status: 'bot_can_submit', url: page.url, detail: `contact form with ${kinds}` };
  }
  if (challenge) return { status: 'captcha', url: challenge, detail: 'a Cloudflare check guards the page' };
  const built = pages.find((p) => SCRIPT_FORM.test(p.html));
  if (built) return { status: 'script_form', url: built.url, detail: 'the site draws its forms with script (' + SCRIPT_FORM.exec(built.html)![0] + '); not checked' };
  return { status: 'no_form', url: null, detail: `no contact form in the HTML of ${pages.length} page(s)` };
}

// ---- email hosting, from MX records -----------------------------------------

/** Major mailbox providers, by the host their MX points to. Anything else is unknown. */
export const MAJOR_MX: Array<[RegExp, string]> = [
  [/(^|\.)(google\.com|googlemail\.com)$/, 'Google'],
  [/(^|\.)(outlook\.com|hotmail\.com|office365\.us)$/, 'Microsoft'],
  [/(^|\.)yahoodns\.net$/, 'Yahoo'],
  [/(^|\.)(icloud\.com|me\.com)$/, 'Apple iCloud'],
  [/(^|\.)zoho(mail)?\.(com|eu|in|jp|sa|com\.au|com\.cn)$/, 'Zoho'],
  [/(^|\.)(protonmail\.ch|proton\.me)$/, 'Proton'],
  [/(^|\.)yandex\.(net|ru|com)$/, 'Yandex'],
  [/(^|\.)mail\.ru$/, 'Mail.ru'],
  [/(^|\.)qq\.com$/, 'Tencent'],
  [/(^|\.)(163\.com|126\.com|netease\.com)$/, 'NetEase'],
  [/(^|\.)(mxhichina\.com|aliyun\.com)$/, 'Alibaba'],
  [/(^|\.)(gmx\.(net|com|de)|web\.de|mail\.com)$/, 'GMX / Web.de'],
  [/(^|\.)messagingengine\.com$/, 'Fastmail'],
  [/(^|\.)naver\.com$/, 'Naver'],
  [/(^|\.)(daum\.net|kakao\.com)$/, 'Kakao'],
];

/** The provider of a domain's mail, from its MX records, the most preferred first. */
export function mxProvider(records: Array<{ exchange: string; priority: number }>): Mx {
  const hosts = [...records].sort((a, b) => a.priority - b.priority).map((r) => r.exchange.toLowerCase().replace(/\.$/, '')).filter(Boolean);
  // No MX, or the null MX ("."): the domain takes no mail.
  if (!hosts.length) return { mx_class: 'none', mx_provider: null, mx: [] };
  const hit = MAJOR_MX.find(([re]) => re.test(hosts[0]!));
  if (hit) return { mx_class: 'major', mx_provider: hit[1], mx: hosts.slice(0, 3) };
  return { mx_class: 'unknown', mx_provider: null, mx: hosts.slice(0, 3) };
}

/** The domain does not exist, or has no MX: an answer, not a hiccup. */
const NO_RECORD = /^(ENOTFOUND|ENODATA)$/;
const mxCache = new Map<string, Promise<Mx>>();

/** One lookup per domain per hub; a DNS hiccup is asked once more, then counts as unknown. */
function lookupMx(domain: string, deps: Deps): Promise<Mx> {
  let hit = mxCache.get(domain);
  if (!hit) {
    hit = (async (): Promise<Mx> => {
      let last = '';
      for (let i = 0; i < 2; i++) {
        try { return mxProvider(await deps.resolveMx(domain)); }
        catch (cause) {
          last = String((cause as NodeJS.ErrnoException).code ?? (cause as Error).message);
          if (NO_RECORD.test(last)) return { mx_class: 'none', mx_provider: null, mx: [], error: last };
          await sleep(1_000);
        }
      }
      return { mx_class: 'unknown', mx_provider: null, mx: [], error: 'MX lookup failed: ' + last };
    })();
    if (mxCache.size > 50_000) mxCache.clear();
    mxCache.set(domain, hit);
  }
  return hit;
}

// ---- phones and social links -------------------------------------------------

let regions: Map<string, CountryCode> | null = null;
/** The two-letter code for a country name as the search lists write it ("Malaysia" → MY). */
export function countryCode(name: string | null | undefined): CountryCode | undefined {
  if (!regions) {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    regions = new Map(getCountries().map((c) => [names.of(c)!.toLowerCase(), c]));
    regions.set('usa', 'US'); regions.set('uk', 'GB'); regions.set('korea', 'KR'); regions.set('uae', 'AE');
  }
  return regions.get(String(name ?? '').trim().toLowerCase());
}

/** A phone as stored: E.164 and its type (MOBILE, FIXED_LINE, FIXED_LINE_OR_MOBILE, ...), or 'unparsed'. */
export function typePhone(raw: string, region: CountryCode | undefined, source: string): Phone {
  const parsed = parsePhoneNumberFromString(raw, region);
  if (!parsed?.isValid()) return { phone: raw, e164: parsed?.number ?? null, type: 'unparsed', source };
  return { phone: raw, e164: parsed.number, type: parsed.getType() ?? 'unknown', source };
}

/** The number in a wa.me or api.whatsapp.com link, always international. */
export function whatsappNumber(url: string): string | null {
  try {
    const u = new URL(url);
    const digits = (u.hostname.replace(/^www\./, '') === 'wa.me' ? u.pathname.slice(1) : u.searchParams.get('phone') ?? '').replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
  } catch { return null; }
}

const SOCIAL_HOST = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|linkedin\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|discord\.gg|discord\.com|t\.me|telegram\.me|line\.me|vk\.com|weibo\.com|xiaohongshu\.com|threads\.net)$/i;
const SHARE_PATH = /\/(sharer|share|intent|plugins|dialog|embed|watch|hashtag|search)\b|\/sharing\//i;

/** A link a company runs on a social network, not a share button or a video. */
export function socialUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol) || !SOCIAL_HOST.test(u.hostname.replace(/^www\./, ''))) return null;
    if (SHARE_PATH.test(u.pathname) || u.pathname.replace(/\/+$/, '') === '') return null;
    if (/(^|\.)discord\.com$/.test(u.hostname) && !u.pathname.startsWith('/invite')) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

/** The best method among what was found, in the order the outreach plan uses them. */
export function bestContactMethod(r: Omit<LeadResult, 'best_contact_method'>): Method {
  if (r.form.status === 'bot_can_submit') return 'contact-via-website';
  if (r.emails.some((e) => e.mx_class === 'unknown')) return 'unknown-hosting-email';
  if (r.emails.some((e) => e.mx_class === 'major')) return 'major-brand-email-hosting';
  if (r.phones.some((p) => p.type === 'MOBILE' || p.type === 'whatsapp')) return 'mobile-phone';
  if (r.social.length) return 'social-media';
  return 'no-viable-contact-method';
}

// ---- one lead ----------------------------------------------------------------

type Lead = { business: Record<string, unknown>; contact: Record<string, any> | null; country: string | null };
const CONTACT_URL = /contact|hubungi|enquir|inquir|get-in-touch/i;
type Found = { email?: string; source?: string; phone?: string; url?: string; type?: string };

/** One lead's contact methods. Never throws: a site that cannot be read leaves what step 1 stored. */
export async function processLead(lead: Lead, deps: Deps): Promise<LeadResult> {
  const b = lead.business;
  const region = countryCode(lead.country);
  const website = typeof b.website === 'string' ? b.website.trim() : '';
  const own = ownSiteUrl(website);
  const stored = lead.contact ?? {};
  const emailFound: Found[] = [...(stored.emails ?? [])];
  const phoneFound: Found[] = [...(typeof b.phone === 'string' && b.phone ? [{ phone: b.phone, source: 'maps' }] : []), ...(stored.phones ?? [])];
  const linkFound: Found[] = [...(stored.links ?? []), ...(website && !own ? [{ url: website, type: 'social' }] : [])];
  let form: FormVerdict = { status: !website ? 'no_website' : !own ? 'not_own_site' : 'unreachable', url: null, detail: '' };

  if (own) {
    const read: Page[] = [];
    const fetchPage = async (url: string) => { const page = await deps.fetchPage(url); read.push(page); return page; };
    let fresh: Record<string, any> = {};
    try { fresh = await researchWebsite(own, fetchPage); } catch (cause) { fresh = { errors: [{ error: (cause as Error).message }] }; }
    emailFound.push(...(fresh.emails ?? []));
    phoneFound.push(...(fresh.phones ?? []));
    linkFound.push(...(fresh.links ?? []));
    if (!read.length) form = { status: 'unreachable', url: own, detail: String(fresh.errors?.[0]?.error ?? 'the homepage did not load') };
    else {
      form = formVerdict(read);
      // No contact page was linked: try the usual paths, the first that loads.
      if (form.status === 'no_form' && !read.some((p) => CONTACT_URL.test(p.url))) {
        for (const path of ['/contact-us', '/contact']) {
          try { await fetchPage(new URL(path, read[0]!.url).href); form = formVerdict(read); break; } catch { /* try the next */ }
        }
      }
      form.pages = read.map((p) => p.url);
      for (const page of read) {
        for (const email of extractEmails(page.html)) emailFound.push({ email, source: page.url });
        for (const m of page.html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) linkFound.push({ url: decode(m[1]!), type: 'social' });
      }
    }
  }

  const emails = new Map<string, Omit<Email, keyof Mx>>();
  for (const e of emailFound) {
    const email = cleanEmail(String(e.email ?? ''));
    if (email && !emails.has(email)) emails.set(email, { email, domain: email.split('@')[1]!, source: String(e.source ?? '') });
  }
  const typed = await Promise.all([...emails.values()].map(async (e) => ({ ...e, ...await lookupMx(e.domain, deps) })));

  const phones = new Map<string, Phone>();
  for (const p of phoneFound) {
    const phone = typePhone(String(p.phone ?? ''), region, String(p.source ?? ''));
    const key = phone.e164 ?? phone.phone.replace(/\D/g, '');
    if (key && !phones.has(key)) phones.set(key, phone);
  }
  const social = new Set<string>();
  for (const l of linkFound) {
    if (l.type === 'whatsapp') {
      const n = whatsappNumber(String(l.url));
      if (n && !phones.has(n)) phones.set(n, { phone: n, e164: n, type: 'whatsapp', source: String(l.source ?? l.url) });
      continue;
    }
    const url = socialUrl(String(l.url ?? ''));
    if (url && social.size < 20) social.add(url);
  }

  const result = { form, emails: typed, phones: [...phones.values()], social: [...social] };
  return { best_contact_method: bestContactMethod(result), ...result };
}

const DEFAULT_DEPS: Deps = { fetchPage: getPage, resolveMx: (domain) => dns.resolveMx(domain) };

// ---- storage -----------------------------------------------------------------

let migrated: Promise<void> | null = null;
function migrate(): Promise<void> {
  migrated ??= (async () => {
    await db.sql(`
      create table if not exists list_step2_job (
        id            text primary key,
        name          text not null,
        source_run_id text not null,
        status        text not null default 'paused',
        created_at    timestamptz not null default now(),
        updated_at    timestamptz not null default now(),
        finished_at   timestamptz,
        lease_owner   text,
        lease_until   timestamptz
      )
    `);
    await db.sql(`
      create table if not exists list_step2_lead (
        job_id              text not null references list_step2_job(id) on delete cascade,
        run_id              text not null,
        place_key           text not null,
        place_id            text,
        status              text not null default 'pending',
        attempts            int not null default 0,
        best_contact_method text,
        form                jsonb,
        emails              jsonb,
        phones              jsonb,
        social              jsonb,
        error               text,
        updated_at          timestamptz not null default now(),
        primary key (job_id, place_key)
      )
    `);
    await db.sql(`create index if not exists list_step2_lead_pending on list_step2_lead (job_id) where status = 'pending'`);
    await db.sql(`create index if not exists list_step2_lead_place_id on list_step2_lead (place_id)`);
    await db.sql(`create index if not exists list_step2_lead_run_place on list_step2_lead (run_id, place_key)`);
  })().catch((err) => { migrated = null; throw err; });
  return migrated;
}

/** A job over a search-list run: all its checked businesses, a random sample, or chosen place_keys. */
export async function createJob(runId: string, opts: { name?: string; sample?: number; placeKeys?: string[] }): Promise<string> {
  await migrate();
  const run = (await db.sql(`select id from search_list_run where id = $1`, [runId])).rows[0];
  if (!run) throw invalid('no such search list run');
  const id = crypto.randomBytes(6).toString('hex');
  const name = opts.name || (opts.placeKeys ? `${opts.placeKeys.length} chosen leads of ${runId}` : opts.sample ? `sample of ${opts.sample} from ${runId}` : `all of ${runId}`);
  await db.sql(`insert into list_step2_job (id, name, source_run_id) values ($1, $2, $3)`, [id, name, runId]);
  // Only businesses step 1 has finished with; a running list's later ones need a later job.
  const where = `run_id = $2 and contact_status is not null and contact_status <> 'running'`;
  if (opts.placeKeys) await db.sql(`insert into list_step2_lead (job_id, run_id, place_key, place_id)
    select $1, run_id, place_key, business->>'place_id' from search_list_place where ${where} and place_key = any($3::text[])`, [id, runId, opts.placeKeys]);
  else if (opts.sample) await db.sql(`insert into list_step2_lead (job_id, run_id, place_key, place_id)
    select $1, run_id, place_key, business->>'place_id' from search_list_place where ${where} order by random() limit $3`, [id, runId, opts.sample]);
  else await db.sql(`insert into list_step2_lead (job_id, run_id, place_key, place_id)
    select $1, run_id, place_key, business->>'place_id' from search_list_place where ${where}`, [id, runId]);
  return id;
}

export async function jobStatus(id: string): Promise<Record<string, unknown> | null> {
  await migrate();
  const job = (await db.sql(`select * from list_step2_job where id = $1`, [id])).rows[0];
  if (!job) return null;
  const counts = (await db.sql(`
    select count(*)::int as total, count(*) filter (where status = 'done')::int as done,
           count(*) filter (where status = 'running')::int as running, count(*) filter (where error is not null)::int as errors
    from list_step2_lead where job_id = $1`, [id])).rows[0];
  const group = async (expr: string) => Object.fromEntries((await db.sql<{ k: string; n: number }>(
    `select ${expr} as k, count(*)::int as n from list_step2_lead where job_id = $1 and status = 'done' group by 1 order by 2 desc`, [id])).rows.map((r) => [r.k ?? 'none', r.n]));
  const providers = Object.fromEntries((await db.sql<{ k: string; n: number }>(`
    select coalesce(e->>'mx_provider', e->>'mx_class') as k, count(*)::int as n
    from list_step2_lead, jsonb_array_elements(coalesce(emails, '[]'::jsonb)) e where job_id = $1 group by 1 order by 2 desc`, [id])).rows.map((r) => [r.k, r.n]));
  return { ...job, leads: counts, bestContactMethod: await group('best_contact_method'), form: await group(`form->>'status'`), emailsByProvider: providers };
}

async function listJobs(): Promise<Array<Record<string, unknown>>> {
  await migrate();
  const ids = (await db.sql<{ id: string }>(`select id from list_step2_job order by created_at desc limit 20`)).rows;
  return (await Promise.all(ids.map((r) => jobStatus(r.id)))).filter((r): r is Record<string, unknown> => r !== null);
}

type Taken = { place_key: string; run_id: string };

/** Up to `limit` pending leads, marked running so no other loop takes them too. */
async function takeLeads(jobId: string, limit: number): Promise<Taken[]> {
  return (await db.sql<Taken>(`
    update list_step2_lead set status = 'running', attempts = attempts + 1, updated_at = now()
    where job_id = $1 and place_key in (
      select place_key from list_step2_lead where job_id = $1 and status = 'pending' order by place_key limit $2 for update skip locked)
    returning place_key, run_id`, [jobId, limit])).rows;
}

async function doLead(jobId: string, t: Taken, deps: Deps): Promise<void> {
  const place = (await db.sql<Lead>(`
    select p.business, p.contact,
           (select s.country from search_list_search s where s.run_id = p.run_id and s.idx = p.searches[1]) as country
    from search_list_place p where p.run_id = $1 and p.place_key = $2`, [t.run_id, t.place_key])).rows[0];
  if (!place) {
    await db.sql(`update list_step2_lead set status = 'done', best_contact_method = 'no-viable-contact-method', error = 'the business is gone from the search list', updated_at = now()
      where job_id = $1 and place_key = $2`, [jobId, t.place_key]);
    return;
  }
  const r = await processLead(place, deps);
  await db.sql(`update list_step2_lead set status = 'done', best_contact_method = $3, form = $4::jsonb, emails = $5::jsonb, phones = $6::jsonb, social = $7::jsonb,
      error = null, updated_at = now() where job_id = $1 and place_key = $2`,
    [jobId, t.place_key, r.best_contact_method, jsonParam(r.form), jsonParam(r.emails), jsonParam(r.phones), jsonParam(r.social)]);
}

/** The whole job, leads side by side, while this hub holds its lease. */
export async function work(jobId: string, deps: Deps = DEFAULT_DEPS): Promise<void> {
  // Leads taken by a hub that stopped are not being worked by anyone; one taken too often is closed.
  await db.sql(`update list_step2_lead set status = 'done', best_contact_method = 'no-viable-contact-method', error = 'not finished after ${MAX_ATTEMPTS} tries'
    where job_id = $1 and status = 'running' and attempts >= $2`, [jobId, MAX_ATTEMPTS]);
  await db.sql(`update list_step2_lead set status = 'pending' where job_id = $1 and status = 'running'`, [jobId]);
  let alive = true;
  const beat = setInterval(() => {
    db.sql(`update list_step2_job set lease_until = now() + make_interval(secs => $3), updated_at = now()
      where id = $1 and lease_owner = $2 and status = 'running' returning id`, [jobId, OWNER, LEASE_SECONDS])
      .then((r) => { if (!r.rowCount) alive = false; })
      .catch((err: Error) => console.warn('[list-step2] lease: ' + err.message));
  }, BEAT_MS);
  beat.unref();
  const queue: Taken[] = [];
  try {
    console.log(`[list-step2] job ${jobId}: working`);
    let refilling: Promise<void> | null = null;
    const refill = () => (refilling ??= takeLeads(jobId, LEAD_BATCH).then((rows) => { queue.push(...rows); }).finally(() => { refilling = null; }));
    await Promise.all(Array.from({ length: LEAD_CONCURRENCY }, async () => {
      while (alive) {
        if (!queue.length) await refill();
        const t = queue.shift();
        if (!t) return;
        try { await doLead(jobId, t, deps); }
        catch (cause) {
          console.error(`[list-step2] job ${jobId} ${t.place_key}: ${(cause as Error).message}`);
          await db.sql(`update list_step2_lead set status = 'pending' where job_id = $1 and place_key = $2 and status = 'running'`, [jobId, t.place_key]).catch(() => {});
          await sleep(5_000);
        }
      }
    }));
    if (!alive) return;
    const left = (await db.sql<{ n: number }>(`select count(*)::int as n from list_step2_lead where job_id = $1 and status <> 'done'`, [jobId])).rows[0]!;
    if (Number(left.n) === 0) {
      await db.sql(`update list_step2_job set status = 'done', finished_at = now(), updated_at = now() where id = $1 and status = 'running'`, [jobId]);
      console.log(`[list-step2] job ${jobId} done`);
    }
  } finally {
    clearInterval(beat);
    // A pause leaves taken leads unworked; they go back to be taken again.
    if (queue.length) await db.sql(`update list_step2_lead set status = 'pending' where job_id = $1 and place_key = any($2::text[]) and status = 'running'`,
      [jobId, queue.map((t) => t.place_key)]).catch(() => {});
    await db.sql(`update list_step2_job set lease_owner = null, lease_until = null where id = $1 and lease_owner = $2`, [jobId, OWNER]).catch(() => {});
  }
}

async function claim(): Promise<string | null> {
  const r = await db.sql<{ id: string }>(`
    update list_step2_job set lease_owner = $1, lease_until = now() + make_interval(secs => $2), updated_at = now()
    where id = (select id from list_step2_job
                where status = 'running' and (lease_until is null or lease_until < now())
                order by created_at limit 1 for update skip locked)
    returning id`, [OWNER, LEASE_SECONDS]);
  return r.rows[0]?.id ?? null;
}

async function lane(): Promise<void> {
  for (;;) {
    try {
      const id = await claim();
      if (id) await work(id);
      else await sleep(15_000);
    } catch (cause) {
      console.error('[list-step2] ' + ((cause as Error).message ?? String(cause)));
      await sleep(15_000);
    }
  }
}

export function start(): void {
  if (!db.configured()) return void console.warn('[list-step2] no report database; list processing step 2 is off');
  void migrate().then(() => lane()).catch((err: Error) => console.error('[list-step2] could not start: ' + err.message));
  console.log(`[list-step2] ${OWNER} runs list processing step 2`);
}

// ---- HTTP --------------------------------------------------------------------

type Ctx = {
  json: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
};

type Row = { place_key: string; place_id: string | null; status: string; best_contact_method: string | null; form: FormVerdict | null;
  emails: Email[] | null; phones: Phone[] | null; social: string[] | null; error: string | null; business: Record<string, unknown> | null };

async function leadRows(jobId: string, after: string, limit: number): Promise<Row[]> {
  return (await db.sql<Row>(`
    select l.place_key, l.place_id, l.status, l.best_contact_method, l.form, l.emails, l.phones, l.social, l.error, p.business
    from list_step2_lead l left join search_list_place p on p.run_id = l.run_id and p.place_key = l.place_key
    where l.job_id = $1 and l.place_key > $2 order by l.place_key limit $3`, [jobId, after, limit])).rows;
}

const CSV_FIELDS = ['name', 'website', 'maps_phone', 'best_contact_method', 'form_status', 'form_url', 'form_detail', 'emails', 'email_hosting',
  'mobile_phones', 'other_phones', 'social', 'place_id', 'status', 'error'];
const cell = (v: unknown): string => {
  let s = String(v ?? '');
  if (/^\s*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};

export function csvLine(r: Row): string {
  const b = r.business ?? {};
  const mobile = (r.phones ?? []).filter((p) => p.type === 'MOBILE' || p.type === 'whatsapp');
  const out: Record<string, unknown> = {
    name: b.name, website: b.website, maps_phone: b.phone, best_contact_method: r.best_contact_method,
    form_status: r.form?.status, form_url: r.form?.url, form_detail: r.form?.detail,
    emails: (r.emails ?? []).map((e) => e.email).join('; '),
    email_hosting: (r.emails ?? []).map((e) => `${e.email}: ${e.mx_provider ?? e.mx_class}`).join('; '),
    mobile_phones: mobile.map((p) => p.e164 ?? p.phone).join('; '),
    other_phones: (r.phones ?? []).filter((p) => !mobile.includes(p)).map((p) => `${p.e164 ?? p.phone} (${p.type})`).join('; '),
    social: (r.social ?? []).join('; '), place_id: r.place_id, status: r.status, error: r.error,
  };
  return CSV_FIELDS.map((f) => cell(out[f])).join(',');
}

/** The filter for businesses no step-2 job has finished yet. */
export const NOT_CHECKED = 'not-checked';
const BROWSE_PAGE = 100;

/**
 * Every business of the search lists, with the contact status the latest
 * finished step-2 job gave it, a page at a time, by name. `run` narrows to one
 * list, `status` to one best_contact_method (or not-checked).
 */
export async function browse(opts: { run?: string; status?: string; offset?: number }): Promise<Record<string, unknown>> {
  await migrate();
  const params: unknown[] = [];
  const run = opts.run ? `$${params.push(opts.run)}` : null;
  const latest = `select distinct on (run_id, place_key) run_id, place_key, best_contact_method, form, emails, phones, social, updated_at
    from list_step2_lead where status = 'done'${run ? ` and run_id = ${run}` : ''} order by run_id, place_key, updated_at desc`;
  const from = `from search_list_place p left join (${latest}) l on l.run_id = p.run_id and l.place_key = p.place_key where ${run ? `p.run_id = ${run}` : 'true'}`;
  const counts = Object.fromEntries((await db.sql<{ k: string; n: number }>(
    `select coalesce(l.best_contact_method, '${NOT_CHECKED}') as k, count(*)::int as n ${from} group by 1`, params)).rows.map((r) => [r.k, r.n]));
  const statusFilter = opts.status ? ` and coalesce(l.best_contact_method, '${NOT_CHECKED}') = $${params.push(opts.status)}` : '';
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const leads = (await db.sql(`
    select p.run_id, p.place_key, p.business, l.best_contact_method, l.form, l.emails, l.phones, l.social, l.updated_at as checked_at,
           (select array_agg(distinct s.industry) from search_list_search s where s.run_id = p.run_id and s.idx = any(p.searches)) as industries,
           (select array_agg(distinct s.country) from search_list_search s where s.run_id = p.run_id and s.idx = any(p.searches)) as countries
    ${from}${statusFilter}
    order by lower(p.business->>'name'), p.place_key limit ${BROWSE_PAGE} offset ${offset}`, params)).rows;
  const runs = (await db.sql(`select id, name from search_list_run order by created_at desc`)).rows;
  const total = opts.status ? counts[opts.status] ?? 0 : Object.values(counts).reduce((a, n) => a + n, 0);
  return { runs, counts, total, offset, pageSize: BROWSE_PAGE, leads };
}

/** /api/list-step2: create a job over a run (all, sample or chosen leads), read it, start, pause, its leads. All behind LAB_TOKEN. */
export async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, { json, readJson }: Ctx): Promise<boolean> {
  const p = url.pathname;
  if (p !== '/api/list-step2' && !p.startsWith('/api/list-step2/')) return false;
  if (!db.configured()) return json(res, 503, { error: 'no report database configured' }), true;
  const method = req.method ?? 'GET';
  try {
    if (p === '/api/list-step2') {
      if (method === 'GET') return json(res, 200, { jobs: await listJobs() }), true;
      if (method === 'POST') {
        const body = await readJson(req);
        const runId = String(body.run_id ?? '');
        if (!/^[a-f0-9]{12}$/.test(runId)) throw invalid('send {run_id, sample?, place_keys?, name?, start?}');
        const placeKeys = Array.isArray(body.place_keys) ? body.place_keys.map(String).slice(0, MAX_SAMPLE) : undefined;
        const sample = body.sample === undefined ? undefined : Number(body.sample);
        if (sample !== undefined && !(Number.isInteger(sample) && sample > 0 && sample <= MAX_SAMPLE)) throw invalid(`sample is 1 to ${MAX_SAMPLE} leads`);
        const id = await createJob(runId, { name: typeof body.name === 'string' ? body.name.trim().slice(0, 200) : undefined, sample, placeKeys });
        if (body.start === true) await db.sql(`update list_step2_job set status = 'running' where id = $1`, [id]);
        return json(res, 201, await jobStatus(id)), true;
      }
      return false;
    }
    if (p === '/api/list-step2/browse' && method === 'GET') {
      const run = url.searchParams.get('run') || undefined;
      const status = url.searchParams.get('status') || undefined;
      if (run && !/^[a-f0-9]{12}$/.test(run)) throw invalid('run is a search list id');
      if (status && status !== NOT_CHECKED && !(METHODS as readonly string[]).includes(status)) throw invalid('unknown status');
      return json(res, 200, await browse({ run, status, offset: Number(url.searchParams.get('offset')) || 0 })), true;
    }
    const m = /^\/api\/list-step2\/([a-f0-9]{12})(?:\/([a-z.]+))?$/.exec(p);
    if (!m) return false;
    const [, id, action] = m as unknown as [string, string, string | undefined];
    const job = await jobStatus(id);
    if (!job) return json(res, 404, { error: 'no such job' }), true;
    if (method === 'GET' && !action) return json(res, 200, job), true;
    if (method === 'POST' && (action === 'start' || action === 'pause')) {
      await db.sql(`update list_step2_job set status = $2, updated_at = now() where id = $1 and status <> 'done'`, [id, action === 'start' ? 'running' : 'paused']);
      return json(res, 200, await jobStatus(id)), true;
    }
    if (method === 'GET' && action === 'leads') {
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      return json(res, 200, { leads: await leadRows(id, url.searchParams.get('after') ?? '', limit) }), true;
    }
    if (method === 'GET' && action === 'leads.csv') {
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="list-step2-${id}.csv"`, 'cache-control': 'no-store' });
      res.write('﻿' + CSV_FIELDS.join(',') + '\n');
      for (let after = ''; ;) {
        const page = await leadRows(id, after, 2000);
        if (!page.length) break;
        if (!res.write(page.map(csvLine).join('\n') + '\n')) await new Promise((resolve) => res.once('drain', resolve));
        after = page[page.length - 1]!.place_key;
      }
      res.end();
      return true;
    }
    return false;
  } catch (cause) {
    const err = cause as Error & { code?: string };
    if (res.headersSent) { res.destroy(err); return true; }
    return json(res, err.code === 'bad_request' ? 400 : 500, { error: err.message }), true;
  }
}

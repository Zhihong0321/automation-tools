// Contact research on Exa: Exa finds the pages, our workers read the company's site.
// The contact worker's first choice: contact-worker.ts runs it while an Exa key
// has credits and falls back to v2 on Tavily otherwise. See docs/search-providers.md
// for the API notes and the benchmarks behind it.
//
// Cheapest first (research() below): the general search always; the company
// search only when neither the lead nor the general hits give the company's
// site; the people search only when the company has a site. Every step that did
// not run is on the report (research_meta.plan) with its reason.
//
// 1. Searches, all with userLocation MY: the name with its address, with full
//    text and highlights aimed at phones, emails and roles (the first ten
//    results' contents come in the search price); the people category, whose
//    results carry work history (name, title, company); and the company
//    category to find the company's own site.
// 2. The site, read on our worker PCs (pagefetch.ts): the home page, then the
//    contact, about and team pages its map lists.
// 3. The LLM extracts from those pages and the search snippets, as in v2.
import * as cw from './contact-worker.ts';
import { exa } from './core/index.ts';
import * as pagefetch from './pagefetch.ts';

type FetchImpl = typeof fetch;

const SEARCH_RESULTS = 10;
const PAGE_CHARS = 8_000;
const MAX_SEARCH_PAGES = 8;
const HIGHLIGHT_QUERY = 'phone number, mobile, WhatsApp, email address, owner, director, manager, founder';

type ExaResult = {
  url?: string;
  title?: string;
  text?: string;
  highlights?: string[];
  entities?: Array<Record<string, unknown>>;
  subpages?: ExaResult[];
};
type ExaAnswer = { results?: ExaResult[]; costDollars?: { total?: number }; statuses?: Array<{ id?: string; status?: string }> };

/** One Exa call through the app's core (core/exa.ts), which picks the key, rests a spent one and tries the next. */
async function call(endpoint: string, body: Record<string, unknown>, fetchImpl: FetchImpl, timeoutMs = 45_000): Promise<ExaAnswer> {
  try {
    return await exa.request(endpoint, body, { fetchImpl, timeoutMs }) as ExaAnswer;
  } catch (cause) {
    // An Exa error carries provider 'exa', so the worker can tell it from a model error and fall back to Tavily.
    throw Object.assign(cause as Error, { provider: 'exa' });
  }
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

type Props = Record<string, unknown>;

/**
 * A people-category result as one line Pi can read: the name, then each job in
 * its work history that is still open ("present"), as printed by Exa. Old jobs
 * are left out so Pi does not take a former role as a current one.
 */
export function personLine(result: ExaResult): string {
  const entity = (result.entities ?? []).find((row) => /person/i.test(String(row.type ?? 'person')));
  const props = (entity?.properties ?? entity ?? {}) as Props;
  const name = clean(props.name, 120);
  if (!name) return '';
  const jobs = (Array.isArray(props.workHistory) ? props.workHistory : []) as Props[];
  const current = jobs.filter((job) => {
    const dates = (job.dates ?? {}) as Props;
    return !dates.to;
  }).map((job) => {
    const company = clean(((job.company ?? {}) as Props).name, 120);
    return [clean(job.title, 120), company && `at ${company}`].filter(Boolean).join(' ');
  }).filter(Boolean);
  const location = clean(props.location, 80);
  return `${name}${current.length ? ' — now: ' + current.slice(0, 3).join('; ') : ''}${location ? ' — ' + location : ''}`;
}

/** A company-category result's own site, when its entity says the company is in Malaysia. */
function companyHome(result: ExaResult): string {
  const entity = (result.entities ?? [])[0];
  const props = (entity?.properties ?? entity ?? {}) as Props;
  const country = clean(((props.headquarters ?? {}) as Props).country, 60);
  if (country && !/malaysia|^my$/i.test(country)) return '';
  try { return new URL(String(result.url)).origin + '/'; } catch { return ''; }
}

type Spec = { purpose: cw.SearchLog['purpose']; query: string; body: Record<string, unknown> };

/** The lead's name without a Maps note in brackets: "Yasrree (M) Sdn.Bhd [Warehouse and Office]" searches as "Yasrree (M) Sdn.Bhd". */
export function searchName(name: string): string {
  return name.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim() || name.trim();
}

function generalSpec(target: cw.Target): Spec {
  const name = searchName(target.name);
  const location = target.location.trim();
  return {
    purpose: 'general',
    query: `${location ? `${name}, ${location}` : name} Malaysia contact phone email`,
    body: {
      type: 'auto', numResults: SEARCH_RESULTS, userLocation: 'MY',
      contents: { text: { maxCharacters: PAGE_CHARS }, highlights: { query: HIGHLIGHT_QUERY, maxCharacters: 1_500 } },
    },
  };
}

function peopleSpec(target: cw.Target): Spec {
  return {
    purpose: 'people',
    query: `professional profiles of the owner, founder, director or manager at ${cw.coreName(target.name.trim())}, Malaysia`,
    body: { type: 'auto', category: 'people', numResults: SEARCH_RESULTS, userLocation: 'MY', contents: { highlights: { maxCharacters: 800 } } },
  };
}

function siteSpec(target: cw.Target): Spec {
  const name = searchName(target.name);
  const location = target.location.trim();
  return {
    purpose: 'site',
    query: `${location ? `${name}, ${location}` : name} Malaysia company homepage`,
    body: { type: 'auto', category: 'company', numResults: 5, userLocation: 'MY' },
  };
}

type Found = { searched: cw.Searched; pages: cw.Page[]; dollars: number; companySites: string[] };

const EMPTY: Found = { searched: { sources: [], queries: [], log: [] }, pages: [], dollars: 0, companySites: [] };

/** One Exa search, as sources, read pages and cost. Only the general search may throw; the others answer empty. */
async function runSpec(target: cw.Target, spec: Spec, fetchImpl: FetchImpl): Promise<Found> {
  let answer: ExaAnswer;
  try {
    answer = await call('search', { query: spec.query, ...spec.body }, fetchImpl);
  } catch (cause) {
    // People and company searches are a bonus; the general search must answer.
    if (spec.purpose === 'general') throw cause;
    console.warn(`[contact] ${target.name}: Exa ${spec.purpose} search failed: ${(cause as Error).message.slice(0, 120)}`);
    return { ...EMPTY, searched: { sources: [], queries: [spec.query], log: [{ provider: 'exa', purpose: spec.purpose, query: spec.query + ' (failed)', results: 0, dollars: 0 }] } };
  }
  const results = answer.results ?? [];
  const dollars = answer.costDollars?.total ?? 0;
  const log: cw.SearchLog[] = [{ provider: 'exa', purpose: spec.purpose, query: spec.query, results: results.length, dollars }];
  if (spec.purpose === 'site') {
    return { searched: { sources: [], queries: [spec.query], log }, pages: [], dollars, companySites: results.map(companyHome).filter(Boolean) };
  }
  const hits = results.map((row) => {
    const highlights = (row.highlights ?? []).join(' … ');
    const content = spec.purpose === 'people' ? [personLine(row), highlights].filter(Boolean).join(' | ') : highlights;
    return { url: String(row.url ?? ''), title: clean(row.title, 200), content: clean(content, 600) };
  });
  const found = cw.toSources(target, hits, 'exa');
  const sources = spec.purpose === 'people' ? found.map((source) => ({ ...source, kind: 'social' })) : found;
  const pages: cw.Page[] = [];
  if (spec.purpose === 'general') {
    for (const row of results) {
      const url = cw.publicUrl(row.url);
      const text = String(row.text ?? '').trim();
      if (!url || !text || cw.isLinkedinPerson(url) || cw.isJobAdvertisement(url) || cw.isStalePdf(url)) continue;
      pages.push({ url, text: text.slice(0, PAGE_CHARS) });
    }
  }
  return { searched: { sources, queries: [spec.query], log }, pages: dedupe(pages, (p) => p.url).slice(0, MAX_SEARCH_PAGES), dollars, companySites: [] };
}

function merge(...parts: Found[]): Found {
  return {
    searched: {
      sources: dedupe(parts.flatMap((part) => part.searched.sources), (s) => s.url),
      queries: parts.flatMap((part) => part.searched.queries),
      log: parts.flatMap((part) => part.searched.log),
    },
    pages: dedupe(parts.flatMap((part) => part.pages), (p) => p.url),
    dollars: parts.reduce((sum, part) => sum + part.dollars, 0),
    companySites: parts.flatMap((part) => part.companySites),
  };
}

function dedupe<T>(rows: T[], urlOf: (row: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = cw.dedupeKey(urlOf(row));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The tel:, mailto: and WhatsApp links a page carries, which its text often leaves out. */
export function contactLinks(links: string[]): string[] {
  return [...new Set(links.filter((link) => /^(?:tel:|mailto:|https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/)/i.test(link))
    .map((link) => decodeURIComponent(link.replace(/[?#].*$/, '')).slice(0, 120)))].slice(0, 12);
}

/**
 * The company's own site, read on our own worker PCs (pagefetch.ts, through
 * myworker), never bought from Exa: the home page's links and sitemap give the
 * site's pages, and the home page plus its contact, about, team and management
 * pages are read. Never throws; a site no worker could read is a log line.
 */
async function readSite(site: string, deps: SiteDeps): Promise<{ pages: cw.Page[]; log: cw.SearchLog[] }> {
  const log: cw.SearchLog[] = [];
  try {
    const map = await (deps.mapSite ?? pagefetch.mapSite)(site, { limit: 60 });
    log.push({ provider: 'fetch-worker', purpose: 'site', query: `map ${site} on ${map.worker ?? 'myworker'}${map.error ? ' (' + map.error.slice(0, 80) + ')' : ''}`, results: map.results.length, dollars: 0 });
    const urls = cw.pickSitePages(site, map.results.length ? map.results : [site]);
    const read = await (deps.readPages ?? pagefetch.read)(urls);
    const pages = read.results.flatMap((row): cw.Page[] => {
      const url = cw.publicUrl(row.url);
      const text = String(row.raw_content ?? '').trim();
      return url && text ? [{ url, text: text.slice(0, PAGE_CHARS) }] : [];
    });
    log.push({ provider: 'fetch-worker', purpose: 'extract', query: `read ${urls.length} page(s) of ${site} on ${read.worker ?? 'myworker'}${read.failed_results.length ? ` (${read.failed_results.length} failed)` : ''}`, results: pages.length, dollars: 0 });
    return { pages: dedupe(pages, (p) => p.url), log };
  } catch (cause) {
    // No worker answered: the search pages still carry the research.
    log.push({ provider: 'fetch-worker', purpose: 'extract', query: `read ${site} failed: ${(cause as Error).message.slice(0, 120)}`, results: 0, dollars: 0 });
    return { pages: [], log };
  }
}

type SiteDeps = { readPages?: typeof pagefetch.read; mapSite?: typeof pagefetch.mapSite };

/** One step of the search plan as the report records it: whether it ran, and why. */
export type PlanStep = { step: 'general' | 'site' | 'people'; ran: boolean; why: string };

/**
 * Leads with no website and no site found anywhere: the people search found a
 * LinkedIn person for 6-9% of them, against 16-43% for leads with a site
 * (996 prod reports, 31 Oct - 1 Nov 2026). For them it is skipped, and the
 * report says so.
 */
export const PEOPLE_SKIP_WHY = 'skipped: no website on the lead and none found; the people search finds someone for only 6-9% of such leads';

/**
 * One company through the Exa pipeline, cheapest first. Same result shape as
 * contact-worker's research().
 *
 * 1. Always: the general search (name and address, with page text). A lead with
 *    a website also gets its site read on our workers (free) and the people
 *    search, all at once.
 * 2. No website on the lead: the company's site from the general hits, and only
 *    when none of them is the site, the company-category search.
 * 3. The people search runs when the company has a site (the lead's or one
 *    found), and is skipped, with the reason on the report, when it has none.
 *
 * Two Exa calls for most leads instead of three; a site found costs nothing to read.
 */
export async function research(raw: unknown, deps: { fetchImpl?: FetchImpl; timeoutMs?: number } & SiteDeps): Promise<Record<string, unknown>> {
  const target = cw.targetFromPayload(raw);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const given = cw.publicUrl(target.website) && !cw.isSearchPage(target.website) ? cw.publicUrl(target.website) : '';
  const plan: PlanStep[] = [];

  // Step 1: the general search; with a website, its site read and the people search alongside.
  const peopleEarly = given ? runSpec(target, peopleSpec(target), fetchImpl) : null;
  const siteEarly = given ? readSite(given, deps) : null;
  const general = await runSpec(target, generalSpec(target), fetchImpl);
  plan.push({ step: 'general', ran: true, why: 'always: name and address, with page text' });

  // Step 2: the company's own site.
  let site = given || cw.officialSite(target, general.searched.sources);
  let company = EMPTY;
  if (given) {
    plan.push({ step: 'site', ran: false, why: 'skipped: the lead has a website' });
  } else if (site) {
    plan.push({ step: 'site', ran: false, why: `skipped: the general search found the site (${site})` });
  } else {
    company = await runSpec(target, siteSpec(target), fetchImpl);
    site = company.companySites.find((url) => cw.officialSite({ ...target, website: '' }, [{ url, kind: 'other', why: '' }])) || '';
    plan.push({ step: 'site', ran: true, why: site ? `no site on the lead or in the general hits; found ${site}` : 'no site on the lead or in the general hits; none found' });
  }

  // Step 3: the people search, when the company has a site.
  let people: Promise<Found> = Promise.resolve(EMPTY);
  if (peopleEarly) {
    people = peopleEarly;
    plan.push({ step: 'people', ran: true, why: 'the lead has a website' });
  } else if (site) {
    people = runSpec(target, peopleSpec(target), fetchImpl);
    plan.push({ step: 'people', ran: true, why: 'the company has a site' });
  } else {
    plan.push({ step: 'people', ran: false, why: PEOPLE_SKIP_WHY });
  }
  const [siteRead, peopleFound] = await Promise.all([siteEarly ?? (site ? readSite(site, deps) : Promise.resolve({ pages: [], log: [] })), people]);

  const found = merge(general, peopleFound, company);
  // Site pages first: they are the company's own words.
  const pages = dedupe([...siteRead.pages, ...found.pages], (p) => p.url);
  const searched: cw.Searched = { ...found.searched, log: [...found.searched.log, ...siteRead.log] };
  const pageFoundBy = new Map(pages.map((page) => [cw.dedupeKey(page.url), 'exa']));
  const result = await cw.extractResult(target, searched, pages, deps.timeoutMs ?? cw.resolveConfig().timeoutMs, pages.map((page) => page.url), pageFoundBy);
  const meta = result.research_meta as Record<string, unknown>;
  meta.engine = 'exa pipeline + ' + String(meta.engine).split(' + ').pop();
  meta.pipeline = 'exa';
  meta.official_site = site || null;
  meta.plan = plan;
  meta.cost = { dollars: Number(found.dollars.toFixed(4)), exa_searches: found.searched.log.filter((row) => row.provider === 'exa').length };
  return result;
}

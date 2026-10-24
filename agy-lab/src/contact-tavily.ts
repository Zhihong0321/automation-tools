// Contact research on Tavily alone: Tavily finds the pages and Tavily reads them.
// Not wired to the job queue yet; benchmarked against the v2 pipeline in
// contact-worker.ts. See docs/search-providers.md for the API notes behind it.
//
// 1. Three searches, all topic general and country malaysia: the name with its
//    address, the name with the roles and contact words we want, and LinkedIn
//    only. The first two ask for raw_content, which costs nothing extra, so the
//    directory and Facebook pages arrive already read.
// 2. The company's own site (the lead's website, or a hit whose host spells the
//    name): Map lists its pages, and Extract reads the home page and the ones
//    whose path says contact, about, team or management.
// 3. Pi extracts from those pages and the search snippets, as in v2.
import * as cw from './contact-worker.ts';
import * as tavily from './tavily.ts';

type FetchImpl = typeof fetch;

const API = 'https://api.tavily.com';
const SEARCH_RESULTS = 10;
const RAW_PAGE_CHARS = 8_000;
const MAX_SEARCH_PAGES = 8;
const MAP_LIMIT = 40;
/** PAYG price per credit, for the report's cost line. */
export const DOLLARS_PER_CREDIT = 0.008;

function fail(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/** One Tavily call. Quota and rate-limit errors carry the codes tavily.releaseFor reads. */
async function call<T>(endpoint: string, body: Record<string, unknown>, apiKey: string, fetchImpl: FetchImpl, timeoutMs = 45_000): Promise<T & { usage?: { credits?: number } }> {
  let res: Response;
  try {
    res = await fetchImpl(`${API}/${endpoint}`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, include_usage: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    throw fail(name === 'TimeoutError' || name === 'AbortError' ? `tavily ${endpoint} timed out` : `upstream error: ${(cause as Error)?.message ?? cause}`, 'timeout');
  }
  const raw = await res.text();
  if (res.status === 432 || res.status === 433) throw fail(`tavily quota exceeded (${res.status}): ${raw.slice(0, 200)}`, 'quota');
  if (res.status === 429) throw fail(`429 rate_limit_error: tavily rate limit: ${raw.slice(0, 200)}`, 'rate_limit');
  if (!res.ok) throw fail(`upstream error: tavily ${endpoint} answered ${res.status}: ${raw.slice(0, 200)}`, res.status === 403 ? 'unsupported' : 'timeout');
  try { return JSON.parse(raw); } catch { throw fail(`tavily ${endpoint} answered non-JSON`, 'timeout'); }
}

type RawResult = { url?: string; title?: string; content?: string; raw_content?: string | null; score?: number };

type SearchSpec = { purpose: cw.SearchLog['purpose']; query: string; body: Record<string, unknown> };

function searches(target: cw.Target): SearchSpec[] {
  const name = target.name.trim();
  const location = target.location.trim();
  const base = { topic: 'general', country: 'malaysia', max_results: SEARCH_RESULTS };
  return [
    {
      purpose: 'general',
      query: location ? `"${name}" ${location}` : `"${name}"`,
      body: { ...base, search_depth: 'advanced', chunks_per_source: 3, include_raw_content: 'text' },
    },
    {
      purpose: 'people',
      query: `"${name}" owner OR director OR "managing director" OR manager OR founder phone email`,
      body: { ...base, search_depth: 'advanced', chunks_per_source: 3, include_raw_content: 'text' },
    },
    {
      purpose: 'linkedin',
      query: `"${cw.coreName(name)}" director OR manager OR owner OR founder Malaysia`,
      body: { ...base, search_depth: 'basic', chunks_per_source: 3, include_domains: ['linkedin.com'] },
    },
  ];
}

type Found = { searched: cw.Searched; pages: cw.Page[]; credits: number };

async function runSearches(target: cw.Target, apiKey: string, fetchImpl: FetchImpl): Promise<Found> {
  const specs = searches(target);
  const answers = await Promise.all(specs.map((spec) =>
    call<{ results?: RawResult[] }>('search', { query: spec.query, ...spec.body }, apiKey, fetchImpl)
      .catch((cause: Error) => {
        // LinkedIn is a bonus; the two general searches must answer.
        if (spec.purpose === 'linkedin') return { results: [] as RawResult[], usage: { credits: 0 } };
        throw cause;
      })));
  const sources: cw.Source[] = [];
  const pages: cw.Page[] = [];
  const log: cw.SearchLog[] = [];
  let credits = 0;
  answers.forEach((answer, i) => {
    const spec = specs[i]!;
    const results = answer.results ?? [];
    const spent = answer.usage?.credits ?? (spec.body.search_depth === 'advanced' ? 2 : 1);
    credits += spent;
    tavily.pool.spend(apiKey, spent);
    log.push({ provider: 'tavily', purpose: spec.purpose, query: spec.query, results: results.length, credits: spent });
    const hits = results.map((row) => ({ url: String(row.url ?? ''), title: clean(row.title, 200), content: clean(row.content, 600) }));
    const found = cw.toSources(target, hits, 'tavily');
    sources.push(...(spec.purpose === 'linkedin' ? found.map((source) => ({ ...source, kind: 'social' })) : found));
    for (const row of results) {
      const url = cw.publicUrl(row.url);
      const text = String(row.raw_content ?? '').trim();
      if (!url || !text || cw.isLinkedinPerson(url) || cw.isJobAdvertisement(url) || cw.isStalePdf(url)) continue;
      pages.push({ url, text: text.slice(0, RAW_PAGE_CHARS) });
    }
  });
  return { searched: { sources: dedupeSources(sources), queries: specs.map((spec) => spec.query), log }, pages: dedupePages(pages).slice(0, MAX_SEARCH_PAGES), credits };
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function dedupeSources(sources: cw.Source[]): cw.Source[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = cw.dedupeKey(source.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupePages(pages: cw.Page[]): cw.Page[] {
  const seen = new Set<string>();
  return pages.filter((page) => {
    const key = cw.dedupeKey(page.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


/** Map the company's site, then Extract the home page and its contact, about and team pages. */
async function readSite(site: string, apiKey: string, fetchImpl: FetchImpl): Promise<{ pages: cw.Page[]; log: cw.SearchLog[]; credits: number }> {
  const log: cw.SearchLog[] = [];
  let credits = 0;
  let mapped: string[] = [];
  try {
    const host = new URL(site).hostname.replace(/^www\./, '').replace(/\./g, '\\.');
    const map = await call<{ results?: string[] }>('map', {
      url: site, max_depth: 2, max_breadth: 30, limit: MAP_LIMIT, allow_external: false,
      select_domains: [`^(www\\.)?${host}$`], timeout: 30,
    }, apiKey, fetchImpl);
    mapped = Array.isArray(map.results) ? map.results.filter((url) => typeof url === 'string') : [];
    const spent = map.usage?.credits ?? Math.ceil(mapped.length / 10);
    credits += spent;
    log.push({ provider: 'tavily', purpose: 'site', query: 'map ' + site, results: mapped.length, credits: spent });
  } catch (cause) {
    log.push({ provider: 'tavily', purpose: 'site', query: `map ${site} (failed: ${(cause as Error).message.slice(0, 80)})`, results: 0, credits: 0 });
    if ((cause as { code?: string }).code === 'quota' || (cause as { code?: string }).code === 'rate_limit') throw cause;
  }
  const urls = cw.pickSitePages(site, mapped);
  const extracted = await extract(urls, apiKey, fetchImpl, 'basic');
  credits += extracted.credits;
  log.push({ provider: 'tavily', purpose: 'extract', query: `extract ${urls.length} page(s) of ${site}`, results: extracted.pages.length, credits: extracted.credits });
  let pages = extracted.pages;
  // Nothing read on basic: the site likely renders in JavaScript; advanced handles that.
  if (!pages.length && urls.length) {
    const retry = await extract(urls.slice(0, 3), apiKey, fetchImpl, 'advanced');
    credits += retry.credits;
    log.push({ provider: 'tavily', purpose: 'extract', query: `extract advanced ${Math.min(3, urls.length)} page(s) of ${site}`, results: retry.pages.length, credits: retry.credits });
    pages = retry.pages;
  }
  tavily.pool.spend(apiKey, credits);
  return { pages, log, credits };
}

async function extract(urls: string[], apiKey: string, fetchImpl: FetchImpl, depth: 'basic' | 'advanced'): Promise<{ pages: cw.Page[]; credits: number }> {
  if (!urls.length) return { pages: [], credits: 0 };
  try {
    const out = await call<{ results?: Array<{ url?: string; raw_content?: string }> }>('extract', {
      urls, extract_depth: depth, format: 'text', timeout: depth === 'advanced' ? 30 : 15,
    }, apiKey, fetchImpl, 60_000);
    const pages = (out.results ?? []).flatMap((row): cw.Page[] => {
      const url = cw.publicUrl(row.url);
      const text = String(row.raw_content ?? '').trim();
      return url && text ? [{ url, text: text.slice(0, RAW_PAGE_CHARS) }] : [];
    });
    // Extract bills a fraction (1 or 2 credits per 5 pages) that include_usage may round to 0.
    const credits = out.usage?.credits || (pages.length ? Math.ceil(pages.length / 5) * (depth === 'advanced' ? 2 : 1) : 0);
    return { pages, credits };
  } catch (cause) {
    const code = (cause as { code?: string }).code;
    if (code === 'quota' || code === 'rate_limit') throw cause;
    return { pages: [], credits: 0 };
  }
}

/** One company through the Tavily pipeline with one key. Same result shape as contact-worker's research(). */
export async function research(raw: unknown, deps: { apiKey: string; fetchImpl?: FetchImpl; timeoutMs?: number }): Promise<Record<string, unknown>> {
  const target = cw.targetFromPayload(raw);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const found = await runSearches(target, deps.apiKey, fetchImpl);
  const site = cw.officialSite(target, found.searched.sources);
  const siteRead = site ? await readSite(site, deps.apiKey, fetchImpl) : { pages: [], log: [], credits: 0 };
  // Site pages first: they are the company's own words.
  const pages = dedupePages([...siteRead.pages, ...found.pages]);
  const searched: cw.Searched = { ...found.searched, log: [...found.searched.log, ...siteRead.log] };
  const pageFoundBy = new Map(pages.map((page) => [cw.dedupeKey(page.url), 'tavily']));
  const result = await cw.extractResult(target, searched, pages, deps.timeoutMs ?? cw.resolveConfig().timeoutMs, pages.map((page) => page.url), pageFoundBy);
  const credits = found.credits + siteRead.credits;
  const meta = result.research_meta as Record<string, unknown>;
  meta.engine = 'tavily pipeline + ' + String(meta.engine).split(' + ').pop();
  meta.pipeline = 'tavily';
  meta.official_site = site || null;
  meta.cost = { tavily_credits: credits, dollars: Number((credits * DOLLARS_PER_CREDIT).toFixed(4)) };
  return result;
}

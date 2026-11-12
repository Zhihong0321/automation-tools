// Reading a page on our own worker PCs instead of buying the read from Tavily.
//
// WHY. Tavily's /extract is the most expensive thing a company dive does per
// page, and what it hands back is a page we could read ourselves: it fetches
// the URL, strips the chrome and returns the text. Our worker PCs (this PC, the
// Mac mini) sit on home lines websites actually serve, and a page read there
// costs nothing.
//
// HOW, since 2026-11-12. Every page read goes to the Local Gmap Worker service,
// https://myworker.up.railway.app (core/myworker.ts): one POST /api/fetch per
// URL, all of a batch at once. The service hands each read to a live worker PC
// and answers with the page as markdown. Until then reads were `fetch.pages`
// broker jobs on this hub, claimed by the Crawl4AI lane (local-fetch-worker/).
//
// THE ANSWER SHAPE is Tavily's /extract shape — `results[].raw_content` and
// `failed_results[]` — so companydive's addExtractResults reads it unchanged
// and nothing downstream of the ledger knows the provider changed.
//
// NEVER THROWS. A page that could not be read, for any reason (the site, the
// worker, the service, no key), is a `failed_results` row carrying the reason,
// so one dead page never loses the nineteen that worked and the step carries on
// from what it has. No fallback to Tavily: that would hide a dead worker behind a
// bill that looks normal.
import { myworker } from './core/index.ts';

/** Tavily's own /extract ceiling, kept so the two are swappable per call. */
export const MAX_URLS = 20;

/** Per-page deadline the service gives its worker; a slow PDF gets what it has by then. */
const PAGE_TIMEOUT_MS = 90_000;

export type Page = { url: string; raw_content: string };
export type Failed = { url: string; error: string };

/** Tavily's /extract answer shape, so callers need no branch of their own. */
export type ExtractAnswer = {
  results: Page[];
  failed_results: Failed[];
  usage: { credits: number };
  /** Which machine(s) read the pages, for the dive's own report. */
  worker: string | null;
};

export type ReadOptions = {
  /** Per-page deadline on the worker; for tests. */
  timeoutMs?: number;
  /** For tests: stands in for core's myworker.fetchPage. */
  fetchPage?: typeof myworker.fetchPage;
};

/** One URL through myworker, as a page or a failed row. Never throws. */
async function readOne(url: string, opts: ReadOptions): Promise<{ page?: Page; failed?: Failed; worker?: string | null }> {
  try {
    const job = await (opts.fetchPage ?? myworker.fetchPage)(url, { timeoutMs: opts.timeoutMs ?? PAGE_TIMEOUT_MS });
    const text = String(job?.result?.content ?? '').trim();
    if (job?.status === 'done' && text) return { page: { url, raw_content: text }, worker: job.worker };
    const why = job?.status === 'done'
      ? 'the page had no text'
      : job?.error || (job?.status ? `the read was still ${job.status} when the service answered` : 'the worker returned nothing for this URL');
    return { failed: { url, error: String(why).slice(0, 300) }, worker: job?.worker ?? null };
  } catch (cause) {
    return { failed: { url, error: String((cause as Error)?.message ?? cause).slice(0, 300) } };
  }
}

/**
 * Read these pages on the worker PCs through myworker. Answers in Tavily's
 * /extract shape; every URL asked for is either a result or a failed_result.
 */
export async function read(urls: string[], opts: ReadOptions = {}): Promise<ExtractAnswer> {
  const wanted = [...new Set((urls ?? []).map((u) => String(u ?? '').trim()).filter(Boolean))].slice(0, MAX_URLS);
  if (!wanted.length) return { results: [], failed_results: [], usage: { credits: 0 }, worker: null };

  const done = await Promise.all(wanted.map((url) => readOne(url, opts)));
  const results = done.flatMap((d) => (d.page ? [d.page] : []));
  const failed = done.flatMap((d) => (d.failed ? [d.failed] : []));
  const workers = [...new Set(done.map((d) => d.worker).filter((w): w is string => Boolean(w)))];
  if (!results.length && failed.length) {
    console.warn(`[pagefetch] myworker read none of ${wanted.length} page(s): ${failed[0]!.error}`);
  }
  return { results, failed_results: failed, usage: { credits: 0 }, worker: workers.length ? workers.join(', ') : 'myworker' };
}

// ---------------------------------------------------------------- site map

/** What Tavily's /map gave: the site's own URLs. Built on our workers instead. */
export type SiteMap = { results: string[]; worker: string | null; error: string | null; usage: { credits: number } };

const ASSET = /\.(?:jpe?g|png|gif|webp|svg|ico|css|js|mjs|json|xml|zip|rar|mp4|mp3|webm|woff2?|ttf|eot)(?:[?#]|$)/i;

function sameSite(a: string, b: string): boolean {
  return a.replace(/^www\./, '') === b.replace(/^www\./, '');
}

/** Absolute same-site page URLs from a page's HTML hrefs, in page order. */
export function linksOf(html: string, base: string): string[] {
  const out: string[] = [];
  const host = new URL(base).hostname;
  for (const m of String(html ?? '').matchAll(/href\s*=\s*["']([^"'#]+)/gi)) {
    try {
      const u = new URL(m[1]!.trim(), base);
      if (!/^https?:$/.test(u.protocol) || !sameSite(u.hostname, host) || ASSET.test(u.pathname)) continue;
      u.hash = '';
      out.push(u.toString());
    } catch { /* not a URL */ }
  }
  return out;
}

/** <loc> entries of a sitemap or sitemap index. */
export function locsOf(xml: string): string[] {
  return [...String(xml ?? '').matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map((m) => m[1]!.trim());
}

/**
 * The site's own pages, the stand-in for Tavily /map: the home page's links
 * first (the pages its owner put in the menu), then its sitemap.xml (one level
 * of a sitemap index followed). Read on our workers through myworker. Never
 * throws: a site that answers nothing is an empty map with the reason.
 */
export async function mapSite(site: string, opts: ReadOptions & { limit?: number } = {}): Promise<SiteMap> {
  const limit = Math.max(1, opts.limit ?? 50);
  let home: URL;
  try { home = new URL(/^https?:\/\//i.test(site) ? site : 'https://' + site); } catch {
    return { results: [], worker: null, error: `not a URL: ${String(site).slice(0, 100)}`, usage: { credits: 0 } };
  }
  const get = opts.fetchPage ?? myworker.fetchPage;
  const workers = new Set<string>();
  const errors: string[] = [];
  const raw = async (url: string, format: 'html' | 'text'): Promise<string> => {
    try {
      const job = await get(url, { timeoutMs: opts.timeoutMs ?? 60_000, format, mainContent: false });
      if (job?.worker) workers.add(job.worker);
      if (job?.status === 'done') return String(job.result?.content ?? '');
      errors.push(`${url}: ${job?.error ?? job?.status ?? 'no answer'}`);
    } catch (cause) {
      errors.push(`${url}: ${(cause as Error)?.message ?? cause}`);
    }
    return '';
  };

  const root = home.origin + '/';
  const [html, xml] = await Promise.all([raw(root, 'html'), raw(home.origin + '/sitemap.xml', 'text')]);
  let locs = locsOf(xml);
  if (/<sitemapindex/i.test(xml)) {
    const children = locs.slice(0, 3);
    locs = (await Promise.all(children.map((u) => raw(u, 'text').then(locsOf)))).flat();
  }
  const seen = new Set<string>();
  const results: string[] = [];
  for (const u of [root, ...linksOf(html, root), ...locs.filter((u) => { try { return sameSite(new URL(u).hostname, home.hostname) && !ASSET.test(new URL(u).pathname); } catch { return false; } })]) {
    const key = u.replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(u);
    if (results.length >= limit) break;
  }
  const error = results.length > 1 ? null : errors.join('; ').slice(0, 300) || null;
  return { results: html || locs.length ? results : [], worker: workers.size ? [...workers].join(', ') : 'myworker', error, usage: { credits: 0 } };
}

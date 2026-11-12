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

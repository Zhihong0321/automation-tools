// Our own page reader: the Local Gmap Worker service on Railway
// (https://myworker.up.railway.app, code in G:\local-gmap-worker). It hands each
// read to a worker PC on a home line (this PC, the Mac mini) and answers with the
// page as markdown: the stand-in for Tavily /extract, for nothing.
//
// One call reads one page: POST /api/fetch {url}. The service holds the request
// open until a worker has read it (its own `wait`, the fetch timeout plus 30 s),
// so a read always comes back as a job, done or failed, never as a hang here.
//
// Key: secrets.ts kind `myworker` (/workers, "Other API keys"), else the
// LOCAL_GMAP_WORKER_API_KEY variable or vault entry.
import * as secrets from './secrets.ts';

export const BASE_URL = 'https://myworker.up.railway.app';

type FetchImpl = typeof fetch;

export type FetchJob = {
  status: string;
  worker: string | null;
  error: string | null;
  result: {
    url?: string;
    finalUrl?: string;
    status?: number;
    title?: string;
    content?: string;
    truncated?: boolean;
  } | null;
};

function fail(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * Read one page on a worker PC. Resolves with the service's job (status `done`
 * with `result.content`, or `failed` with `error`); throws only when the service
 * itself could not be reached or refused the call (no key, 401, 5xx).
 */
export async function fetchPage(
  url: string,
  opts: { timeoutMs?: number; fetchImpl?: FetchImpl; baseUrl?: string; format?: 'markdown' | 'text' | 'html'; mainContent?: boolean } = {},
): Promise<FetchJob> {
  await secrets.load();
  const key = secrets.get('myworker');
  if (!key) throw fail('no myworker API key is saved (/workers, Other API keys)', 'not_installed');
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = Math.min(300_000, Math.max(10_000, opts.timeoutMs ?? 60_000));
  let res: Response;
  try {
    res = await fetchImpl(`${(opts.baseUrl ?? BASE_URL).replace(/\/+$/, '')}/api/fetch`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url, format: opts.format ?? 'markdown', mainContent: opts.mainContent ?? true, timeoutMs }),
    });
  } catch (cause) {
    throw fail(`myworker unreachable: ${(cause as Error).message}`, 'engine_error');
  }
  const raw = await res.text().catch(() => '');
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { /* not JSON: reported below */ }
  const job = (body as { job?: Record<string, unknown> } | null)?.job;
  if (!job || typeof job !== 'object') {
    const why = String((body as { error?: unknown } | null)?.error ?? raw).slice(0, 200);
    throw fail(`myworker /api/fetch answered HTTP ${res.status}: ${why}`, res.status === 401 ? 'not_installed' : 'engine_error');
  }
  const result = job.result && typeof job.result === 'object' ? job.result as FetchJob['result'] : null;
  return {
    status: String(job.status ?? ''),
    worker: typeof job.worker === 'string' ? job.worker : null,
    error: job.error == null ? null : String(job.error),
    result,
  };
}

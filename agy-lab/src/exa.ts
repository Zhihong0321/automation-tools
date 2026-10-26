// Exa web search, the second search provider for contact research. Keys live in
// the gemini_contact_key table (kind 'exa') and rotate round-robin like Tavily's.
// Exa has no usage endpoint to read, so a key rests on the error that says it is
// spent: out of credits or refused rests it for a day, a rate limit for a minute,
// and the hub counts each key's spend itself from the costDollars on each answer.
import * as db from './reportdb.ts';
import { createKeyPool, type Lease, type SearchHit } from './tavily.ts';

export const KEY_CONCURRENCY = 2;
const OUT_OF_CREDIT_REST_MS = 24 * 60 * 60_000;
const RATE_LIMIT_REST_MS = 60_000;

type FetchImpl = typeof fetch;

export const pool = createKeyPool({ concurrency: KEY_CONCURRENCY });

export function available(): boolean {
  return pool.slots() > 0;
}

// What each key spent, counted from the costDollars on every answer, so the
// /auto-queue page can show it. Held in memory and written once a minute.
type Tally = { calls: number; dollars: number; failures: number; lastOkAt: string | null; lastError: string | null; lastErrorAt: string | null };
const tallies = new Map<string, Tally>();
let flushTimer: NodeJS.Timeout | null = null;

/** Count one Exa call against its key: what it cost, or the error it hit. */
export function record(apiKey: string, outcome: { dollars?: number; error?: string }): void {
  const t = tallies.get(apiKey) ?? { calls: 0, dollars: 0, failures: 0, lastOkAt: null, lastError: null, lastErrorAt: null };
  t.calls++;
  if (outcome.error) { t.failures++; t.lastError = outcome.error.slice(0, 300); t.lastErrorAt = new Date().toISOString(); }
  else { t.dollars += outcome.dollars ?? 0; t.lastOkAt = new Date().toISOString(); }
  tallies.set(apiKey, t);
  flushTimer ??= setInterval(() => { void flush(); }, 60_000).unref();
}

export async function flush(): Promise<void> {
  const batch = [...tallies.entries()];
  tallies.clear();
  for (const [secret, t] of batch) {
    await db.addSearchKeySpend('exa', secret, t).catch((e: Error) => console.warn('[exa] could not save key spend: ' + e.message));
  }
}

// Keys saved as "us:<key>" are called through the Exa proxy in US West
// (G:\exa-api-proxy, Railway service exa-proxy), so Exa sees those calls from
// the US, not from this server. They share the one pool with the direct keys.
// The proxy's URL and token are one row of kind 'exa_proxy', saved as JSON
// {url, token} through /api/contact-keys.
export const PROXY_PREFIX = 'us:';
const DIRECT_API = 'https://api.exa.ai';

export type ProxyConfig = { url: string; token: string };
let proxyConfig: ProxyConfig | null = null;

export function parseProxy(saved: unknown): ProxyConfig | null {
  let p: { url?: unknown; token?: unknown };
  try { p = typeof saved === 'string' ? JSON.parse(saved) : (saved as typeof p); } catch { return null; }
  const url = String(p?.url ?? '').trim().replace(/\/+$/, '');
  const token = String(p?.token ?? '').trim();
  return /^https?:\/\/\S+$/.test(url) && token ? { url, token } : null;
}

export function proxy(): ProxyConfig | null {
  return proxyConfig;
}

export function setProxy(config: ProxyConfig | null): void {
  proxyConfig = config;
}

export function via(secret: string): 'us' | 'direct' {
  return secret.startsWith(PROXY_PREFIX) ? 'us' : 'direct';
}

/** Where one key's call goes, with its headers. A us: key with no proxy saved gets a 'quota' error, so only that key rests. */
export function endpoint(secret: string, path: string): { url: string; headers: Record<string, string> } {
  if (via(secret) === 'direct') return { url: `${DIRECT_API}/${path}`, headers: { 'x-api-key': secret, 'content-type': 'application/json' } };
  if (!proxyConfig) throw Object.assign(new Error('exa proxy is not saved: POST exaProxy {url, token} to /api/contact-keys'), { code: 'quota', provider: 'exa' });
  return {
    url: `${proxyConfig.url}/${path}`,
    headers: { 'x-api-key': secret.slice(PROXY_PREFIX.length), 'x-proxy-token': proxyConfig.token, 'content-type': 'application/json' },
  };
}

/** What the proxy says about its keys (GET /usage): spend, estimated credit left, resting keys. */
export async function proxyUsage(fetchImpl: FetchImpl = fetch): Promise<Record<string, any> | null> {
  if (!proxyConfig) return null;
  const res = await fetchImpl(`${proxyConfig.url}/usage`, { headers: { 'x-proxy-token': proxyConfig.token }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`exa proxy /usage answered ${res.status}`);
  return res.json();
}

export async function loadKeys(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  let keys: string[] = [];
  try {
    const rows = await db.listGeminiContactKeys();
    keys = rows.filter((row) => row.kind === 'exa').map((row) => row.secret);
    proxyConfig = parseProxy(rows.find((row) => row.kind === 'exa_proxy')?.secret ?? '');
  } catch { /* database table created on migrate; caller without db uses env */ }
  if (!keys.length) {
    keys = String(env.EXA_API_KEYS ?? env.EXA_API_KEY ?? '').split(/[,\n]/).map((k) => k.trim()).filter(Boolean);
  }
  return keys;
}

/** Reload the keys into the shared pool and return them. */
export async function refresh(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const keys = await loadKeys(env);
  pool.setKeys(keys);
  return keys;
}

function fail(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

type SearchOpts = { numResults?: number; includeDomains?: string[]; timeoutMs?: number; fetchImpl?: FetchImpl };

/** One Exa search with the given key, as Tavily-shaped hits: url, title, and the highlight sentences as content. */
export async function searchWithKey(query: string, apiKey: string, opts: SearchOpts = {}): Promise<SearchHit[]> {
  try {
    const { hits, dollars } = await searchOnce(query, apiKey, opts);
    record(apiKey, { dollars });
    return hits;
  } catch (cause) {
    record(apiKey, { error: (cause as Error).message ?? String(cause) });
    throw cause;
  }
}

async function searchOnce(query: string, apiKey: string, opts: SearchOpts): Promise<{ hits: SearchHit[]; dollars: number }> {
  const target = endpoint(apiKey, 'search');
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(target.url, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify({
        query,
        numResults: opts.numResults ?? 8,
        type: 'auto',
        ...(opts.includeDomains ? { includeDomains: opts.includeDomains } : {}),
        contents: { highlights: { numSentences: 3, highlightsPerUrl: 2 } },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    throw fail(name === 'TimeoutError' || name === 'AbortError' ? 'exa search timed out' : `upstream error: ${(cause as Error)?.message ?? cause}`, 'timeout');
  }
  const raw = await res.text();
  if (res.status === 429) throw fail(`429 rate_limit_error: exa rate limit: ${raw.slice(0, 200)}`, 'rate_limit');
  if (res.status === 401 || res.status === 402 || res.status === 403 || (!res.ok && /credit|balance|billing|quota|payment/i.test(raw))) {
    throw fail(`exa key refused or out of credits (${res.status}): ${raw.slice(0, 200)}`, 'quota');
  }
  if (!res.ok) throw fail(`upstream error: exa answered ${res.status}: ${raw.slice(0, 200)}`, 'timeout');
  let body: { results?: Array<{ url?: string; title?: string; highlights?: string[] }>; costDollars?: { total?: number } };
  try { body = JSON.parse(raw); } catch { return { hits: [], dollars: 0 }; }
  const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const hits = (body.results ?? []).flatMap((item): SearchHit[] => {
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) return [];
    return [{ url, title: clean(item.title, 200), content: clean((item.highlights ?? []).join(' '), 600) }];
  });
  return { hits, dollars: body.costDollars?.total ?? 0 };
}

/** Rest the key the way the error asks: a day for a refused or spent key, a minute for a rate limit. */
export function releaseFor(lease: Lease, cause: unknown): void {
  const code = (cause as { code?: string } | null)?.code;
  lease.release(code === 'quota' ? OUT_OF_CREDIT_REST_MS : code === 'rate_limit' ? RATE_LIMIT_REST_MS : 0);
}

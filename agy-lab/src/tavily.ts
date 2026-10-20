// Tavily web search, shared by the Pi worker's web_search tool and the contact
// worker's first step. Keys live in the gemini_contact_key table (kind 'tavily')
// and rotate round-robin; a key that Tavily reports out of monthly credits is
// cooled until the month turns.
import * as db from './reportdb.ts';

export const KEY_CONCURRENCY = 2;
export const TAVILY_MONTHLY_LIMIT = 1000;

type FetchImpl = typeof fetch;

export type Lease = { secret: string; release: (coolMs?: number, quotaExceeded?: boolean) => void };

export type KeyPoolOptions = {
  concurrency?: number;
  monthlyLimit?: number;
};

export function createKeyPool(options: KeyPoolOptions = {}) {
  const concurrency = options.concurrency ?? KEY_CONCURRENCY;
  const monthlyLimit = options.monthlyLimit ?? 0;
  const state = {
    keys: [] as string[],
    inflight: new Map<string, number>(),
    coolUntil: new Map<string, number>(),
    usage: new Map<string, { month: string; count: number }>(),
    rrIndex: 0,
    waiters: [] as Array<(lease: Lease) => void>,
  };

  function currentMonth(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function getMonthUsage(key: string): number {
    const cur = state.usage.get(key);
    if (!cur || cur.month !== currentMonth()) return 0;
    return cur.count;
  }

  function incrementUsage(key: string): void {
    const m = currentMonth();
    const cur = state.usage.get(key);
    if (!cur || cur.month !== m) state.usage.set(key, { month: m, count: 1 });
    else cur.count += 1;
  }

  function endOfMonthMs(): number {
    const d = new Date();
    const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    return Math.max(60_000, nextMonth.getTime() - Date.now());
  }

  function usable(key: string): boolean {
    if ((state.coolUntil.get(key) ?? 0) > Date.now()) return false;
    if (monthlyLimit > 0 && getMonthUsage(key) >= monthlyLimit) return false;
    return true;
  }

  function wake(): void {
    if (!state.keys.length || !state.waiters.length) return;
    const len = state.keys.length;
    for (let attempt = 0; attempt < len && state.waiters.length; attempt++) {
      const idx = (state.rrIndex + attempt) % len;
      const key = state.keys[idx]!;
      if (!usable(key)) continue;
      while ((state.inflight.get(key) ?? 0) < concurrency && state.waiters.length) {
        state.rrIndex = (idx + 1) % len;
        const resolve = state.waiters.shift()!;
        state.inflight.set(key, (state.inflight.get(key) ?? 0) + 1);
        incrementUsage(key);
        let released = false;
        resolve({
          secret: key,
          release(coolMs = 0, quotaExceeded = false) {
            if (released) return;
            released = true;
            if (quotaExceeded) {
              state.coolUntil.set(key, Date.now() + Math.max(coolMs, endOfMonthMs()));
            } else if (coolMs > 0) {
              state.coolUntil.set(key, Date.now() + coolMs);
            }
            state.inflight.set(key, Math.max(0, (state.inflight.get(key) ?? 1) - 1));
            wake();
          },
        });
      }
    }
  }

  return {
    setKeys(keys: string[]) {
      state.keys = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
      wake();
    },
    acquire() {
      return new Promise<Lease>((resolve) => {
        state.waiters.push(resolve);
        wake();
      });
    },
    stats() {
      return state.keys.map((secret) => ({
        secret,
        tail: maskKey(secret),
        usedThisMonth: getMonthUsage(secret),
        monthlyLimit: monthlyLimit > 0 ? monthlyLimit : null,
        cooling: (state.coolUntil.get(secret) ?? 0) > Date.now(),
      }));
    },
    slots() {
      return state.keys.filter(usable).length * concurrency;
    },
  };
}

export const pool = createKeyPool({ monthlyLimit: TAVILY_MONTHLY_LIMIT, concurrency: KEY_CONCURRENCY });

function maskKey(secret: string): string {
  return secret.length <= 4 ? '••••' : `••••${secret.slice(-4)}`;
}

export async function loadKeys(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  let keys: string[] = [];
  try {
    const rows = await db.listGeminiContactKeys();
    keys = rows.filter((row) => row.kind === 'tavily').map((row) => row.secret);
    if (!keys.length) keys = rows.filter((row) => row.secret.startsWith('tvly-')).map((row) => row.secret);
  } catch { /* database table created on migrate; caller without db uses env */ }
  if (!keys.length) {
    keys = String(env.TAVILY_API_KEYS ?? env.TAVILY_API_KEY ?? '').split(/[,\n]/).map((k) => k.trim()).filter(Boolean);
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

export type SearchHit = { url: string; title: string; content: string };

/**
 * One Tavily search with the given key. Only an error response counts as a quota or
 * rate limit: a 200 body is search results, and their text can say "credit" or "quota".
 * Tavily answers 432 when the plan's monthly credits are spent and 433 when the
 * pay-as-you-go cap is hit.
 */
export async function searchWithKey(
  query: string,
  apiKey: string,
  opts: { maxResults?: number; depth?: 'basic' | 'advanced'; timeoutMs?: number; fetchImpl?: FetchImpl } = {},
): Promise<SearchHit[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: opts.maxResults ?? 8,
        search_depth: opts.depth ?? 'advanced',
        include_answer: false,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    throw fail(
      name === 'TimeoutError' || name === 'AbortError'
        ? 'tavily search timed out'
        : `upstream error: ${(cause as Error)?.message ?? cause}`,
      'timeout',
    );
  }
  const raw = await res.text();
  if (res.status === 432 || res.status === 433 || (!res.ok && /usage_limit|quota|credit|plan limit/i.test(raw))) {
    throw fail(`tavily monthly quota exceeded (${res.status}): ${raw.slice(0, 200)}`, 'quota');
  }
  if (res.status === 429) throw fail(`429 rate_limit_error: tavily rate limit: ${raw.slice(0, 200)}`, 'rate_limit');
  if (!res.ok) throw fail(`upstream error: tavily answered ${res.status}: ${raw.slice(0, 200)}`, 'timeout');
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return []; }
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((item): SearchHit[] => {
    const row = item as Record<string, unknown>;
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) return [];
    const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    return [{ url, title: clean(row.title, 200), content: clean(row.content, 400) }];
  });
}

/** Release a lease the way the error asks: a month for quota, a minute for a rate limit. */
export function releaseFor(lease: Lease, cause: unknown): void {
  const code = (cause as { code?: string } | null)?.code;
  lease.release(code === 'rate_limit' || code === 'quota' ? 60_000 : 0, code === 'quota');
}

/** One search through the shared pool. */
export async function search(query: string, opts: { maxResults?: number; depth?: 'basic' | 'advanced'; timeoutMs?: number } = {}): Promise<SearchHit[]> {
  await refresh();
  if (!pool.stats().length) throw fail('no Tavily key is configured', 'not_installed');
  const lease = await pool.acquire();
  try {
    const hits = await searchWithKey(query, lease.secret, opts);
    lease.release();
    return hits;
  } catch (cause) {
    releaseFor(lease, cause);
    throw cause;
  }
}

export async function handleKeys(
  req: { method?: string },
  res: unknown,
  url: URL,
  ctx: { json: (res: unknown, status: number, body: unknown) => void; readJson: (req: unknown) => Promise<Record<string, unknown>> },
): Promise<boolean> {
  if (url.pathname !== '/api/contact-keys' && url.pathname !== '/api/gemini-contact-keys') return false;
  const method = req.method ?? 'GET';
  if (method === 'GET') {
    const rows = await db.listGeminiContactKeys();
    const keys = await loadKeys();
    const stats = pool.stats();
    ctx.json(res, 200, {
      // Full secrets so the operator can read, edit and copy them. This route is behind LAB_TOKEN.
      tavilyKeys: keys,
      tavily: stats.length ? stats : rows.filter((row) => row.kind === 'tavily').map((row) => ({ id: row.id, tail: maskKey(row.secret) })),
      step1Slots: pool.slots() || keys.length * KEY_CONCURRENCY,
    });
    return true;
  }
  if (method === 'POST') {
    const body = await ctx.readJson(req);
    if (Array.isArray(body.tavily)) await db.replaceGeminiContactKeys('tavily', body.tavily.map(String));
    await refresh();
    ctx.json(res, 200, { ok: true, step1Slots: pool.slots() });
    return true;
  }
  ctx.json(res, 405, { error: 'method not allowed' });
  return true;
}

// Brave Search: the wide net. Snippets only, no page text, but its own index and
// up to 20 results a call, so discovery costs no Tavily budget.
//
// BRAVE_API_KEYS holds one or more keys (comma or newline separated). Brave's
// free tier allows about one query a second per key, so calls are spaced and a
// 429/402 moves on to the next key.

import { startCall, type ApiCall } from '../cost.ts';

type FetchImpl = typeof fetch;

export type BraveHit = { url: string; title: string; snippets: string[]; age?: string };

const BASE = 'https://api.search.brave.com/res/v1';
const SPACING_MS = 1_100;

export function keys(env: NodeJS.ProcessEnv = process.env): string[] {
  return String(env.BRAVE_API_KEYS ?? env.BRAVE_SEARCH_API_KEY ?? '').split(/[,\n]/).map((k) => k.trim()).filter(Boolean);
}

let lastCall = 0;
let keyIndex = 0;

async function spaced(): Promise<void> {
  const wait = lastCall + SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

function hits(rows: Array<Record<string, any>> | undefined): BraveHit[] {
  return (rows ?? []).map((r) => ({
    url: String(r.url),
    title: String(r.title ?? ''),
    snippets: [r.description, ...(r.extra_snippets ?? [])].filter(Boolean).map((s: string) => s.replace(/<\/?strong>/g, '')),
    age: r.age ? String(r.age) : undefined,
  }));
}

type SearchOpts = { country?: string; kind?: 'web' | 'news'; count?: number; extraSnippets?: boolean; what?: string; log?: ApiCall[]; onCall?: (c: ApiCall) => void };

/** One Brave query. kind 'news' uses the news endpoint. Every request, a key that refused included, is logged. */
export async function search(q: string, opts: SearchOpts = {}, allKeys: string[] = keys(), fetchImpl: FetchImpl = fetch): Promise<BraveHit[]> {
  return hits(await searchRaw(q, opts, allKeys, fetchImpl));
}

/** The same query, answered with Brave's own rows (title, url, description, age, extra_snippets...). */
export async function searchRaw(
  q: string,
  opts: SearchOpts = {},
  allKeys: string[] = keys(),
  fetchImpl: FetchImpl = fetch,
): Promise<Array<Record<string, any>>> {
  if (!allKeys.length) throw new Error('BRAVE_API_KEYS is not set');
  const kind = opts.kind ?? 'web';
  const params = new URLSearchParams({ q, count: String(opts.count ?? 20) });
  if (opts.country) params.set('country', opts.country);
  if (kind === 'web' && opts.extraSnippets !== false) params.set('extra_snippets', 'true');
  const onCall = (c: ApiCall) => { const rec = opts.what ? { ...c, what: `${opts.what}: ${c.what}` } : c; opts.log?.push(rec); opts.onCall?.(rec); };
  let lastErr = '';
  for (let tries = 0; tries < allKeys.length; tries++) {
    const key = allKeys[keyIndex % allKeys.length];
    await spaced();
    const call = startCall('brave', `${kind}: ${q}`, { provider: 'brave' });
    let res: Response;
    try {
      res = await fetchImpl(`${BASE}/${kind}/search?${params}`, {
        headers: { 'X-Subscription-Token': key, accept: 'application/json' },
      });
    } catch (err) {
      onCall(call.done({ ok: false, note: (err as Error).message.slice(0, 200) }));
      throw err;
    }
    if (res.status === 429 || res.status === 402) {
      lastErr = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
      onCall(call.done({ ok: false, note: lastErr }));
      keyIndex++;
      continue;
    }
    if (!res.ok) {
      const msg = `Brave ${kind} answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      onCall(call.done({ ok: false, note: msg }));
      throw new Error(msg);
    }
    const body = await res.json() as Record<string, any>;
    const rows: Array<Record<string, any>> = (kind === 'news' ? body.results : body.web?.results) ?? [];
    onCall(call.done({ ok: true, results: rows.length }));
    return rows;
  }
  throw new Error(`Brave: every key refused (${lastErr})`);
}

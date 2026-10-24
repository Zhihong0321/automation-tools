// In-hub Google Maps worker. Claims gmap.scan jobs and answers them from
// scraper.tech's Maps API, so a business search no longer needs the Mac mini's
// Chrome on a home line. Notes and measurements: docs/scraper-tech-maps.md.
//
// One call per query, limit up to 500. A single call is stable run to run;
// paging in steps of 100 is not, and offset past the first call adds almost
// nothing. One query tops out around 150-190 places, which is Google's ceiling,
// so a location-only search becomes a keyword sweep: "<keyword> in <place>" for
// each keyword in SWEEP until `max` places are in hand.
//
// The API never fails a search: an empty query is `status: ok` with no rows, a
// nonsense one returns the nearest business. So zero rows is a real answer
// (found: 0), and only a transport error or a non-ok status fails the job. The
// Mac mini's "an empty feed is never 0" rule was about a throttled IP, which
// this path does not have.
import * as jobs from './jobs.ts';

export const JOB_TYPE = 'gmap.scan';
export const WORKER_NAME = 'scraper-tech-maps';

const DEFAULT_BASE_URL = 'https://mcp.scraper.tech';
const DEFAULT_MAX = 200;
const MAX_LIMIT = 500;
const CALL_TIMEOUT_MS = 90_000;
const SWEEP_CONCURRENCY = 4;

/**
 * Location-only keywords, ordered by how many new in-area places each added in
 * the 2026-10-24 Taman Daya sweep (restaurant +136 down to hardware +9).
 * "supplier" (+4) and "store" style near-duplicates of earlier words are left out
 * or late: they mostly return places an earlier keyword already found.
 */
export const SWEEP = [
  'restaurant', 'salon', 'factory', 'company', 'business', 'sdn bhd', 'shop', 'trading',
  'services', 'wholesale', 'manufacturer', 'office', 'logistics', 'workshop', 'store',
  'clinic', 'kedai', 'hardware',
];

type FetchImpl = typeof fetch;
export type MapsConfig = { key: string; baseUrl: string; lanes: number };
export type Business = {
  name: string; rating: number | null; reviews: number | null; category: string | null;
  address: string | null; phone: string | null; website: string | null; mapsUrl: string | null;
  place_id: string | null;
};
type Row = Record<string, unknown>;

function fail(message: string, code = 'engine_error'): Error {
  return Object.assign(new Error(message), { code });
}

function positive(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): MapsConfig {
  return {
    key: String(env.SCRAPER_TECH_KEY ?? '').trim(),
    baseUrl: String(env.SCRAPER_TECH_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, ''),
    lanes: Math.max(1, Math.floor(positive(env.MAPS_LANES, 3))),
  };
}

export function laneName(index: number): string {
  return index === 0 ? WORKER_NAME : `${WORKER_NAME}-${index + 1}`;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One scraper.tech row in the shape gmap.mjs returns, so the hub persists both alike. */
export function toBusiness(row: Row): Business {
  const types = Array.isArray(row.types) ? row.types : [];
  const name = text(row.name) ?? '';
  // full_address often starts with the business name ("KULAI RS HARDWARE, No.292, …").
  const address = text(row.full_address);
  return {
    name,
    rating: count(row.rating),
    reviews: count(row.review_count),
    category: text(types[0]),
    address: address && name && address.startsWith(name + ', ') ? address.slice(name.length + 2) : address,
    phone: text(row.phone_number),
    website: text(row.website),
    mapsUrl: text(row.place_link),
    // scanPlaceKey prefers it, and it is the same id the mini read from `!19s`.
    place_id: text(row.place_id),
  };
}

/** One search_maps call. Retries once on a transport failure; a non-ok answer is final. */
export async function searchMaps(
  config: MapsConfig, query: string, limit: number, fetchImpl: FetchImpl = fetch,
): Promise<Row[]> {
  const body = JSON.stringify({
    jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
    params: { name: 'search_maps', arguments: { query, limit: String(limit), country: 'my', lang: 'en' } },
  });
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(`${config.baseUrl}/${config.key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (cause) {
      lastError = cause;
      continue;
    }
    if (res.status >= 500) { lastError = fail(`scraper.tech answered HTTP ${res.status}`); continue; }
    if (!res.ok) throw fail(`scraper.tech answered HTTP ${res.status}`, res.status === 429 ? 'rate_limit' : 'engine_error');
    const rpc = await res.json() as { result?: { isError?: boolean; content?: Array<{ text?: string }> }; error?: { message?: string } };
    if (rpc.error) throw fail('scraper.tech: ' + (rpc.error.message ?? 'JSON-RPC error'));
    const raw = rpc.result?.content?.[0]?.text ?? '';
    let data: { status?: string; data?: unknown; message?: string };
    try {
      data = JSON.parse(raw);
    } catch {
      throw fail('scraper.tech returned no JSON: ' + raw.slice(0, 200));
    }
    if (rpc.result?.isError || data.status !== 'ok' || !Array.isArray(data.data)) {
      throw fail('scraper.tech search failed: ' + (data.message ?? raw.slice(0, 200)));
    }
    return data.data as Row[];
  }
  throw fail('scraper.tech did not answer: ' + ((lastError as Error)?.message ?? String(lastError)), 'timeout');
}

/**
 * The gmap.scan payload, answered. Same payload and result shape as
 * worker/gmap.mjs `scan`, so runBusinessSearch needs no provider branch.
 */
export async function scan(
  payload: Record<string, unknown> | null, config: MapsConfig, fetchImpl: FetchImpl = fetch,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const locationOnly = payload?.searchMode === 'location_only';
  const keyword = locationOnly ? '' : String(payload?.keyword ?? '').trim();
  const place = locationOnly
    ? String(payload?.originalPlace ?? payload?.place ?? payload?.keyword ?? '').trim()
    : String(payload?.place ?? '').trim();
  if (!keyword && !place) throw fail('gmap.scan needs a keyword or place');
  const max = positive(payload?.max, DEFAULT_MAX);
  const limit = Math.min(max, MAX_LIMIT);

  const found = new Map<string, Business>();
  const add = (rows: Row[]): number => {
    let added = 0;
    for (const row of rows) {
      // A closed place is not a lead; it only costs a contact-research run.
      if (row.is_permanently_closed === true) continue;
      const business = toBusiness(row);
      if (!business.name) continue;
      const key = business.place_id ?? business.name + '|' + (business.address ?? '');
      if (found.has(key)) continue;
      found.set(key, business);
      added++;
    }
    return added;
  };

  let query: string;
  let requests = 0;
  const sweep: Array<{ keyword: string; rows: number; added: number }> = [];
  if (locationOnly || !keyword) {
    query = place;
    // A place name alone returns that one place, not the businesses in it.
    for (let i = 0; i < SWEEP.length && found.size < max; i += SWEEP_CONCURRENCY) {
      const batch = SWEEP.slice(i, i + SWEEP_CONCURRENCY);
      const answers = await Promise.all(batch.map((word) => searchMaps(config, `${word} in ${place}`, MAX_LIMIT, fetchImpl)));
      requests += batch.length;
      answers.forEach((rows, j) => sweep.push({ keyword: batch[j]!, rows: rows.length, added: add(rows) }));
    }
  } else {
    query = place ? `${keyword} in ${place}` : keyword;
    add(await searchMaps(config, query, limit, fetchImpl));
    requests = 1;
  }

  const businesses = [...found.values()].slice(0, max);
  return {
    query,
    keyword,
    place: place || null,
    businesses,
    found: businesses.length,
    capped: businesses.length >= max,
    blocked: false,
    blockedReason: null,
    limitedView: false,
    categories: sweep.length ? sweep : null,
    scrolls: 0,
    provider: 'scraper.tech',
    requests,
    tookMs: Date.now() - startedAt,
    at: new Date().toISOString(),
    storage: 'hub',
  };
}

async function lane(name: string, env: NodeJS.ProcessEnv): Promise<void> {
  for (;;) {
    try {
      const config = resolveConfig(env);
      // No key, no lane: liveTypes() must not count a worker that cannot answer,
      // or a business search queues a scan nobody will run.
      if (!config.key) {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        continue;
      }
      jobs.touch(name, '127.0.0.1', [JOB_TYPE]);
      const job = await jobs.take(name, { types: [JOB_TYPE], waitMs: 5_000 });
      if (!job) continue;
      const beat = setInterval(() => { jobs.touch(name, '127.0.0.1', [JOB_TYPE]); }, 20_000);
      beat.unref();
      try {
        const result = await scan(job.payload as Record<string, unknown> | null, config);
        jobs.finish(job.id, true, result, null);
      } catch (cause) {
        const message = (cause as Error).message ?? String(cause);
        jobs.finish(job.id, false, null, message);
        if ((cause as { code?: string }).code === 'rate_limit') jobs.coolDown(name, 5 * 60_000, message);
      } finally {
        clearInterval(beat);
      }
    } catch (cause) {
      console.error(`[maps] ${name} ${(cause as Error).message ?? String(cause)}`);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

/** MAPS_LANES lanes (default 3), each one scan at a time. Idle until SCRAPER_TECH_KEY is set. */
export function start(env: NodeJS.ProcessEnv = process.env): void {
  const lanes = resolveConfig(env).lanes;
  for (let i = 0; i < lanes; i++) void lane(laneName(i), env);
  console.log(`[maps] worker ${WORKER_NAME} claiming ${JOB_TYPE} on ${lanes} lane(s)` + (resolveConfig(env).key ? '' : ' (idle: SCRAPER_TECH_KEY is not set)'));
}

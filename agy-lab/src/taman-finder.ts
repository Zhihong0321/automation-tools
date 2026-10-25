// Finds tamans the hand-built territory list misses, district by district.
//
// ALL_TERRITORIES was compiled once and goes stale: housing areas opened in the
// last few years are simply absent, so nobody scans them. For each district this
// runs two Tavily searches for new housing, asks the extract LLM to pull area
// names out of the snippets, drops the ones the list already has, and checks the
// rest against Google Maps. Every candidate is saved; only verified ones are
// meant to be shown or merged.
import * as db from './reportdb.ts';
import * as extractLlm from './extract-llm.ts';
import * as tavily from './tavily.ts';
import { resolveConfig, searchMaps } from './maps-worker.ts';
import { ALL_TERRITORIES, type DistrictLocation, type StateTerritory } from './territories.ts';

export const MAX_CANDIDATES = 25;
const SNIPPET_BUDGET = 20_000;

export type SearchHit = { url: string; title: string; content: string };
export type MapsRow = { name?: unknown; full_address?: unknown; types?: unknown; place_id?: unknown };
export type FoundTaman = db.DiscoveredTaman & { name_key: string };
export type Candidate = { name: string; evidence_url: string | null };

export type Deps = {
  territories: Record<string, StateTerritory>;
  search: (query: string) => Promise<SearchHit[]>;
  llm: (prompt: string) => Promise<string>;
  /** null when no scraper.tech key is set: candidates are saved unverified. */
  maps: ((query: string) => Promise<MapsRow[]>) | null;
  save: (rows: FoundTaman[]) => Promise<number>;
  log: (message: string) => void;
};

export type Summary = {
  state: string;
  districts: number;
  /** Tavily searches that answered. */
  searched: number;
  candidates: number;
  verified: number;
  saved: number;
  errors: Array<{ district: string; error: string }>;
  perDistrict: Array<{ district: string; candidates: number; verified: number }>;
};

const PREFIX = /^(taman|tmn|bandar|bdr|desa|kampung|kg)\b[\s.]*/;

/** Compare key for an area name: "Tmn. Daya Indah" and "Daya-Indah" both become "dayaindah". */
export function tamanKey(name: string): string {
  const lower = String(name ?? '').toLowerCase().trim();
  const stripped = lower.replace(PREFIX, '').replace(/[^a-z0-9]+/g, '');
  // A bare "Bandar" or "Desa" keeps its word rather than becoming an empty key.
  return stripped || lower.replace(/[^a-z0-9]+/g, '');
}

export function searchQueries(district: string, stateName: string): string[] {
  return [
    `taman perumahan baru ${district} ${stateName}`,
    `new housing taman ${district} ${stateName} 2021 2022 2023 2024 2025`,
  ];
}

/** Every taman and town name the list already has for this district, as keys. */
export function knownKeys(district: DistrictLocation): Set<string> {
  const keys = new Set<string>();
  for (const town of district.towns) {
    keys.add(tamanKey(town.name));
    if (town.fullName) keys.add(tamanKey(town.fullName));
    for (const taman of town.tamans) keys.add(tamanKey(taman.name));
  }
  keys.delete('');
  return keys;
}

export function buildPrompt(district: string, stateName: string, hits: SearchHit[]): string {
  const blocks: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const block = `[${blocks.length + 1}] ${hit.title}\nURL: ${hit.url}\n${hit.content}`;
    if (used + block.length > SNIPPET_BUDGET) break;
    blocks.push(block);
    used += block.length;
  }
  return [
    `You read web search snippets about housing in the district of ${district}, ${stateName}, Malaysia.`,
    'List every residential or mixed-use area name the snippets say is in that district:',
    'names starting with Taman, Bandar, Desa, Kota, Bukit, Residensi, Pangsapuri, Kampung and similar.',
    'Rules:',
    '- Copy each name exactly as printed. Never invent or complete a name.',
    `- Leave out areas the snippets place outside ${district}.`,
    '- Leave out developer names, roads and single buildings with no area name.',
    '- evidence_url is the URL of the snippet that names the area.',
    'Answer with JSON only: {"tamans":[{"name":"Taman Example","evidence_url":"https://..."}]}',
    'If there are none, answer {"tamans":[]}.',
    '',
    'Snippets:',
    blocks.join('\n\n'),
  ].join('\n');
}

function tryParse(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** The last complete JSON object in a model answer, ignoring prose and code fences around it. */
export function lastJsonObject(text: string): Record<string, unknown> | null {
  const source = String(text ?? '').trim();
  const whole = tryParse(source);
  if (whole) return whole;
  let last: Record<string, unknown> | null = null;
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (start < 0) {
      if (ch === '{') { start = i; depth = 1; inString = false; escaped = false; }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      const candidate = tryParse(source.slice(start, i + 1));
      if (candidate) last = candidate;
      start = -1;
    }
  }
  return last;
}

/** Candidate names out of the LLM answer, cleaned and deduped by key. */
export function parseCandidates(answer: string): Candidate[] {
  const json = lastJsonObject(answer);
  const list = Array.isArray(json?.tamans) ? json.tamans as unknown[] : [];
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const item of list) {
    const raw = item as { name?: unknown; evidence_url?: unknown } | null;
    const name = typeof raw?.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : '';
    const key = tamanKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const url = typeof raw?.evidence_url === 'string' && /^https?:\/\//i.test(raw.evidence_url) ? raw.evidence_url : null;
    out.push({ name, evidence_url: url });
  }
  return out;
}

/** The Maps row that confirms a candidate: matching name, and an address in the district or state. */
export function matchMapsRow(name: string, district: string, stateName: string, rows: MapsRow[]): MapsRow | null {
  const key = tamanKey(name);
  if (!key) return null;
  const places = [district, stateName].map((p) => p.toLowerCase());
  for (const row of rows) {
    const rowKey = tamanKey(typeof row.name === 'string' ? row.name : '');
    const address = typeof row.full_address === 'string' ? row.full_address.toLowerCase() : '';
    if (!rowKey || !address) continue;
    if (!rowKey.includes(key) && !key.includes(rowKey)) continue;
    if (places.some((p) => address.includes(p))) return row;
  }
  return null;
}

async function runDistrict(
  district: DistrictLocation, stateName: string, deps: Deps, summary: Summary,
): Promise<{ candidates: number; verified: number }> {
  const results = await Promise.allSettled(searchQueries(district.name, stateName).map((q) => deps.search(q)));
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === results.length) throw failures[0]!.reason;
  for (const f of failures) deps.log(`[taman-finder] ${district.name}: one search failed: ${(f.reason as Error)?.message ?? f.reason}`);

  const hits: SearchHit[] = [];
  const urls = new Set<string>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    summary.searched++;
    for (const hit of r.value) {
      if (urls.has(hit.url)) continue;
      urls.add(hit.url);
      hits.push(hit);
    }
  }
  if (!hits.length) return { candidates: 0, verified: 0 };

  const known = knownKeys(district);
  const candidates = parseCandidates(await deps.llm(buildPrompt(district.name, stateName, hits)))
    .filter((c) => !known.has(tamanKey(c.name)))
    .slice(0, MAX_CANDIDATES);

  const rows: FoundTaman[] = [];
  for (const c of candidates) {
    const query = `${c.name}, ${district.name}, ${stateName}`;
    let match: MapsRow | null = null;
    if (deps.maps) {
      try {
        match = matchMapsRow(c.name, district.name, stateName, await deps.maps(query));
      } catch (cause) {
        deps.log(`[taman-finder] ${query}: Maps check failed: ${(cause as Error)?.message ?? cause}`);
      }
    }
    rows.push({
      state: stateName, district: district.name, name: c.name, name_key: tamanKey(c.name), query_place: query,
      evidence_url: c.evidence_url,
      maps_name: match ? String(match.name) : null,
      maps_address: match ? String(match.full_address) : null,
      verified: match !== null,
    });
  }
  // Saved per district, so a later failure does not lose this district's work.
  summary.saved += await deps.save(rows);
  return { candidates: rows.length, verified: rows.filter((r) => r.verified).length };
}

/** Tavily through the shared key pool; the key list is refreshed once per run. */
export function tavilySearch(): (query: string) => Promise<SearchHit[]> {
  let ready: Promise<unknown> | null = null;
  return async (query) => {
    ready ??= tavily.refresh();
    await ready;
    if (!tavily.pool.stats().length) throw new Error('no Tavily key is configured');
    const lease = await tavily.pool.acquire();
    try {
      const hits = await tavily.searchWithKey(query, lease.secret, { maxResults: 20, depth: 'basic' });
      lease.release();
      return hits;
    } catch (cause) {
      tavily.releaseFor(lease, cause);
      throw cause;
    }
  };
}

function defaultDeps(): Deps {
  const config = resolveConfig();
  return {
    territories: ALL_TERRITORIES,
    search: tavilySearch(),
    llm: async (prompt) => (await extractLlm.ask(prompt, { timeoutMs: 120_000, maxTokens: 8192 })).answer,
    // Each check is one Maps request, counted against the same monthly budget as scans.
    maps: config.key ? async (query) => {
      const rows = await searchMaps(config, query, 10) as MapsRow[];
      void db.addMapsUsage(1).catch(() => {});
      return rows;
    } : null,
    save: (rows) => db.saveDiscoveredTamans(rows),
    log: (message) => console.warn(message),
  };
}

/** One pass over a state's districts, in order; a failing district is recorded and skipped. */
export async function findMissingTamans(state: string, deps: Partial<Deps> = {}): Promise<Summary> {
  const d: Deps = { ...defaultDeps(), ...deps };
  const territory = d.territories[String(state ?? '').toLowerCase()];
  if (!territory) throw new Error(`unknown state: ${state}`);
  const summary: Summary = {
    state: territory.state, districts: territory.districts.length, searched: 0,
    candidates: 0, verified: 0, saved: 0, errors: [], perDistrict: [],
  };
  for (const district of territory.districts) {
    try {
      const out = await runDistrict(district, territory.state, d, summary);
      summary.candidates += out.candidates;
      summary.verified += out.verified;
      summary.perDistrict.push({ district: district.name, ...out });
    } catch (cause) {
      const error = (cause as Error)?.message ?? String(cause);
      d.log(`[taman-finder] ${district.name}: ${error}`);
      summary.errors.push({ district: district.name, error });
      summary.perDistrict.push({ district: district.name, candidates: 0, verified: 0 });
    }
  }
  return summary;
}

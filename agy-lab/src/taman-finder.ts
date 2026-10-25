// Finds tamans the hand-built territory list misses, town by town in every
// daerah.
//
// ALL_TERRITORIES was compiled once and goes stale: housing areas opened in the
// last few years are absent, and a daerah holds far more tamans than the list
// names. A daerah is too big for one search, so each of its towns gets its own:
// two Tavily searches whose snippets the extract LLM reads for area names, and
// two Google Maps searches whose housing-estate rows are tamans Maps itself
// knows. Names the list already has are dropped. A Maps row is verified by being
// on Maps; a Tavily name is verified when the town's Maps rows, or one Maps check
// of its own, confirm it. Every candidate is saved; only verified ones join the
// territory list.
import * as db from './reportdb.ts';
import * as extractLlm from './extract-llm.ts';
import * as tavily from './tavily.ts';
import { resolveConfig, searchMaps } from './maps-worker.ts';
import { ALL_TERRITORIES, type DistrictLocation, type StateTerritory, type TownLocation } from './territories.ts';

/** Tavily names checked on Maps one by one per town, after the town's Maps list. */
export const MAX_CHECKS = 20;
const SNIPPET_BUDGET = 16_000;
/** The second, smaller read when deepseek thinks past its output cap on the full one. */
const RETRY_SNIPPET_BUDGET = 6_000;
/** Maps categories that are a residential area, not a business in one. */
const AREA_TYPES = ['Housing Estate', 'Housing complex', 'Housing society', 'Housing development', 'Residential complex', 'Neighborhood', 'Gated community'];
const AREA_NAME = /^(taman|tmn|bandar|bdr|desa|kampung|kg|residensi|pangsapuri)\b/i;

export type SearchHit = { url: string; title: string; content: string };
export type MapsRow = { name?: unknown; full_address?: unknown; types?: unknown; place_id?: unknown };
export type FoundTaman = db.DiscoveredTaman & { name_key: string };
export type Candidate = { name: string; evidence_url: string | null };

export type Deps = {
  territories: Record<string, StateTerritory>;
  search: (query: string) => Promise<SearchHit[]>;
  llm: (prompt: string) => Promise<string>;
  /** null when no scraper.tech key is set: candidates are saved unverified. */
  maps: ((query: string, limit?: number) => Promise<MapsRow[]>) | null;
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
  errors: Array<{ district: string; town?: string; error: string }>;
  perDistrict: Array<{ district: string; towns: number; candidates: number; verified: number }>;
};

const PREFIX = /^(taman|tmn|bandar|bdr|desa|kampung|kg)\b[\s.]*/;

/** Compare key for an area name: "Tmn. Daya Indah" and "Daya-Indah" both become "dayaindah". */
export function tamanKey(name: string): string {
  const lower = String(name ?? '').toLowerCase().trim();
  const stripped = lower.replace(PREFIX, '').replace(/[^a-z0-9]+/g, '');
  // A bare "Bandar" or "Desa" keeps its word rather than becoming an empty key.
  return stripped || lower.replace(/[^a-z0-9]+/g, '');
}

export function searchQueries(town: string, district: string, stateName: string): string[] {
  return [
    `senarai taman perumahan ${town} ${district} ${stateName}`,
    `taman baru ${town} ${district} ${stateName} 2020 2021 2022 2023 2024 2025`,
  ];
}

/** Maps searches whose housing-estate rows list the town's tamans. */
export function mapsQueries(townPlace: string): string[] {
  return [`taman in ${townPlace}`, `housing estate in ${townPlace}`];
}

/** A Maps row that is a residential area in this town or district, not a business in one. */
export function isAreaRow(row: MapsRow, places: string[]): boolean {
  const name = typeof row.name === 'string' ? row.name : '';
  const address = typeof row.full_address === 'string' ? row.full_address.toLowerCase() : '';
  const types = Array.isArray(row.types) ? row.types.map(String) : [];
  const area = types.some((t) => AREA_TYPES.includes(t)) || (!types.length && AREA_NAME.test(name));
  return area && !!name && places.some((p) => address.includes(p.toLowerCase()));
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

export function buildPrompt(town: string, district: string, stateName: string, hits: SearchHit[], budget = SNIPPET_BUDGET): string {
  const blocks: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const block = `[${blocks.length + 1}] ${hit.title}\nURL: ${hit.url}\n${hit.content}`;
    if (used + block.length > budget) break;
    blocks.push(block);
    used += block.length;
  }
  return [
    `You read web search snippets about housing in ${town}, in the district of ${district}, ${stateName}, Malaysia.`,
    'List every residential or mixed-use area name the snippets say is in that town or district:',
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

const reason = (cause: unknown): string => (cause as Error)?.message ?? String(cause);

/** Tavily names for one town: two searches, then the LLM, read again smaller if it thinks past its cap. */
async function tavilyNames(town: string, district: string, stateName: string, deps: Deps, summary: Summary): Promise<Candidate[]> {
  const results = await Promise.allSettled(searchQueries(town, district, stateName).map((q) => deps.search(q)));
  for (const r of results) if (r.status === 'rejected') deps.log(`[taman-finder] ${town}, ${district}: a search failed: ${reason(r.reason)}`);
  const hits: SearchHit[] = [];
  const urls = new Set<string>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    summary.searched++;
    for (const hit of r.value) if (!urls.has(hit.url)) { urls.add(hit.url); hits.push(hit); }
  }
  if (!hits.length) return [];
  try {
    return parseCandidates(await deps.llm(buildPrompt(town, district, stateName, hits)));
  } catch (cause) {
    const code = (cause as { code?: string }).code;
    if (code !== 'length' && code !== 'timeout' && code !== 'empty') throw cause;
    return parseCandidates(await deps.llm(buildPrompt(town, district, stateName, hits, RETRY_SNIPPET_BUDGET)));
  }
}

async function runTown(
  town: TownLocation, district: DistrictLocation, stateName: string, known: Set<string>, deps: Deps, summary: Summary,
): Promise<{ candidates: number; verified: number }> {
  const places = [town.name, district.name];
  const areaRows: MapsRow[] = [];
  if (deps.maps) {
    for (const q of mapsQueries(town.queryPlace)) {
      try {
        areaRows.push(...(await deps.maps(q, 500)).filter((row) => isAreaRow(row, places)));
      } catch (cause) {
        deps.log(`[taman-finder] ${q}: Maps search failed: ${reason(cause)}`);
      }
    }
  }
  let names: Candidate[] = [];
  try {
    names = await tavilyNames(town.name, district.name, stateName, deps, summary);
  } catch (cause) {
    // The Maps rows still count when the Tavily half fails.
    deps.log(`[taman-finder] ${town.name}, ${district.name}: ${reason(cause)}`);
    summary.errors.push({ district: district.name, town: town.name, error: reason(cause) });
  }

  const rows = new Map<string, FoundTaman>();
  const add = (name: string, evidence: string | null, match: MapsRow | null) => {
    const key = tamanKey(name);
    if (!key || known.has(key) || rows.has(key)) return;
    rows.set(key, {
      state: stateName, district: district.name, name, name_key: key, query_place: `${name}, ${town.name}, ${stateName}`,
      evidence_url: evidence, maps_name: match ? String(match.name) : null,
      maps_address: match ? String(match.full_address) : null, verified: match !== null,
    });
  };
  for (const row of areaRows) add(String(row.name).replace(/\s+/g, ' ').trim(), null, row);
  let checks = 0;
  for (const c of names) {
    const key = tamanKey(c.name);
    if (known.has(key) || rows.has(key)) continue;
    let match = matchMapsRow(c.name, district.name, stateName, areaRows);
    if (!match && deps.maps && checks < MAX_CHECKS) {
      checks++;
      try {
        match = matchMapsRow(c.name, district.name, stateName, await deps.maps(`${c.name}, ${town.name}, ${district.name}, ${stateName}`, 10));
      } catch (cause) {
        deps.log(`[taman-finder] ${c.name}: Maps check failed: ${reason(cause)}`);
      }
    }
    add(c.name, c.evidence_url, match);
  }
  const list = [...rows.values()];
  // Saved per town, so a later failure does not lose this town's work.
  summary.saved += await deps.save(list);
  for (const r of list) known.add(r.name_key);
  return { candidates: list.length, verified: list.filter((r) => r.verified).length };
}

/** Tavily through the shared key pool; the key list is refreshed once per run. */
export function tavilySearch(): (query: string) => Promise<SearchHit[]> {
  let ready: Promise<unknown> | null = null;
  return async (query) => {
    ready ??= tavily.refresh();
    await ready;
    if (!tavily.pool.stats().length) throw new Error('no Tavily key is configured');
    // A spent or rate-limited key is rested by releaseFor; try the next one.
    let last: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const lease = await tavily.pool.acquire();
      try {
        const hits = await tavily.searchWithKey(query, lease.secret, { maxResults: 20, depth: 'basic' });
        lease.release();
        return hits;
      } catch (cause) {
        tavily.releaseFor(lease, cause);
        last = cause;
        const code = (cause as { code?: string }).code;
        if (code !== 'quota' && code !== 'rate_limit') break;
      }
    }
    throw last;
  };
}

function defaultDeps(): Deps {
  const config = resolveConfig();
  return {
    territories: ALL_TERRITORIES,
    search: tavilySearch(),
    llm: async (prompt) => (await extractLlm.ask(prompt, { timeoutMs: 120_000, maxTokens: 8192 })).answer,
    // Each check is one Maps request, counted against the same monthly budget as scans.
    maps: config.key ? async (query, limit = 10) => {
      const rows = await searchMaps(config, query, limit) as MapsRow[];
      void db.addMapsUsage(1).catch(() => {});
      return rows;
    } : null,
    save: (rows) => db.saveDiscoveredTamans(rows),
    log: (message) => console.warn(message),
  };
}

/**
 * One pass over a state's daerah, or over one daerah, town by town. A failing
 * town is recorded and the rest still run.
 */
export async function findMissingTamans(state: string, deps: Partial<Deps> = {}, opts: { district?: string } = {}): Promise<Summary> {
  const d: Deps = { ...defaultDeps(), ...deps };
  const territory = d.territories[String(state ?? '').toLowerCase()];
  if (!territory) throw new Error(`unknown state: ${state}`);
  const wanted = opts.district?.trim().toLowerCase();
  const districts = territory.districts.filter((x) => !wanted || x.name.toLowerCase() === wanted);
  if (!districts.length) throw new Error(`unknown district: ${opts.district} in ${territory.state}`);
  const summary: Summary = {
    state: territory.state, districts: districts.length, searched: 0,
    candidates: 0, verified: 0, saved: 0, errors: [], perDistrict: [],
  };
  for (const district of districts) {
    const known = knownKeys(district);
    const total = { district: district.name, towns: district.towns.length, candidates: 0, verified: 0 };
    for (const town of district.towns) {
      try {
        const out = await runTown(town, district, territory.state, known, d, summary);
        total.candidates += out.candidates;
        total.verified += out.verified;
      } catch (cause) {
        d.log(`[taman-finder] ${town.name}, ${district.name}: ${reason(cause)}`);
        summary.errors.push({ district: district.name, town: town.name, error: reason(cause) });
      }
    }
    summary.candidates += total.candidates;
    summary.verified += total.verified;
    summary.perDistrict.push(total);
    d.log(`[taman-finder] ${territory.state} / ${district.name}: ${total.candidates} new names, ${total.verified} verified over ${total.towns} towns`);
  }
  return summary;
}

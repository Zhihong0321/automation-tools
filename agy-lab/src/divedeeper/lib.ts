// Shared plumbing for the dive-deeper prototypes (docs/dive-deeper-plan.md, step 1).
// Local only: reads a finished company-dive through the hub API, never writes to it.
//
// Every helper here falls back instead of throwing: a failed call logs a warning on
// the context and returns an empty value, so a lane ends partial, never dead
// (no timeouts, no max_tokens, no throw-on-parse-fail).
//
// Keys come from the local vault (D:\Tools\my-vault\vault.json) unless the env
// already has them: EE_AUTO_LAB_TOKEN, SCRAPER_TECH_KEY, ZM_AI_FIXED_KEY,
// EXA_API_KEY, BRAVE_SEARCH_API_KEY.
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import tls from 'node:tls';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SECTIONS = path.join(HERE, 'sections');
// Lane outputs and caches. On this machine: agy-lab/scripts/dive-deeper/out (gitignored).
// In the hub's container the scripts folder is not shipped, so a temp folder; the hub keeps
// what matters in the dive_deeper table.
const LOCAL_OUT = path.join(HERE, '..', '..', 'scripts', 'dive-deeper', 'out');
export const OUT = process.env.DD_OUT_DIR
  ?? (fs.existsSync(path.dirname(LOCAL_OUT)) ? LOCAL_OUT : path.join(os.tmpdir(), 'dive-deeper'));

/** The hub plugs in its own key sources and Exa route (its keys can sit behind a proxy). */
type Hooks = { secret?: (name: string) => string | undefined; exaSearch?: (body: Record<string, unknown>) => Promise<Response> };
let hooks: Hooks = {};
export function configure(h: Hooks): void { hooks = { ...hooks, ...h }; }
const VAULT = process.env.VAULT_PATH ?? 'D:/Tools/my-vault/vault.json';
const LAB = (process.env.LAB_URL ?? 'https://ee-auto.up.railway.app').replace(/\/+$/, '');
// deepseek goes to Vectide (the 1B-token pack, as the hub does since 2026-10-26); anything else
// (gpt-6.1-sol in section G) stays on the ZM router. DD_LLM_URL / DD_LLM_KEY_NAME override both.
const ROUTES = {
  deepseek: { url: 'https://vectide.cn/v1', key: 'VECTIDE_DEEPSEEK_KEY' },
  other: { url: 'https://asiasouth.up.railway.app/v1', key: 'ZM_AI_FIXED_KEY' },
};
function route(model: string): { url: string; key: string } {
  const r = model.startsWith('deepseek') ? ROUTES.deepseek : ROUTES.other;
  return { url: (process.env.DD_LLM_URL ?? r.url).replace(/\/+$/, ''), key: secret(process.env.DD_LLM_KEY_NAME ?? r.key) };
}
export const DEFAULT_MODEL = process.env.DD_LLM_MODEL ?? 'deepseek-v4.1-flash-1017';

// One queue of LLM calls for the whole process, shared by every lane running at once.
const LLM_CONCURRENCY = Math.max(1, Number(process.env.DD_LLM_CONCURRENCY ?? 3) || 3);
const LLM_429_RETRIES = 8;
let llmInFlight = 0;
const llmWaiting: Array<() => void> = [];
async function llmSlot(): Promise<void> {
  if (llmInFlight < LLM_CONCURRENCY) { llmInFlight++; return; }
  await new Promise<void>((resolve) => llmWaiting.push(resolve));
  llmInFlight++;
}
function llmRelease(): void {
  llmInFlight--;
  llmWaiting.shift()?.();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Servers that leave their intermediate certificate out of the TLS handshake. Seen 2026-10-26:
// cims.cidb.gov.my answers the hub (Railway, Southeast Asia) with only its leaf, signed by
// Sectigo Public Server Authentication CA OV R36, so verification fails there while it passes
// from Malaysia. Only these hosts get the extra intermediate; every other request is plain fetch.
const EXTRA_CA: Array<{ domain: string; file: string }> = [{ domain: 'cidb.gov.my', file: 'sectigo-ov-r36.pem' }];
const caCache = new Map<string, string[]>();
function extraCaFor(url: string): string[] | null {
  let h = '';
  try { h = new URL(url).hostname; } catch { return null; }
  const hit = EXTRA_CA.find((x) => h === x.domain || h.endsWith('.' + x.domain));
  if (!hit) return null;
  if (!caCache.has(hit.file)) {
    let pem = '';
    try { pem = fs.readFileSync(path.join(HERE, 'certs', hit.file), 'utf8'); } catch { /* fall back to the default store */ }
    caCache.set(hit.file, [...tls.rootCertificates, ...(pem ? [pem] : [])]);
  }
  return caCache.get(hit.file)!;
}

/** A GET/POST over node:https with an explicit CA list, following redirects. Throws like fetch does. */
async function httpsWithCa(url: string, init: { method?: string; headers: Record<string, string>; body?: string }, ca: string[], hops = 0): Promise<{ url: string; status: number; headers: Record<string, string>; text: string }> {
  const r = await new Promise<{ status: number; headers: Record<string, string>; text: string }>((resolve, reject) => {
    const req = https.request(url, { method: init.method ?? 'GET', headers: { ...init.headers, ...(init.body ? { 'content-length': String(Buffer.byteLength(init.body)) } : {}) }, ca }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')])), text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
  const loc = r.headers.location;
  if ([301, 302, 303, 307, 308].includes(r.status) && loc && hops < 5) {
    const next = new URL(loc, url).href;
    const keep = r.status === 307 || r.status === 308;
    return httpsWithCa(next, { headers: init.headers, ...(keep ? { method: init.method, body: init.body } : {}) }, ca, hops + 1);
  }
  return { url, ...r };
}

type Cred = { name: string; secret: string; baseUrl?: string };

let vaultCache: Cred[] | null = null;
function vault(): Cred[] {
  if (vaultCache) return vaultCache;
  try {
    const v = JSON.parse(fs.readFileSync(VAULT, 'utf8'));
    vaultCache = Array.isArray(v) ? v : (v.credentials ?? v.items ?? Object.values(v));
  } catch {
    vaultCache = [];
  }
  return vaultCache!;
}

export function secret(name: string): string {
  return (process.env[name] ?? hooks.secret?.(name) ?? vault().find((c) => c.name === name)?.secret ?? '').trim();
}

export type Finding = {
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  source: string | null;
  checked_at: string;
  evidence?: string;
  [extra: string]: unknown;
};

export type Meter = {
  started: number;
  llm: { calls: number; failed: number; promptChars: number; answerChars: number; tokensIn: number; tokensOut: number; byModel: Record<string, number> };
  maps: { calls: number; failed: number; byTool: Record<string, number> };
  exa: { calls: number; failed: number; results: number };
  brave: { calls: number; failed: number };
  http: { calls: number; failed: number };
  other: Record<string, number>;
};

export type Ctx = ReturnType<typeof makeCtx>;

export function makeCtx(diveId: string, section: string, lane: string) {
  const warnings: string[] = [];
  const meter: Meter = {
    started: Date.now(),
    llm: { calls: 0, failed: 0, promptChars: 0, answerChars: 0, tokensIn: 0, tokensOut: 0, byModel: {} },
    maps: { calls: 0, failed: 0, byTool: {} },
    exa: { calls: 0, failed: 0, results: 0 },
    brave: { calls: 0, failed: 0 },
    http: { calls: 0, failed: 0 },
    other: {},
  };
  const warn = (msg: string) => {
    warnings.push(msg);
    console.warn(`  ! ${msg}`);
  };
  const log = (msg: string) => console.log(`  ${msg}`);

  /** One chat call on the OpenAI-compatible router. Retries once on 429/5xx/transport; '' on failure. */
  async function llm(prompt: string, opts: { model?: string; system?: string; temperature?: number } = {}): Promise<string> {
    const model = opts.model ?? DEFAULT_MODEL;
    // toWellFormed: page text cut mid-emoji leaves half a surrogate pair, which Vectide rejects (HTTP 400).
    const messages = [...(opts.system ? [{ role: 'system', content: opts.system.toWellFormed() }] : []), { role: 'user', content: prompt.toWellFormed() }];
    const { url, key } = route(model);
    meter.llm.calls++;
    meter.llm.byModel[model] = (meter.llm.byModel[model] ?? 0) + 1;
    meter.llm.promptChars += prompt.length + (opts.system?.length ?? 0);
    // Vectide takes about 3 calls at once and answers 429 to the rest, so every call waits for
    // a slot, and a 429 is asked again after a growing pause. Patience, not a cap: no timeout.
    await llmSlot();
    try {
      let busy = 0;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url + '/chat/completions', {
            method: 'POST',
            headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
            body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0 }),
          });
          const raw = await res.text();
          if (res.status === 429 && busy < LLM_429_RETRIES) { await sleep(Math.min(30_000, 2_000 * 2 ** busy++)); attempt--; continue; }
          if (res.status === 429 || res.status >= 500) { warn(`llm ${model} HTTP ${res.status} (attempt ${attempt + 1})`); continue; }
          if (!res.ok) { warn(`llm ${model} HTTP ${res.status}: ${raw.slice(0, 200)}`); break; }
          const body = JSON.parse(raw);
          const answer = String(body.choices?.[0]?.message?.content ?? '').trim();
          meter.llm.answerChars += answer.length;
          meter.llm.tokensIn += Number(body.usage?.prompt_tokens ?? 0);
          meter.llm.tokensOut += Number(body.usage?.completion_tokens ?? 0);
          if (!answer) { warn(`llm ${model} returned an empty answer (attempt ${attempt + 1}, finish_reason ${body.choices?.[0]?.finish_reason ?? '?'}, ${body.usage?.completion_tokens ?? '?'} output tokens${body.error ? ', ' + String(body.error.code ?? body.error.message ?? '').slice(0, 80) : ''})`); continue; }
          return answer;
        } catch (e) {
          warn(`llm ${model} failed: ${(e as Error).message} (attempt ${attempt + 1})`);
        }
      }
      meter.llm.failed++;
      return '';
    } finally {
      llmRelease();
    }
  }

  /** One scraper.tech Maps MCP tool call. Returns the API's parsed JSON, or null. */
  async function maps(tool: 'search_maps' | 'place_info' | 'reviews' | 'place_photos', args: Record<string, string>): Promise<any> {
    meter.maps.calls++;
    meter.maps.byTool[tool] = (meter.maps.byTool[tool] ?? 0) + 1;
    const base = (process.env.SCRAPER_TECH_BASE_URL ?? 'https://mcp.scraper.tech').replace(/\/+$/, '');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${base}/${secret('SCRAPER_TECH_KEY')}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: tool, arguments: { country: 'my', ...args } } }),
        });
        if (res.status >= 500) { warn(`maps ${tool} HTTP ${res.status}`); continue; }
        if (!res.ok) { warn(`maps ${tool} HTTP ${res.status}`); break; }
        const rpc = await res.json() as any;
        const raw = rpc.result?.content?.[0]?.text ?? '';
        const data = JSON.parse(raw);
        // search_maps answers {status:"ok", data}; reviews has no status field at all.
        if (rpc.result?.isError || (data.status !== undefined && data.status !== 'ok')) { warn(`maps ${tool}: ${String(data.message ?? raw).slice(0, 200)}`); break; }
        return data;
      } catch (e) {
        warn(`maps ${tool} failed: ${(e as Error).message}`);
      }
    }
    meter.maps.failed++;
    return null;
  }

  /** Exa search. `text: true` adds page text (capped by Exa's own maxCharacters). */
  async function exa(query: string, opts: { numResults?: number; text?: boolean | number; type?: string; category?: string; includeDomains?: string[]; excludeDomains?: string[]; startPublishedDate?: string } = {}): Promise<any[]> {
    meter.exa.calls++;
    try {
      const body = {
        query,
        numResults: opts.numResults ?? 10,
        type: opts.type ?? 'auto',
        ...(opts.category ? { category: opts.category } : {}),
        ...(opts.includeDomains ? { includeDomains: opts.includeDomains } : {}),
        ...(opts.excludeDomains?.length ? { excludeDomains: opts.excludeDomains } : {}),
        ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}),
        ...(opts.text ? { contents: { text: typeof opts.text === 'number' ? { maxCharacters: opts.text } : true } } : {}),
      };
      const res = hooks.exaSearch
        ? await hooks.exaSearch(body)
        : await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'x-api-key': secret('EXA_API_KEY'), 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      const raw = await res.text();
      if (!res.ok) { warn(`exa HTTP ${res.status}: ${raw.slice(0, 200)}`); meter.exa.failed++; return []; }
      const results = JSON.parse(raw).results ?? [];
      meter.exa.results += results.length;
      return results;
    } catch (e) {
      warn(`exa failed: ${(e as Error).message}`);
      meter.exa.failed++;
      return [];
    }
  }

  /** Brave web search; returns web.results (title, url, description, age...). */
  async function brave(query: string, opts: { count?: number; country?: string } = {}): Promise<any[]> {
    meter.brave.calls++;
    const keys = [secret('BRAVE_SEARCH_API_KEY'), secret('BRAVE_SEARCH_API_KEY_2')].filter(Boolean);
    for (const key of keys) {
      try {
        const u = new URL('https://api.search.brave.com/res/v1/web/search');
        u.searchParams.set('q', query);
        u.searchParams.set('count', String(opts.count ?? 20));
        u.searchParams.set('country', opts.country ?? 'MY');
        const res = await fetch(u, { headers: { 'X-Subscription-Token': key, accept: 'application/json' } });
        if (res.status === 429) { warn('brave 429, trying the next key'); continue; }
        if (!res.ok) { warn(`brave HTTP ${res.status}`); continue; }
        return (await res.json() as any).web?.results ?? [];
      } catch (e) {
        warn(`brave failed: ${(e as Error).message}`);
      }
    }
    meter.brave.failed++;
    return [];
  }

  /** Plain GET of a page. Never throws: a failure comes back as status 0 with `error`. */
  async function page(url: string, init: RequestInit = {}): Promise<{ url: string; finalUrl: string; status: number; ms: number; headers: Record<string, string>; html: string; error?: string }> {
    meter.http.calls++;
    const t = Date.now();
    try {
      const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', ...(init.headers as Record<string, string>) };
      const ca = extraCaFor(url);
      if (ca) {
        const r = await httpsWithCa(url, { method: init.method, headers, body: init.body as string | undefined }, ca);
        return { url, finalUrl: r.url, status: r.status, ms: Date.now() - t, headers: r.headers, html: r.text };
      }
      const res = await fetch(url, { redirect: 'follow', ...init, headers });
      const html = await res.text();
      return { url, finalUrl: res.url, status: res.status, ms: Date.now() - t, headers: Object.fromEntries(res.headers), html };
    } catch (e) {
      meter.http.failed++;
      const cause = (e as any).cause;
      return { url, finalUrl: url, status: 0, ms: Date.now() - t, headers: {}, html: '', error: `${(e as Error).message}${cause ? ' (' + (cause.code ?? cause.message) + ')' : ''}` };
    }
  }

  return { diveId, section, lane, warnings, meter, warn, log, llm, maps, exa, brave, page, parseJson, htmlText, now: () => new Date().toISOString() };
}

/** First JSON object or array in a model answer, or null. Never throws. */
export function parseJson<T = any>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
    const a = body.indexOf(open);
    const b = body.lastIndexOf(close);
    if (a >= 0 && b > a) {
      try { return JSON.parse(body.slice(a, b + 1)); } catch { /* try the other shape */ }
    }
  }
  return null;
}

/** Visible text of an HTML page, roughly: scripts, styles and tags removed. */
export function htmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** The finished dive, read-only through the hub API, cached in out/ so reruns cost nothing. */
export async function loadDive(diveId: string, fresh = false): Promise<any> {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `dive-${diveId}.json`);
  if (!fresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(`${LAB}/api/company-dive/${encodeURIComponent(diveId)}`, { headers: { authorization: 'Bearer ' + secret('EE_AUTO_LAB_TOKEN') } });
  if (!res.ok) throw new Error(`GET /api/company-dive/${diveId}: HTTP ${res.status}`);
  const dive = await res.json();
  if (dive.status !== 'done') console.warn(`  ! dive ${diveId} is ${dive.status}, not done`);
  fs.writeFileSync(file, JSON.stringify(dive, null, 2));
  return dive;
}

/** The dive's source list as [id] -> url, for citing back into findings. */
export function sourceUrl(dive: any, id: number): string | null {
  return dive.result?.sources?.find((s: any) => s.id === id)?.url ?? null;
}

/** Another lane's saved output for this dive (out/<lane>-<diveId>.json), or null when it did not run. */
export function readLane(diveId: string, lane: string): any | null {
  const file = path.join(OUT, `${lane}-${diveId}.json`);
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; } catch { return null; }
}

/** The names a page has to carry to be about this company, and its own domains. */
export function nameOf(dive: any) {
  const id = dive.result?.identity ?? {};
  const legal = String(id.legal_name ?? dive.company ?? '').trim();
  const bare = legal.replace(/\b(sdn\.?\s*bhd\.?|berhad|bhd\.?|plt|enterprise|holdings?)(?=\W|$)/gi, '').replace(/[^\p{L}\p{N}&' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const short = String(id.aliases?.[0] ?? bare ?? legal).trim();
  const brand = legal.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/)[0] ?? '';
  const domains: string[] = [...new Set<string>((id.official_domains ?? []).map((d: string) => String(d).toLowerCase().replace(/^www\./, '')))];
  const hostOf = (u: string | null | undefined) => { try { return u ? new URL(u).hostname.toLowerCase().replace(/^www\./, '') : ''; } catch { return ''; } };
  const own = (u: string | null | undefined) => { const h = hostOf(u); return !!h && domains.some((d) => h === d || h.endsWith('.' + d)); };
  /** True when the text names the company: the bare legal name or one of its aliases. */
  const names = [bare, short, ...(id.aliases ?? [])].map((x: string) => String(x).toLowerCase()).filter((x: string) => x.length >= 4);
  const mentions = (text: string) => { const t = String(text ?? '').toLowerCase().replace(/\s+/g, ' '); return names.some((n) => t.includes(n)); };
  return { legal, bare, short, brand, domains, hostOf, own, mentions, address: String(id.address ?? ''), industry: String(id.industry ?? '') };
}

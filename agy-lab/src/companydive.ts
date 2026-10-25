// One company deep dive, start to finish:
//
//   1 discover   Brave x8 (outside the Tavily budget) + Tavily search T1
//   2 triage     LLM: who the company is, which URLs are really about it, what to read
//   3 read       Tavily map T2 on the official site, LLM picks pages, extract T3 + T4
//   4 analyse    LLM: cited facts, contradictions, gaps, the gap-filling searches
//   5 fill gaps  Tavily search T5..T11
//   6 reflect    LLM: new facts, what is still missing, up to 3 reserve calls
//   7 write      LLM: the dossier, every claim cited to the source list
//
// Tavily never takes more than 15 calls (the Budget refuses the 16th), and one
// is always left unspent. Every URL is read at most once: the ledger knows which
// pages already came back with text.
//
// Tavily goes through the shared key pool in tavily.ts, so dives and contact
// research see the same quota. Every thinking step is the deepseek model contact
// research uses (extract-llm.ts, CONTACT_LLM_*). Brave keys are BRAVE_API_KEYS.
// Dives run in this process, one at a time, and are kept in company_dive.
//
//   GET  /company-dive              the page
//   POST /api/company-dive          {company, country?} -> {id}
//   GET  /api/company-dive          recent dives
//   GET  /api/company-dive/:id      live log, then dossier, facts, sources, Tavily calls

import * as brave from './brave.ts';
import * as tavily from './tavily.ts';
import * as extractLlm from './extract-llm.ts';
import * as reportdb from './reportdb.ts';

export type Source = {
  id: number;
  url: string;
  title: string;
  snippets: string[];
  content: string;
  contentKind: 'none' | 'chunks' | 'page';
  found: string[];
  failed?: string;
};

export type Fact = { topic: string; fact: string; sources: number[]; confidence: 'high' | 'medium' | 'low' };

export type Identity = {
  legal_name?: string;
  aliases?: string[];
  registration_numbers?: string[];
  address?: string;
  official_domains?: string[];
  industry?: string;
  summary?: string;
};

export type DiveResult = {
  identity: Identity;
  facts: Fact[];
  contradictions: string[];
  gaps: string[];
  sources: Array<Omit<Source, 'content' | 'snippets'> & { relevant: boolean }>;
  tavily: TavilyCall[];
  llm: LlmUse[];
  braveCalls: number;
};

export type Progress = (stage: string, msg: string) => void | Promise<void>;

/** Hosts whose pages Tavily cannot read (login or bot walls); their search snippets are all we get. */
const WALLED = /(^|\.)(facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|x\.com|twitter\.com|ctoscredit\.com\.my|dnb\.com|bloomberg\.com|zoominfo\.com)$/i;

const COUNTRY_CODES: Record<string, string> = {
  malaysia: 'MY', singapore: 'SG', indonesia: 'ID', thailand: 'TH', philippines: 'PH', vietnam: 'VN',
  china: 'CN', 'hong kong': 'HK', taiwan: 'TW', japan: 'JP', 'south korea': 'KR', india: 'IN',
  australia: 'AU', 'new zealand': 'NZ', 'united kingdom': 'GB', 'united states': 'US', canada: 'CA',
};

const TOPICS = ['identity', 'ownership_people', 'products_services', 'projects_clients', 'footprint',
  'size_financials', 'reputation', 'news', 'competitors', 'digital_presence', 'risks'];

// ---------------------------------------------------------------- budget and model

export const MAX_TAVILY_CALLS = 15;

export type TavilyCall = { n: number; path: string; label: string; credits: number; ms: number; ok: boolean; note?: string };

/** Counts a dive's Tavily calls and refuses the one past the cap. A call no key accepted costs nothing and is not counted. */
export class Budget {
  calls: TavilyCall[] = [];
  readonly max: number;
  constructor(max = MAX_TAVILY_CALLS) { this.max = max; }
  get used(): number { return this.calls.length; }
  get left(): number { return this.max - this.calls.length; }
  get credits(): number { return this.calls.reduce((n, c) => n + c.credits, 0); }
}

export class BudgetSpent extends Error {}

type TavilyRequest = typeof tavily.request;

export async function budgetedCall(
  budget: Budget,
  path: 'search' | 'extract' | 'map',
  body: Record<string, unknown>,
  label: string,
  request: TavilyRequest = tavily.request,
): Promise<Record<string, any>> {
  if (budget.left <= 0) throw new BudgetSpent(`Tavily budget of ${budget.max} calls is spent`);
  const started = Date.now();
  try {
    const out = await request(path, body);
    budget.calls.push({ n: budget.used + 1, path, label, credits: Number(out.usage?.credits ?? 0), ms: Date.now() - started, ok: true });
    return out;
  } catch (err) {
    const code = (err as { code?: string }).code;
    // Refused before Tavily did any work: no budget spent.
    if (code !== 'quota' && code !== 'not_installed') {
      budget.calls.push({ n: budget.used + 1, path, label, credits: 0, ms: Date.now() - started, ok: false, note: (err as Error).message.slice(0, 200) });
    }
    throw err;
  }
}

export type LlmUse = { step: string; ms: number; promptChars: number; answerChars: number };

/** The deepseek model contact research already uses (CONTACT_LLM_*), with three tries per step. */
async function ask(prompt: string, opts: { step: string; maxTokens?: number; uses?: LlmUse[] }): Promise<string> {
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = await extractLlm.ask(prompt, { timeoutMs: 300_000, maxTokens: opts.maxTokens });
      const answer = stripThinking(out.answer);
      opts.uses?.push({ step: opts.step, ms: out.ms, promptChars: prompt.length, answerChars: answer.length });
      return answer;
    } catch (err) {
      lastErr = (err as Error).message;
      if ((err as { code?: string }).code === 'not_configured') break;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 5_000));
    }
  }
  throw new Error(`LLM failed at ${opts.step}: ${lastErr}`);
}

/** Some gateways leave the model's reasoning inline in <think> tags. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** The first JSON object or array in a model answer, fences and prose around it ignored. */
export function parseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error(`no JSON in answer: ${text.slice(0, 200)}`);
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(body.slice(start, i + 1)) as T;
  }
  throw new Error(`unterminated JSON in answer: ${text.slice(0, 200)}`);
}

/** Ask for JSON; one more round with the parse error if the first answer does not parse. */
async function askJson<T>(prompt: string, opts: { step: string; maxTokens?: number; uses?: LlmUse[] }): Promise<T> {
  const first = await ask(prompt, opts);
  try {
    return parseJson<T>(first);
  } catch (err) {
    const retry = await ask(`${prompt}\n\nYour previous answer could not be parsed (${(err as Error).message}). Answer again with only the JSON.`, { ...opts, step: opts.step + ':retry' });
    return parseJson<T>(retry);
  }
}

// ---------------------------------------------------------------- helpers

export function shortName(company: string): string {
  let name = company.trim();
  const suffix = /[\s,]+(sdn\.?\s*bhd\.?|bhd\.?|berhad|plt|pte\.?\s*ltd\.?|ltd\.?|limited|llc|inc\.?|corp(oration)?\.?|co\.?|enterprise)\s*$/i;
  while (suffix.test(name)) name = name.replace(suffix, '');
  return name.replace(/[.,\s]+$/, '') || company.trim();
}

/** The dedupe key for a URL: no www, fragment, tracking params or trailing slash. */
export function urlKey(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$)/i.test(p)) u.searchParams.delete(p);
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}${u.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function hostOf(raw: string): string {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

export class Ledger {
  sources: Source[] = [];
  private byKey = new Map<string, Source>();

  add(url: string, title: string, snippets: string[], found: string): Source {
    const key = urlKey(url);
    let s = this.byKey.get(key);
    if (!s) {
      s = { id: this.sources.length + 1, url, title, snippets: [], content: '', contentKind: 'none', found: [] };
      this.sources.push(s);
      this.byKey.set(key, s);
    }
    if (!s.title && title) s.title = title;
    for (const sn of snippets) if (sn && !s.snippets.includes(sn)) s.snippets.push(sn);
    if (!s.found.includes(found)) s.found.push(found);
    return s;
  }

  find(url: string): Source | undefined {
    return this.byKey.get(urlKey(url));
  }

  byId(id: number): Source | undefined {
    return this.sources[id - 1];
  }

  setContent(s: Source, text: string, kind: 'chunks' | 'page'): void {
    if (!text) return;
    if (kind === 'page' || s.contentKind !== 'page') {
      s.content = kind === 'chunks' && s.contentKind === 'chunks' ? `${s.content}\n…\n${text}` : text;
      s.contentKind = kind;
      delete s.failed;
    }
  }
}

function clip(text: string, max: number): string {
  const t = text.replace(/\n{3,}/g, '\n\n').trim();
  return t.length <= max ? t : t.slice(0, max) + ' …[cut]';
}

/** The material the model reads: page text first, then chunks, then bare snippets, under one size cap. */
export function corpus(sources: Source[], maxChars: number): string {
  const rank = (s: Source) => (s.contentKind === 'page' ? 0 : s.contentKind === 'chunks' ? 1 : 2);
  const parts: string[] = [];
  let total = 0;
  for (const s of [...sources].sort((a, b) => rank(a) - rank(b) || a.id - b.id)) {
    const body = s.contentKind === 'page' ? clip(s.content, 6_000)
      : s.contentKind === 'chunks' ? clip(s.content, 2_500)
      : clip(s.snippets.join(' | '), 700);
    if (!body) continue;
    const block = `### [${s.id}] ${s.title}\nURL: ${s.url}\n${body}\n`;
    if (total + block.length > maxChars) continue;
    parts.push(block);
    total += block.length;
  }
  return parts.join('\n');
}

function ids(list: unknown, ledger: Ledger): number[] {
  return Array.isArray(list) ? [...new Set(list.map(Number).filter((n) => ledger.byId(n)))] : [];
}

function cleanFacts(list: unknown, ledger: Ledger): Fact[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((f) => f && typeof f.fact === 'string' && f.fact.trim())
    .map((f) => ({
      topic: TOPICS.includes(f.topic) ? f.topic : 'identity',
      fact: String(f.fact).trim(),
      sources: ids(f.sources, ledger),
      confidence: (['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium') as Fact['confidence'],
    }));
}

// ---------------------------------------------------------------- prompts

function triagePrompt(company: string, country: string, ledger: Ledger, t1Answer: string): string {
  const rows = ledger.sources.map((s) =>
    `[${s.id}] ${s.title} | ${s.url} | found by: ${s.found.join(', ')} | text: ${s.contentKind === 'none' ? 'no' : 'yes'}\n    ${clip(s.snippets.join(' | '), 400)}`,
  ).join('\n');
  return `You are the research lead for a company due-diligence dossier.
Target company: "${company}" (${country}).

Below are search results from Brave and Tavily. Many are about other companies with similar names. Work out which ones are about the target. Use hard anchors: registration number, address, official domains, industry. Then decide what to read next.

Tavily's own summary (machine-written, unverified): ${t1Answer || '(none)'}

RESULTS
${rows}

Answer with ONLY this JSON:
{
  "identity": {"legal_name": "", "aliases": ["trade names, other-language names"], "registration_numbers": [], "address": "", "official_domains": ["domains the company itself runs"], "industry": "", "summary": "one sentence"},
  "relevant_ids": [ids that are about the target company],
  "map_domain": "the company's main official domain to crawl for its site structure, or null",
  "extract_ids": [up to 20 relevant ids with text: no, most informative first. Skip facebook, instagram, linkedin, tiktok, x, ctoscredit, dnb and bloomberg: those block reading, and their snippets already count. Skip pages on map_domain, which get picked after the site map],
  "gaps": ["important things about the company nothing above answers yet"]
}`;
}

function pickPagesPrompt(company: string, identity: Identity, urls: string[], max: number): string {
  return `Company: "${company}" — ${identity.summary ?? ''}
These URLs are from the company's own website. Pick up to ${max} that tell the most about the company itself: about/profile, services and products, projects and case studies, clients, team and leadership, locations and agents, contact, FAQ, pricing, awards. Skip generic industry news and blog posts that are not about the company, and duplicates (?format= variants, pagination).

${urls.map((u) => '- ' + u).join('\n')}

Answer with ONLY JSON: {"urls": ["..."]}`;
}

function analysePrompt(company: string, country: string, identity: Identity, gaps: string[], material: string, maxSearches: number): string {
  return `You are writing a due-diligence dossier on "${company}" (${country}).
Known identity: ${JSON.stringify(identity)}
Open questions from triage: ${JSON.stringify(gaps)}

SOURCE MATERIAL (each block starts with [id]):
${material}

Tasks:
1. Extract every useful fact about the target company. Each fact cites the [id]s it came from. Do not use outside knowledge. Ignore material about other companies with similar names.
2. Note contradictions between sources, such as different addresses, founding dates or headcounts.
3. List what an investor, partner or competitor would still want to know.
4. Plan up to ${maxSearches} web searches that would close the biggest gaps. Make each query specific: use the exact name, aliases or registration number. Set include_domains when one site is the obvious place (e.g. linkedin.com for people, a government registry, a forum for reviews). Use topic "news" with time_range "year" for recent news. Do not repeat what the material already answers.

Topics: ${TOPICS.join(', ')}.

Answer with ONLY this JSON:
{
  "facts": [{"topic": "", "fact": "", "sources": [ids], "confidence": "high|medium|low"}],
  "contradictions": [""],
  "gaps": [""],
  "searches": [{"query": "", "purpose": "", "topic": "general|news", "include_domains": [], "time_range": null}]
}`;
}

function reflectPrompt(company: string, identity: Identity, facts: Fact[], gaps: string[], material: string, maxCalls: number, readable: string): string {
  return `Dossier on "${company}". Identity: ${JSON.stringify(identity)}
Facts so far (${facts.length}): ${JSON.stringify(facts.map((f) => [f.topic, f.fact]))}
Open gaps: ${JSON.stringify(gaps)}

NEW MATERIAL from gap-filling searches (each block starts with [id]):
${material}

Tasks:
1. Extract new facts from the NEW MATERIAL only. Cite [id]s. Skip anything already in the facts list. Ignore other companies with similar names.
2. Say which gaps are still open.
3. ${maxCalls > 0 ? `You may spend up to ${maxCalls} more calls, but only on gaps worth it. A call is either a search ({"kind":"search","query":"","topic":"general|news","include_domains":[],"time_range":null}) or a page read ({"kind":"extract","ids":[up to 20 ids]}). These ids have not been read yet and can be extracted: ${readable || '(none)'}. Return [] if nothing is worth it.` : 'No calls are left. Return "next": [].'}

Answer with ONLY this JSON:
{"facts": [{"topic": "", "fact": "", "sources": [ids], "confidence": "high|medium|low"}], "gaps": [""], "next": []}`;
}

function factsPrompt(company: string, facts: Fact[], material: string): string {
  return `Dossier on "${company}". Facts so far: ${JSON.stringify(facts.map((f) => [f.topic, f.fact]))}

NEW MATERIAL (each block starts with [id]):
${material}

Extract new facts about "${company}" from the NEW MATERIAL only. Cite [id]s and skip anything already known.
Answer with ONLY JSON: {"facts": [{"topic": "", "fact": "", "sources": [ids], "confidence": "high|medium|low"}], "gaps_closed": [""]}`;
}

function dossierPrompt(company: string, country: string, identity: Identity, facts: Fact[], contradictions: string[], gaps: string[], sourceIndex: string): string {
  return `Write a company due-diligence dossier in Markdown on "${company}" (${country}).
Use ONLY the facts below. Cite each claim with its source ids in square brackets, like [3] or [3][7]. Write in clear, plain English for a business reader. Use tables where they help (people, projects, registrations). Say plainly when something is unknown.

Identity: ${JSON.stringify(identity)}
Facts: ${JSON.stringify(facts)}
Contradictions between sources: ${JSON.stringify(contradictions)}
Still unknown: ${JSON.stringify(gaps)}

Sources:
${sourceIndex}

Sections, in order (skip one only if nothing at all is known):
# ${identity.legal_name || company}
A 3–5 sentence summary at the top.
## Identity and registration
## Ownership and people
## Products and services
## Projects and clients
## Footprint and size
## Reputation and reviews
## News and timeline
## Competitors and positioning
## Digital presence
## Risks and red flags
## Open questions
Do not add a source list; it is shown separately.`;
}

// ---------------------------------------------------------------- the dive

export async function run(company: string, country: string, progress: Progress): Promise<{ result: DiveResult; dossier: string }> {
  const short = shortName(company);
  const cc = COUNTRY_CODES[country.trim().toLowerCase()];
  const tavilyCountry = cc ? country.trim().toLowerCase() : undefined;
  const ledger = new Ledger();
  const budget = new Budget();
  const uses: LlmUse[] = [];
  let braveCalls = 0;

  const say = async (stage: string, msg: string) => { await progress(stage, msg); };
  const T = (path: 'search' | 'extract' | 'map', body: Record<string, unknown>, label: string) =>
    budgetedCall(budget, path, body, label);

  const addSearchResults = (out: Record<string, any>, found: string) => {
    for (const r of out.results ?? []) {
      const s = ledger.add(String(r.url), String(r.title ?? ''), [], found);
      if (r.raw_content) ledger.setContent(s, String(r.raw_content), 'page');
      else if (r.content) ledger.setContent(s, String(r.content), 'chunks');
    }
  };

  const addExtractResults = (out: Record<string, any>, found: string) => {
    for (const r of out.results ?? []) {
      const s = ledger.find(String(r.url)) ?? ledger.add(String(r.url), '', [], found);
      if (!s.found.includes(found)) s.found.push(found);
      ledger.setContent(s, String(r.raw_content ?? ''), 'page');
    }
    for (const f of out.failed_results ?? []) {
      const s = ledger.find(String(f.url));
      if (s && s.contentKind === 'none') s.failed = String(f.error ?? 'failed');
    }
  };

  // 1. discover -----------------------------------------------------------
  await say('discover', `Brave sweep for "${company}" (short name "${short}")`);
  const q = `"${short}"`;
  const braveQueries: Array<[string, string, 'web' | 'news']> = [
    ['exact', `"${company}"`, 'web'],
    ['country', `${q} ${country}`, 'web'],
    ['facebook', `${q} site:facebook.com`, 'web'],
    ['linkedin', `${q} site:linkedin.com`, 'web'],
    ['reviews', `${q} review OR complaint OR scam`, 'web'],
    ['people', `${q} founder OR director OR CEO OR owner`, 'web'],
    ['projects', `${q} project OR client OR award OR partnership`, 'web'],
    ['news', q, 'news'],
  ];
  for (const [label, query, kind] of braveQueries) {
    try {
      const hits = await brave.search(query, { country: cc, kind });
      braveCalls++;
      for (const h of hits) ledger.add(h.url, h.title, h.snippets, `brave:${label}`);
      await say('discover', `Brave ${label}: ${hits.length} results`);
    } catch (err) {
      await say('discover', `Brave ${label} failed: ${(err as Error).message}`);
    }
  }

  let t1Answer = '';
  try {
    const out = await T('search', {
      query: `${company} ${country} company profile`,
      search_depth: 'advanced', max_results: 20, include_answer: 'advanced', include_raw_content: 'markdown',
      ...(tavilyCountry ? { country: tavilyCountry } : {}),
    }, 'T1 big picture');
    t1Answer = String(out.answer ?? '');
    addSearchResults(out, 'tavily:T1');
    await say('discover', `Tavily T1: ${(out.results ?? []).length} results; ${ledger.sources.length} unique URLs in total`);
  } catch (err) {
    await say('discover', `Tavily T1 failed: ${(err as Error).message}`);
  }
  if (!ledger.sources.length) throw new Error('Discovery found nothing: no Brave or Tavily results');

  // 2. triage -------------------------------------------------------------
  await say('triage', `LLM triage of ${ledger.sources.length} URLs`);
  const tri = await askJson<{ identity?: Identity; relevant_ids?: unknown; map_domain?: string | null; extract_ids?: unknown; gaps?: string[] }>(
    triagePrompt(company, country, ledger, t1Answer), { step: 'triage', uses });
  const identity: Identity = tri.identity ?? {};
  const relevant = new Set(ids(tri.relevant_ids, ledger));
  let gaps: string[] = Array.isArray(tri.gaps) ? tri.gaps.map(String) : [];
  const mapDomain = typeof tri.map_domain === 'string' && tri.map_domain.trim() ? hostOf('https://' + tri.map_domain.replace(/^https?:\/\//, '')) : '';
  const thirdParty = ids(tri.extract_ids, ledger)
    .map((id) => ledger.byId(id)!)
    .filter((s) => s.contentKind === 'none' && !WALLED.test(hostOf(s.url)) && (!mapDomain || hostOf(s.url) !== mapDomain))
    .slice(0, 20);
  await say('triage', `${relevant.size} URLs are about the company; official site ${mapDomain || 'unknown'}; ${thirdParty.length} pages to read`);

  // 3. read ---------------------------------------------------------------
  let ownPages: string[] = [];
  if (mapDomain) {
    try {
      const out = await T('map', { url: 'https://' + mapDomain, max_depth: 2, limit: 50 }, 'T2 site map');
      const mapped = [...new Set((out.results ?? []).map(String))] as string[];
      const unread = mapped.filter((u) => (ledger.find(u)?.contentKind ?? 'none') === 'none');
      await say('read', `Tavily T2: ${mapped.length} pages on ${mapDomain}, ${unread.length} not read yet`);
      if (unread.length) {
        const pick = await askJson<{ urls?: string[] }>(pickPagesPrompt(company, identity, unread.slice(0, 150), 15), { step: 'pick-pages', uses });
        const allowed = new Set(unread.map(urlKey));
        ownPages = (pick.urls ?? []).filter((u) => allowed.has(urlKey(u))).slice(0, 20);
      }
    } catch (err) {
      await say('read', `Tavily T2 failed: ${(err as Error).message}`);
    }
  }
  for (const u of ownPages) relevant.add(ledger.add(u, '', [], 'tavily:T2').id);

  await Promise.all([
    ownPages.length && T('extract', { urls: ownPages, extract_depth: 'advanced', format: 'markdown' }, 'T3 official pages')
      .then((out) => { addExtractResults(out, 'tavily:T3'); return say('read', `Tavily T3: read ${(out.results ?? []).length} of ${ownPages.length} official pages`); })
      .catch((err) => say('read', `Tavily T3 failed: ${err.message}`)),
    thirdParty.length && T('extract', { urls: thirdParty.map((s) => s.url), extract_depth: 'advanced', format: 'markdown' }, 'T4 third-party pages')
      .then((out) => { addExtractResults(out, 'tavily:T4'); return say('read', `Tavily T4: read ${(out.results ?? []).length} of ${thirdParty.length} third-party pages`); })
      .catch((err) => say('read', `Tavily T4 failed: ${err.message}`)),
  ]);

  // 4. analyse ------------------------------------------------------------
  const relevantSources = () => ledger.sources.filter((s) => relevant.has(s.id));
  const maxSearches = Math.max(0, Math.min(8, budget.left - 4));
  await say('analyse', `LLM analysis of ${relevantSources().length} sources`);
  const ana = await askJson<{ facts?: unknown; contradictions?: string[]; gaps?: string[]; searches?: Array<Record<string, any>> }>(
    analysePrompt(company, country, identity, gaps, corpus(relevantSources(), 120_000), maxSearches), { step: 'analyse', uses, maxTokens: 16_000 });
  let facts = cleanFacts(ana.facts, ledger);
  const contradictions = Array.isArray(ana.contradictions) ? ana.contradictions.map(String) : [];
  gaps = Array.isArray(ana.gaps) ? ana.gaps.map(String) : gaps;
  const searches = (ana.searches ?? []).filter((s) => s && typeof s.query === 'string' && s.query.trim()).slice(0, maxSearches);
  await say('analyse', `${facts.length} facts, ${gaps.length} gaps, ${searches.length} searches planned`);

  // 5. fill gaps ----------------------------------------------------------
  const before = new Set(ledger.sources.map((s) => s.id));
  const summaries: string[] = [];
  const gapSearch = async (s: Record<string, any>, label: string) => {
    const body: Record<string, unknown> = {
      query: String(s.query), search_depth: 'advanced', max_results: 8, chunks_per_source: 3, include_answer: 'basic',
      topic: s.topic === 'news' ? 'news' : 'general',
    };
    if (Array.isArray(s.include_domains) && s.include_domains.length) body.include_domains = s.include_domains.map(String).slice(0, 10);
    if (['day', 'week', 'month', 'year'].includes(s.time_range)) body.time_range = s.time_range;
    if (tavilyCountry && body.topic === 'general' && !body.include_domains) body.country = tavilyCountry;
    const out = await T('search', body, `${label} ${String(s.query).slice(0, 60)}`);
    addSearchResults(out, `tavily:${label}`);
    if (out.answer) summaries.push(`Search "${s.query}" summary (machine-written, unverified): ${out.answer}`);
    return (out.results ?? []).length;
  };
  for (let i = 0; i < searches.length; i += 3) {
    await Promise.all(searches.slice(i, i + 3).map((s, j) => {
      const label = `T${budget.used + 1 + j}`;
      return gapSearch(s, label)
        .then((n) => say('fill', `${label} "${s.query}": ${n} results`))
        .catch((err) => say('fill', `${label} "${s.query}" failed: ${err.message}`));
    }));
  }
  // Everything the gap searches returned is in scope: the queries were about this company.
  const fresh = ledger.sources.filter((s) => !before.has(s.id) || s.found.some((f) => f.startsWith('tavily:T') && !/^tavily:T[1-4]$/.test(f)));
  for (const s of fresh) relevant.add(s.id);

  // 6. reflect ------------------------------------------------------------
  const reserve = Math.max(0, budget.left - 1);
  const readable = relevantSources().filter((s) => s.contentKind === 'none' && !WALLED.test(hostOf(s.url)) && !s.failed).map((s) => s.id).join(', ');
  await say('reflect', `LLM reflection on ${fresh.length} new sources; ${reserve} reserve calls available`);
  const ref = await askJson<{ facts?: unknown; gaps?: string[]; next?: Array<Record<string, any>> }>(
    reflectPrompt(company, identity, facts, gaps, corpus(fresh, 80_000) + '\n' + summaries.join('\n'), reserve, readable), { step: 'reflect', uses, maxTokens: 12_000 });
  facts = facts.concat(cleanFacts(ref.facts, ledger));
  gaps = Array.isArray(ref.gaps) ? ref.gaps.map(String) : gaps;
  const next = (ref.next ?? []).slice(0, reserve);
  if (next.length) {
    const beforeReserve = new Set(ledger.sources.map((s) => `${s.id}:${s.contentKind}`));
    for (const n of next) {
      const label = `T${budget.used + 1}`;
      try {
        if (n.kind === 'extract') {
          const urls = ids(n.ids, ledger).map((id) => ledger.byId(id)!).filter((s) => s.contentKind === 'none').map((s) => s.url).slice(0, 20);
          if (!urls.length) continue;
          const out = await T('extract', { urls, extract_depth: 'advanced', format: 'markdown' }, `${label} reserve read`);
          addExtractResults(out, `tavily:${label}`);
          await say('reflect', `${label} read ${(out.results ?? []).length} of ${urls.length} pages`);
        } else if (typeof n.query === 'string') {
          const got = await gapSearch(n, label);
          await say('reflect', `${label} "${n.query}": ${got} results`);
        }
      } catch (err) {
        if (err instanceof BudgetSpent) break;
        await say('reflect', `${label} failed: ${(err as Error).message}`);
      }
    }
    const reserveNew = ledger.sources.filter((s) => !beforeReserve.has(`${s.id}:${s.contentKind}`) && s.contentKind !== 'none');
    for (const s of reserveNew) relevant.add(s.id);
    if (reserveNew.length) {
      const extra = await askJson<{ facts?: unknown }>(factsPrompt(company, facts, corpus(reserveNew, 80_000)), { step: 'reserve-facts', uses, maxTokens: 8_000 });
      facts = facts.concat(cleanFacts(extra.facts, ledger));
    }
  }

  // 7. write --------------------------------------------------------------
  const cited = new Set(facts.flatMap((f) => f.sources));
  const sourceIndex = ledger.sources.filter((s) => cited.has(s.id)).map((s) => `[${s.id}] ${s.title || hostOf(s.url)} — ${s.url}`).join('\n');
  await say('write', `Writing the dossier from ${facts.length} facts and ${cited.size} cited sources`);
  const dossier = await ask(dossierPrompt(company, country, identity, facts, contradictions, gaps, sourceIndex), { step: 'dossier', uses, maxTokens: 16_000 });

  const result: DiveResult = {
    identity,
    facts,
    contradictions,
    gaps,
    sources: ledger.sources.map(({ content, snippets, ...rest }) => ({ ...rest, relevant: relevant.has(rest.id) })),
    tavily: budget.calls,
    llm: uses,
    braveCalls,
  };
  await say('done', `Tavily ${budget.used}/${budget.max} calls, ${budget.credits} credits; Brave ${braveCalls}; LLM ${uses.length} calls`);
  return { result, dossier: stripThinking(dossier).replace(/^```(?:markdown)?\s*|\s*```$/g, '') };
}

// ---------------------------------------------------------------- storage

export type DiveRow = {
  id: number; company: string; country: string; status: string; stage: string;
  log: Array<{ at: string; stage: string; msg: string }>; result: DiveResult | null; dossier: string | null; error: string | null;
  tavily_calls: number; tavily_credits: number; brave_calls: number; llm_calls: number;
  created_at: string; finished_at: string | null;
};

let tableReady: Promise<unknown> | null = null;

function ensureTable(): Promise<unknown> {
  tableReady ??= reportdb.sql(`
    create table if not exists company_dive (
      id bigserial primary key,
      company text not null,
      country text not null,
      status text not null default 'queued',
      stage text not null default '',
      log jsonb not null default '[]',
      result jsonb,
      dossier text,
      error text,
      tavily_calls int not null default 0,
      tavily_credits int not null default 0,
      brave_calls int not null default 0,
      llm_calls int not null default 0,
      created_at timestamptz not null default now(),
      finished_at timestamptz
    )`).catch((err) => { tableReady = null; throw err; });
  return tableReady;
}

async function updateRow(id: number, fields: Partial<Omit<DiveRow, 'id' | 'created_at'>>): Promise<void> {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const vals = cols.map((c) => {
    const v = (fields as Record<string, unknown>)[c];
    return c === 'log' || c === 'result' ? JSON.stringify(v) : v;
  });
  await reportdb.sql(`update company_dive set ${sets} where id = $1`, [id, ...vals]);
}

// ---------------------------------------------------------------- runner

const waiting: number[] = [];
let active = 0;
const CONCURRENCY = 1;

async function execute(id: number): Promise<void> {
  const row = (await reportdb.sql<DiveRow>(`select * from company_dive where id = $1`, [id])).rows[0];
  if (!row) return;
  const log: DiveRow['log'] = [];
  await updateRow(id, { status: 'running', stage: 'discover' });
  const progress = async (stage: string, msg: string) => {
    log.push({ at: new Date().toISOString(), stage, msg });
    console.log(`[company-dive ${id}] ${stage}: ${msg}`);
    await updateRow(id, { stage, log }).catch((err) => console.error(`[company-dive ${id}] log write failed`, err));
  };
  try {
    const { result, dossier } = await run(row.company, row.country, progress);
    await updateRow(id, {
      status: 'done', stage: 'done', log, result, dossier,
      tavily_calls: result.tavily.length,
      tavily_credits: result.tavily.reduce((n, c) => n + c.credits, 0),
      brave_calls: result.braveCalls,
      llm_calls: result.llm.length,
      finished_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = (err as Error).message;
    log.push({ at: new Date().toISOString(), stage: 'failed', msg: message });
    console.error(`[company-dive ${id}] failed`, err);
    await updateRow(id, { status: 'failed', error: message, log, finished_at: new Date().toISOString() });
  }
}

function pump(): void {
  while (active < CONCURRENCY && waiting.length) {
    const id = waiting.shift()!;
    active++;
    execute(id).finally(() => { active--; pump(); });
  }
}

/** Dives live only in this process, so one still queued or running at boot was cut off by a restart. */
export async function failInterrupted(): Promise<void> {
  if (!reportdb.configured()) return;
  await ensureTable();
  await reportdb.sql(`update company_dive set status = 'failed', error = 'interrupted by a restart', finished_at = now()
                       where status in ('queued', 'running')`);
}

// ---------------------------------------------------------------- HTTP

type Ctx = {
  json: (res: import('node:http').ServerResponse, status: number, body: unknown) => void;
  readJson: (req: import('node:http').IncomingMessage) => Promise<Record<string, unknown>>;
};

/** /api/company-dive routes, behind the operator token. Returns false for any other path. */
export async function handle(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
  const p = url.pathname;
  if (p !== '/api/company-dive' && !p.startsWith('/api/company-dive/')) return false;
  if (!reportdb.configured()) {
    ctx.json(res, 503, { error: 'no report database configured' });
    return true;
  }
  await ensureTable();
  const method = req.method ?? 'GET';
  if (p === '/api/company-dive' && method === 'GET') {
    const out = await reportdb.sql(
      `select id, company, country, status, stage, tavily_calls, tavily_credits, brave_calls, llm_calls, created_at, finished_at
         from company_dive order by id desc limit 50`);
    ctx.json(res, 200, { dives: out.rows });
    return true;
  }
  if (p === '/api/company-dive' && method === 'POST') {
    const body = await ctx.readJson(req);
    const company = String(body.company ?? body.name ?? '').trim();
    const country = String(body.country ?? '').trim() || 'Malaysia';
    if (company.length < 2 || company.length > 200) {
      ctx.json(res, 400, { error: 'company is required' });
      return true;
    }
    if (!brave.keys().length) {
      ctx.json(res, 503, { error: 'BRAVE_API_KEYS is not set' });
      return true;
    }
    const out = await reportdb.sql<{ id: string }>(`insert into company_dive (company, country) values ($1, $2) returning id`, [company, country]);
    const id = Number(out.rows[0].id);
    waiting.push(id);
    pump();
    // Still in `waiting` after pump() means another dive holds the one slot.
    ctx.json(res, 202, { id, queued: waiting.includes(id), view_url: `/company-dive#${id}` });
    return true;
  }
  const m = p.match(/^\/api\/company-dive\/(\d+)$/);
  if (m && method === 'GET') {
    const row = (await reportdb.sql<DiveRow>(`select * from company_dive where id = $1`, [Number(m[1])])).rows[0];
    if (row) ctx.json(res, 200, row);
    else ctx.json(res, 404, { error: 'no such dive' });
    return true;
  }
  ctx.json(res, 404, { error: 'not found', path: p });
  return true;
}

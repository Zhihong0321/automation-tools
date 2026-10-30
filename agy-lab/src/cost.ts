// What one report cost to make: LLM tokens and the search / API calls, priced in
// US dollars. A company-dive, its preview and its deeper dive each give a Usage;
// price() turns it into lines and a total. Prices are the plans we pay for (the
// source sits beside each). A call with no per-call price is counted and named in
// `unpriced`, never guessed. Calls from before tokens were recorded are estimated
// from text length and marked so.
import type { LlmUse } from './companydive.ts';
import type { Meter } from './divedeeper/lib.ts';

const CNY_PER_USD = 7.2;

/** USD per million tokens, input and output alike, by model name. */
const LLM_PER_M: Array<{ model: RegExp; usd: number }> = [
  // Vectide 1B-token pack (VECTIDE_DEEPSEEK_KEY): CNY 100 for 1,000M tokens.
  { model: /^deepseek/i, usd: 100 / 1000 / CNY_PER_USD },
];

export const PRICES = {
  /** Tavily pay-as-you-go, per credit. */
  tavilyCredit: 0.008,
  /** Brave Search API, $5 per 1,000 requests. */
  braveCall: 0.005,
  /** One Exa search with highlights, measured 2026-10-24; Exa's own figure wins when it sends one. */
  exaSearch: 0.007,
  /** scraper.tech Maps, Basic plan: $4 for 30,000 requests. */
  mapsCall: 4 / 30_000,
};

/** A rough token count for text whose tokens were not reported. */
const TOKENS_PER_CHAR = 1 / 4;

export type LlmTally = { calls: number; tokensIn: number; tokensOut: number; estimated: boolean };

export type Usage = {
  llm: Record<string, LlmTally>;
  tavilyCalls: number;
  tavilyCredits: number;
  braveCalls: number;
  exaCalls: number;
  /** Exa calls that reported their own price, and what they reported. */
  exaReported: number;
  exaDollars: number;
  mapsCalls: number;
  /** Free calls: PageSpeed, WHOIS, DNS, page fetches. */
  httpCalls: number;
};

export type CostLine = { item: string; detail: string; usd: number | null; estimated?: boolean };
export type Cost = { usd: number; estimated: boolean; unpriced: string[]; lines: CostLine[] };

export const emptyUsage = (): Usage => ({ llm: {}, tavilyCalls: 0, tavilyCredits: 0, braveCalls: 0, exaCalls: 0, exaReported: 0, exaDollars: 0, mapsCalls: 0, httpCalls: 0 });

function addLlm(u: Usage, model: string, t: LlmTally): void {
  const has = u.llm[model] ?? { calls: 0, tokensIn: 0, tokensOut: 0, estimated: false };
  u.llm[model] = { calls: has.calls + t.calls, tokensIn: has.tokensIn + t.tokensIn, tokensOut: has.tokensOut + t.tokensOut, estimated: has.estimated || t.estimated };
}

/** A company-dive's (or its people step's) LLM calls. */
export function addLlmUses(u: Usage, uses: LlmUse[] | null | undefined): Usage {
  for (const c of uses ?? []) {
    const known = c.tokensIn != null || c.tokensOut != null;
    addLlm(u, c.engine || 'unknown', {
      calls: 1,
      tokensIn: known ? Number(c.tokensIn ?? 0) : Math.round((c.promptChars ?? 0) * TOKENS_PER_CHAR),
      tokensOut: known ? Number(c.tokensOut ?? 0) : Math.round((c.answerChars ?? 0) * TOKENS_PER_CHAR),
      estimated: !known,
    });
  }
  return u;
}

/** One deeper-dive lane's (or the preview's) meter. */
export function addMeter(u: Usage, m: Partial<Meter> | null | undefined): Usage {
  if (!m) return u;
  const llm = m.llm;
  if (llm) {
    const byTokens = llm.byModelTokens ?? {};
    const models = Object.entries(llm.byModel ?? {});
    const calls = models.reduce((n, [, c]) => n + c, 0) || 1;
    for (const [model, n] of models) {
      const t = byTokens[model];
      // Meters from before per-model tokens split the lane's total by calls.
      addLlm(u, model, t
        ? { calls: n, tokensIn: t.in, tokensOut: t.out, estimated: false }
        : { calls: n, tokensIn: Math.round((llm.tokensIn ?? 0) * n / calls), tokensOut: Math.round((llm.tokensOut ?? 0) * n / calls), estimated: models.length > 1 });
    }
  }
  u.exaCalls += m.exa?.calls ?? 0;
  u.exaReported += m.exa?.priced ?? 0;
  u.exaDollars += m.exa?.dollars ?? 0;
  u.braveCalls += m.brave?.calls ?? 0;
  u.mapsCalls += m.maps?.calls ?? 0;
  u.httpCalls += m.http?.calls ?? 0;
  return u;
}

/** A company-dive row: its counters plus the LLM and Exa calls kept in its result. */
export function diveUsage(row: { tavily_calls?: number; tavily_credits?: number; brave_calls?: number; llm?: LlmUse[] | null; people_llm?: LlmUse[] | null; people_exa?: Array<{ dollars?: number; ok?: boolean }> | null }): Usage {
  const u = emptyUsage();
  u.tavilyCalls = Number(row.tavily_calls ?? 0);
  u.tavilyCredits = Number(row.tavily_credits ?? 0);
  u.braveCalls = Number(row.brave_calls ?? 0);
  addLlmUses(u, row.llm);
  addLlmUses(u, row.people_llm);
  for (const e of row.people_exa ?? []) {
    u.exaCalls++;
    if (e.ok !== false) { u.exaReported++; u.exaDollars += Number(e.dollars ?? 0); }
  }
  return u;
}

const llmPrice = (model: string): number | null => LLM_PER_M.find((p) => p.model.test(model))?.usd ?? null;
const n = (x: number) => x.toLocaleString('en-US');
const calls = (x: number) => `${n(x)} ${x === 1 ? 'call' : 'calls'}`;
const mTok = (x: number) => x >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}k` : String(x);

export function price(u: Usage): Cost {
  const lines: CostLine[] = [];
  const unpriced: string[] = [];
  for (const [model, t] of Object.entries(u.llm)) {
    const perM = llmPrice(model);
    const detail = `${calls(t.calls)}, ${mTok(t.tokensIn)} in / ${mTok(t.tokensOut)} out tokens`;
    const usd = perM == null ? null : (t.tokensIn + t.tokensOut) / 1e6 * perM;
    if (usd == null) unpriced.push(`${model} (${calls(t.calls)})`);
    lines.push({ item: `LLM ${model}`, detail, usd, ...(t.estimated ? { estimated: true } : {}) });
  }
  if (u.tavilyCalls || u.tavilyCredits) lines.push({ item: 'Tavily', detail: `${calls(u.tavilyCalls)}, ${n(u.tavilyCredits)} credits`, usd: u.tavilyCredits * PRICES.tavilyCredit });
  if (u.braveCalls) lines.push({ item: 'Brave', detail: calls(u.braveCalls), usd: u.braveCalls * PRICES.braveCall });
  if (u.exaCalls) {
    const listed = Math.max(0, u.exaCalls - u.exaReported);
    lines.push({ item: 'Exa', detail: calls(u.exaCalls), usd: u.exaDollars + listed * PRICES.exaSearch });
  }
  if (u.mapsCalls) lines.push({ item: 'Google Maps (scraper.tech)', detail: calls(u.mapsCalls), usd: u.mapsCalls * PRICES.mapsCall });
  if (u.httpCalls) lines.push({ item: 'Other web calls', detail: `${calls(u.httpCalls)}, free`, usd: 0 });
  return {
    usd: lines.reduce((s, l) => s + (l.usd ?? 0), 0),
    estimated: lines.some((l) => l.estimated),
    unpriced,
    lines,
  };
}

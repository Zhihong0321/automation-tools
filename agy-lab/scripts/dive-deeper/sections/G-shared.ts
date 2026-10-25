// G / shared — helpers for the "How AI sees you" lanes (G-fixed, G-free, G-grounded).
// Not a lane on its own: it has no run(). It holds the profile pulled from the dive,
// the ask-every-model loop, the judge prompt and the finding writer, so the lanes
// differ only in WHICH prompts they send.
//
// No kill gates: every LLM call goes through ctx.llm (never throws); a judge answer
// that will not parse is warned and kept as "unjudged", and the lane continues.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, type Ctx, type Finding } from '../lib.ts';

export const ANSWER_MODELS = (process.env.DD_G_MODELS ?? 'deepseek-v4.1-flash-1017,gpt-6.1-sol').split(',').map((s) => s.trim()).filter(Boolean);
export const JUDGE_MODEL = process.env.DD_G_JUDGE ?? 'gpt-6.1-sol';
/** Temperature of the ANSWER calls (the judge always runs at 0). Run once at 0 and once at 1 to see drift. */
export const ANSWER_TEMP = Number(process.env.DD_G_TEMP ?? 0);
/** Optional cap on prompts, for small test runs. */
export const MAX_PROMPTS = Number(process.env.DD_G_MAX ?? 0) || Infinity;

export type Profile = {
  name: string;          // legal name, e.g. Eternalgy Sdn Bhd
  brand: string;         // short brand, e.g. Eternalgy
  aliases: string[];
  trade: string;         // singular search phrase, e.g. "solar panel installer"
  trades: string;        // plural, e.g. "solar panel installers"
  job: string;           // what a customer wants done, e.g. "install solar panels on my house"
  area: string;          // HQ town, e.g. Johor Bahru
  state: string;         // e.g. Johor
  industry: string;
};

export type Prompt = { id: string; kind: 'company' | 'trade'; text: string; topic?: string; lang?: string };

export type Claim = { claim: string; verdict: 'correct' | 'wrong' | 'disputed' | 'unverifiable' | 'echo'; facts?: number[]; hedged?: boolean; note?: string };
export type Judged = {
  prompt: Prompt;
  model: string;
  answer: string;
  judged: boolean;
  mentions_company: boolean;
  declines: boolean;               // the answer says it has no information
  confused_with: string | null;    // talks about a different entity as if it were this one
  recommended: 'yes' | 'no' | 'neutral' | 'not_mentioned';
  claims: Claim[];
  competitors: string[];
  outcome: 'correct' | 'mixed' | 'wrong' | 'doesnt_know' | 'not_mentioned' | 'mentioned_no_facts' | 'unjudged';
  judge_summary: string;
  searched: boolean;               // the answer carries web-search citation markers (the model searched)
  stub?: boolean;                  // the answer is only "I'll check..." (a search preamble with no answer)
  dropped?: { claim: string; verdict: string; why: string }[];  // judge claims removed by the clean-up rules
};

const DECLINE_RE = /\b(could ?n[o'’]t|cannot|can[’']t|unable to|not able to|did not find|didn[’']t find)\b.*\b(verify|find|confirm|identify|provide|locate)|\bno (reliable|verified|public|specific|confirmed) (public )?(information|source|record|data)/i;
const ADVICE_RE = /\bshould\b|\b(needs?|has) to be (verified|confirmed|checked)|\bmust be (verified|confirmed|checked)|^(ask|verify|check|confirm)\b/i;
const ECHO_RE = /private limited|sendirian berhad|privately[- ]held|not (a )?public(ly)?[- ]listed|stands for/i;
const STUB_RE = /^(I['’]ll|I will|Let me) (check|search|look)/i;

/** Some router models (gpt-6.1-sol) run a web search on their own and leave citation markers. */
export const SEARCH_MARK = /turn\d+search\d+|<Cite\b|【\d+†|\bturn\d+(news|view|fetch)\d+|<Entity\b|<AsyncImage\b/i;

/** Per-model token tally. lib's meter only splits CALLS by model, so this taps fetch (read-only:
 *  it clones each chat/completions response and reads `usage`). Never throws. */
export const usage: Record<string, { calls: number; tokensIn: number; tokensOut: number }> = {};
let tapped = false;
export function tapUsage() {
  if (tapped) return;
  tapped = true;
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const res = await real(input, init);
    try {
      const url = String(typeof input === 'string' ? input : input?.url ?? input);
      if (url.endsWith('/chat/completions') && init?.body) {
        const model = JSON.parse(String(init.body)).model ?? '?';
        res.clone().json().then((b: any) => {
          const u = (usage[model] ??= { calls: 0, tokensIn: 0, tokensOut: 0 });
          u.calls++; u.tokensIn += Number(b?.usage?.prompt_tokens ?? 0); u.tokensOut += Number(b?.usage?.completion_tokens ?? 0);
        }).catch(() => { /* non-JSON error body: lib warns on it */ });
      }
    } catch { /* never break the real call */ }
    return res;
  }) as typeof fetch;
}

/** gpt-6.1-sol answers in a chat-app markup (<box>, <Entity value=...>, <Cite refs=...>) and once
 *  looped into a 700k-char answer. The judge sees a cleaned copy: markup stripped, repeated
 *  sentences dropped, and at most JUDGE_CHARS characters (input shaping, not a cap on the model). */
export const JUDGE_CHARS = Number(process.env.DD_G_JUDGE_CHARS ?? 16000);
export function cleanAnswer(a: string): string {
  const t = a
    .replace(/<Entity\b[^>]*?value="([^"]*)"[^>]*\/?>/g, '$1')
    .replace(/<(Cite|AsyncImage)\b[^>]*\/>/g, ' ')
    .replace(/<\/?(box|row|text|title|badge|divider|col|grid|card|span|div)\b[^>]*>/gi, ' ')
    .replace(/[ \t]+/g, ' ');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of t.split(/(?<=[.!?])\s+|\n+/)) {
    const k = seg.trim().toLowerCase();
    if (k.length >= 30 && seen.has(k)) continue;
    seen.add(k);
    out.push(seg.trim());
  }
  return out.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Small promise pool so ~20 calls do not hit the router at once. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/** Name, trade and area from the dive. One LLM call at temperature 0, with a plain fallback. */
export async function profileOf(ctx: Ctx, dive: any): Promise<Profile> {
  tapUsage();
  // The template must be the SAME every run, but even at temperature 0 the profile call drifted
  // ("my house" / "my property" / "my house or business"). Reuse the profile of the last G run for
  // this dive (read-only from out/); DD_G_NEW_PROFILE=1 builds a fresh one.
  if (!process.env.DD_G_NEW_PROFILE) {
    for (const lane of ['fixed', 'free', 'grounded']) {
      try {
        const prev = JSON.parse(fs.readFileSync(path.join(OUT, `G-${lane}-${ctx.diveId}.json`), 'utf8'));
        if (prev.notes?.profile?.trade) { ctx.log(`profile reused from out/G-${lane}-${ctx.diveId}.json`); return prev.notes.profile; }
      } catch { /* none yet */ }
    }
  }
  const r = dive.result ?? {};
  const id = r.identity ?? {};
  const name = String(id.legal_name ?? dive.company);
  const aliases: string[] = (id.aliases ?? []).filter((a: string) => a && a !== name);
  const brand = aliases.find((a) => !/sdn|bhd|berhad|plt/i.test(a) && /^[\x20-\x7e]+$/.test(a)) ?? name.replace(/\s*(sdn\.?\s*bhd\.?|berhad|plt)\s*$/i, '').trim();
  const addr = String(id.address ?? '');
  const p = ctx.parseJson(await ctx.llm(
    `Company: ${name}. Industry: ${id.industry}. HQ address: ${addr}. Summary: ${id.summary}\n\n` +
    `Return JSON {"trade": "the 2-4 word phrase a customer would type to find this kind of company, singular, e.g. \\"solar panel installer\\"", ` +
    `"trades": "the same phrase in plural", "job": "what a household or business customer wants done, as the end of 'I want to ...', e.g. \\"install solar panels on my house\\"", ` +
    `"area": "the HQ city or town, e.g. Johor Bahru", "state": "the HQ state, e.g. Johor"}. JSON only.`,
    { temperature: 0 },
  ));
  if (!p?.trade) ctx.warn('profile: no trade from the LLM, using the industry words');
  const parts = addr.split(',').map((s) => s.trim());
  const fallbackArea = (parts.find((s) => /\d{5}/.test(s)) ?? parts[parts.length - 3] ?? 'Kuala Lumpur').replace(/\d{5}\s*/, '');
  const trade = p?.trade ?? String(id.industry ?? 'company').split(/[,(]/)[0].trim();
  return {
    name, brand, aliases,
    trade, trades: p?.trades ?? trade + 's', job: p?.job ?? `hire a ${trade}`,
    area: p?.area ?? fallbackArea, state: p?.state ?? parts[parts.length - 2] ?? '',
    industry: String(id.industry ?? ''),
  };
}

/** The dive as a numbered fact sheet for the judge. */
export function factSheet(dive: any): string {
  const r = dive.result ?? {};
  const id = r.identity ?? {};
  const facts = (r.facts ?? []).map((f: any, i: number) => `#${i} [${f.topic}, ${f.confidence}] ${f.fact}`).join('\n');
  return [
    `Legal name: ${id.legal_name}. Aliases: ${(id.aliases ?? []).join(', ')}.`,
    `Registration numbers: ${(id.registration_numbers ?? []).join(', ')}.`,
    `HQ address: ${id.address}.`,
    `Official domains: ${(id.official_domains ?? []).join(', ')}.`,
    `Industry: ${id.industry}. Summary: ${id.summary}`,
    '',
    'FACTS (numbered; cite these numbers):',
    facts,
    '',
    'KNOWN CONTRADICTIONS between sources (a claim matching either side is "disputed", not "wrong"):',
    ...(r.contradictions ?? []).map((c: string) => '- ' + c),
  ].join('\n');
}

const JUDGE_SYSTEM = 'You are a strict fact-checker. You compare what an AI assistant said about a company with a researched fact sheet. You answer with JSON only.';

/** One judge call: what does this answer claim about the company, and is each claim right? */
export async function judge(ctx: Ctx, profile: Profile, sheet: string, prompt: Prompt, model: string, answer: string): Promise<Judged> {
  const base: Judged = {
    prompt, model, answer, judged: false, mentions_company: false, declines: false, confused_with: null,
    recommended: 'not_mentioned', claims: [], competitors: [], outcome: 'unjudged', judge_summary: '', searched: SEARCH_MARK.test(answer),
  };
  if (!answer) { ctx.warn(`judge: empty answer from ${model} for ${prompt.id}`); return base; }
  const clean = cleanAnswer(answer);
  // A stub is an answer that is ONLY search narration ("I'll check...", "I'm checking..."), with nothing after it.
  const stub = STUB_RE.test(clean) && clean.split(/(?<=[.!?])\s*/).filter((x) => !/^(I['’]ll|I will|Let me|I['’]m (checking|starting|looking|searching|now))/i.test(x.trim())).join(' ').trim().length < 40;
  if (clean.length > JUDGE_CHARS) ctx.warn(`judge: ${model}/${prompt.id} answer is ${answer.length} chars (${clean.length} after clean-up); the judge reads the first ${JUDGE_CHARS}`);
  const names = [profile.name, profile.brand, ...profile.aliases].join(' / ');
  const raw = await ctx.llm(
    `THE COMPANY: ${names}\n\nFACT SHEET (researched from the web; treat as ground truth unless it lists a contradiction):\n${sheet}\n\n` +
    `---\nA customer asked an AI assistant:\n"${prompt.text}"\n\nThe assistant (${model}) answered:\n"""\n${clean.slice(0, JUDGE_CHARS)}\n"""\n---\n\n` +
    `Judge the answer ONLY for what it says about THE COMPANY. Return JSON:\n` +
    `{"mentions_company": true if the answer names THE COMPANY (any of its names) at all,\n` +
    ` "declines": true if the answer says it has no / limited / no specific information about THE COMPANY (or, for a question that does not name it, false),\n` +
    ` "confused_with": null, or the name of a DIFFERENT real or invented entity the answer describes as if it were THE COMPANY,\n` +
    ` "recommended": "yes" | "no" | "neutral" | "not_mentioned"  (does the answer steer the customer toward THE COMPANY?),\n` +
    ` "claims": [ every specific factual claim the answer makes about THE COMPANY: phone, address, website, founding date, owner, size, services, licences, reputation, reviews, prices, etc.\n` +
    `   {"claim": "short paraphrase", "verdict": "correct" | "wrong" | "disputed" | "unverifiable", "facts": [fact numbers that support or contradict it], "note": "why, one short sentence"} ],\n` +
    ` "competitors": [names of OTHER companies the answer names or recommends, exactly as written],\n` +
    ` "summary": "one sentence an owner of THE COMPANY would read, e.g. 'Says it does not know you and names A, B and C instead' or 'Gives a phone number that is not yours'"}\n\n` +
    `Rules: "correct" = the fact sheet supports it. "wrong" = the fact sheet contradicts it (a different phone, address, domain, founding year, business line or owner) ` +
    `or it is a specific detail that is clearly invented (a phone number, street address, founder name or year that appears nowhere in the sheet counts as wrong). ` +
    `"disputed" = it matches one side of a listed contradiction. "unverifiable" = the sheet neither supports nor contradicts it. ` +
    `"echo" = it only repeats what the customer's question already said (e.g. the town or trade named in the question) or what the name itself implies; echoes show no knowledge. For example "X Sdn Bhd is a Malaysian private limited company" is ALWAYS an echo, ` +
    `and "X is a solar installer in Johor Bahru" is an echo when the question said so. ` +
    `Statements about the assistant's own knowledge ("I could not verify", "there is little public information") are NOT claims: they set "declines" to true. ` +
    `Do NOT list general advice ("check reviews", "ask for quotes", "verify SEDA registration") as claims, and do not list claims about other companies. ` +
    `If the answer does not mention THE COMPANY, claims is []. JSON only.`,
    { model: JUDGE_MODEL, system: JUDGE_SYSTEM, temperature: 0 },
  );
  const j = ctx.parseJson(raw);
  if (!j || typeof j !== 'object') { ctx.warn(`judge: unparseable verdict for ${model}/${prompt.id}: ${raw.slice(0, 120)}`); return base; }
  const rawClaims: Claim[] = Array.isArray(j.claims) ? j.claims.filter((c: any) => c && c.claim).map((c: any) => ({
    claim: String(c.claim), verdict: (['correct', 'wrong', 'disputed', 'unverifiable', 'echo'].includes(c.verdict) ? c.verdict : 'unverifiable'), hedged: !!c.hedged,
    facts: Array.isArray(c.facts) ? c.facts.map(Number).filter((n: number) => Number.isFinite(n)) : [], note: c.note ? String(c.note) : undefined,
  })) : [];
  // Deterministic clean-up of what the judge model gets wrong most often (seen in testing):
  // advice listed as a claim, "I could not verify" listed as a wrong claim, and the
  // "Sdn Bhd = private limited company" echo counted as knowledge.
  const dropped: { claim: string; verdict: string; why: string }[] = [];
  let declines = !!j.declines;
  const claims: Claim[] = [];
  for (const c of rawClaims) {
    if (DECLINE_RE.test(c.claim)) { dropped.push({ claim: c.claim, verdict: c.verdict, why: 'decline, not a claim' }); declines = true; continue; }
    if (ADVICE_RE.test(c.claim)) { dropped.push({ claim: c.claim, verdict: c.verdict, why: 'advice, not a claim' }); continue; }
    if (ECHO_RE.test(c.claim) && c.verdict !== 'echo' && c.verdict !== 'wrong') { dropped.push({ claim: c.claim, verdict: c.verdict, why: 'echo of the name' }); claims.push({ ...c, verdict: 'echo' }); continue; }
    claims.push(c);
  }
  const mentions = !!j.mentions_company;
  const right = claims.filter((c) => c.verdict === 'correct' || c.verdict === 'disputed').length;
  const wrong = claims.filter((c) => c.verdict === 'wrong').length;
  const outcome: Judged['outcome'] =
    !mentions ? (prompt.kind === 'trade' ? 'not_mentioned' : (j.declines ? 'doesnt_know' : 'not_mentioned'))
    : wrong && right ? 'mixed' : wrong ? 'wrong' : right ? 'correct' : declines ? 'doesnt_know' : 'mentioned_no_facts';
  if (stub) ctx.warn(`${model} gave only a preamble for ${prompt.id} ("${answer.slice(0, 60)}…"): it started a web search and never answered`);
  return {
    ...base, judged: true, mentions_company: mentions, declines, dropped, stub,
    confused_with: j.confused_with ? String(j.confused_with) : null,
    recommended: (['yes', 'no', 'neutral', 'not_mentioned'].includes(j.recommended) ? j.recommended : (mentions ? 'neutral' : 'not_mentioned')),
    claims, competitors: Array.isArray(j.competitors) ? j.competitors.map(String) : [], outcome, judge_summary: String(j.summary ?? ''),
  };
}

/** Ask every model every prompt, then judge every answer. */
export async function askAndJudge(ctx: Ctx, dive: any, profile: Profile, prompts: Prompt[], opts: { context?: (p: Prompt) => string; system?: string } = {}): Promise<Judged[]> {
  const sheet = factSheet(dive);
  const jobs = prompts.flatMap((p) => ANSWER_MODELS.map((m) => ({ p, m })));
  ctx.log(`asking ${prompts.length} prompts x ${ANSWER_MODELS.length} models at temperature ${ANSWER_TEMP}; judge ${JUDGE_MODEL}`);
  return pool(jobs, 4, async ({ p, m }) => {
    const text = opts.context ? opts.context(p) + p.text : p.text;
    const answer = await ctx.llm(text, { model: m, temperature: ANSWER_TEMP, ...(opts.system ? { system: opts.system } : {}) });
    const j = await judge(ctx, profile, sheet, p, m, answer);
    ctx.log(`${p.id} ${m}: ${j.outcome}${j.competitors.length ? ' | names ' + j.competitors.slice(0, 4).join(', ') : ''}`);
    return j;
  });
}

const short = (m: string) => m.replace(/-flash-1017$/, '-flash').replace(/^gpt-/, 'gpt-');
const quote = (s: string, n = 220) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const claimList = (cs: Claim[]) => cs.map((c) => `"${c.claim}" (${c.verdict}${c.hedged ? ', hedged' : ''}${c.facts?.length ? ', fact ' + c.facts.join('/') : ''}${c.note ? ': ' + c.note : ''})`).join('; ');

/** Owner-facing findings from the judged answers. One per prompt when the models agree, else one per model. */
export function findingsFrom(ctx: Ctx, profile: Profile, judged: Judged[], prompts: Prompt[]): Finding[] {
  const findings: Finding[] = [];
  const at = ctx.now();
  const models = [...new Set(judged.map((j) => j.model))];
  const both = models.map(short).join(' nor ');
  for (const p of prompts) {
    const js = judged.filter((j) => j.prompt.id === p.id);
    if (!js.length) continue;
    const q = `"${quote(p.text, 120)}"`;
    if (p.kind === 'trade') {
      const named = js.filter((j) => j.mentions_company);
      const comp = [...new Set(js.flatMap((j) => j.competitors))];
      if (!named.length) {
        findings.push({ title: `Neither ${both} names you when asked ${q}`, detail: `Companies they name instead: ${comp.slice(0, 12).join(', ') || 'none (generic advice only)'}.` + js.map((j) => ` ${short(j.model)}: ${j.competitors.join(', ') || 'no company named'}.`).join(''), severity: 'high', source: null, checked_at: at, prompt: p.text, kind: p.kind, outcome: 'not_mentioned', models: js.map((j) => j.model), competitors: comp });
      } else {
        for (const j of js) findings.push({ title: j.mentions_company ? `${short(j.model)} names you when asked ${q}` : `${short(j.model)} does not name you when asked ${q}`, detail: `${j.judge_summary} Recommended: ${j.recommended}. Others named: ${j.competitors.join(', ') || 'none'}.${j.claims.length ? ' Claims about you: ' + claimList(j.claims) : ''}`, severity: j.mentions_company ? (j.claims.some((c) => c.verdict === 'wrong') ? 'medium' : 'info') : 'high', source: null, checked_at: at, prompt: p.text, kind: p.kind, outcome: j.outcome, model: j.model, competitors: j.competitors, evidence: quote(j.answer, 400) });
      }
      continue;
    }
    // Company question: merge when every model simply does not know / does not mention.
    if (js.every((j) => (j.outcome === 'doesnt_know' || j.outcome === 'not_mentioned') && !j.claims.some((c) => c.verdict !== 'echo') && !j.confused_with)) {
      findings.push({ title: `Neither ${both} knows anything about you for ${q}`, detail: `Both say they have no information about ${profile.name}.` + js.map((j) => ` ${short(j.model)}: "${quote(j.answer, 160)}"`).join(''), severity: 'medium', source: null, checked_at: at, prompt: p.text, kind: p.kind, outcome: 'doesnt_know', models: js.map((j) => j.model) });
      continue;
    }
    for (const j of js) {
      const wrong = j.claims.filter((c) => c.verdict === 'wrong');
      const right = j.claims.filter((c) => c.verdict === 'correct' || c.verdict === 'disputed');
      let title: string;
      let sev: Finding['severity'];
      if (j.outcome === 'unjudged') { title = `${short(j.model)}: answer to ${q} could not be judged`; sev = 'info'; }
      else if (j.confused_with) { title = `${short(j.model)} mistakes you for ${j.confused_with} when asked ${q}`; sev = 'high'; }
      else if (wrong.length) { title = `${short(j.model)}, asked ${q}: ${wrong.length} wrong claim${wrong.length > 1 ? 's' : ''} about you. ${j.judge_summary}`; sev = 'high'; }
      else if (right.length) { title = `${short(j.model)}, asked ${q}: ${right.length} right claim${right.length > 1 ? 's' : ''}, none wrong. ${j.judge_summary}`; sev = 'info'; }
      else if (j.outcome === 'doesnt_know' || j.outcome === 'not_mentioned') { title = `${short(j.model)} does not know the answer to ${q}. ${j.judge_summary}`; sev = 'medium'; }
      else { title = `${short(j.model)}, asked ${q}: nothing checkable about you. ${j.judge_summary}`; sev = 'low'; }
      if (j.recommended !== 'not_mentioned' && (!p.topic || p.id === 'reliable')) title += ` (Recommends you: ${j.recommended}.)`;
      findings.push({ title, detail: `${j.claims.length ? 'Claims: ' + claimList(j.claims) : 'No claims about you.'}${j.searched ? ' (The model ran its own web search for this answer.)' : ''}`, severity: sev, source: null, checked_at: at, prompt: p.text, kind: p.kind, outcome: j.outcome, model: j.model, evidence: quote(j.answer, 400) });
    }
  }
  // Roll-up: how much does each model know?
  for (const m of models) {
    const js = judged.filter((j) => j.model === m);
    const co = js.filter((j) => j.prompt.kind === 'company');
    const tr = js.filter((j) => j.prompt.kind === 'trade');
    const nRight = js.reduce((a, j) => a + j.claims.filter((c) => c.verdict === 'correct' || c.verdict === 'disputed').length, 0);
    const nWrong = js.reduce((a, j) => a + j.claims.filter((c) => c.verdict === 'wrong').length, 0);
    const dk = co.filter((j) => j.outcome === 'doesnt_know' || j.outcome === 'not_mentioned').length;
    findings.push({
      title: `${short(m)} overall: ${nRight} right and ${nWrong} wrong claims about you; "don't know" on ${dk} of ${co.length} questions about you; names you in ${tr.filter((j) => j.mentions_company).length} of ${tr.length} trade questions`,
      detail: `Outcomes: ${js.map((j) => `${j.prompt.id}=${j.outcome}${j.searched ? '(searched)' : ''}`).join(', ')}. ${js.filter((j) => j.searched).length} of ${js.length} answers show web-search citations (those reflect a live search, not training data).`, severity: nWrong ? 'high' : 'medium', source: null, checked_at: at, model: m, kind: 'rollup',
    });
  }
  // Who AI names instead of you: competitor counts over every trade answer.
  const tradeJs = judged.filter((j) => j.prompt.kind === 'trade' && j.judged);
  if (tradeJs.length) {
    const key = (n: string) => n.toLowerCase().replace(/\(.*?\)|sdn\.?\s*bhd\.?|berhad|holdings|group|energy|solar|systems?|\bplt\b|\/.*$/g, '').replace(/[^a-z0-9]+/g, '').trim() || n.toLowerCase();
    const tally = new Map<string, { name: string; n: number; models: Set<string> }>();
    for (const j of tradeJs) for (const c of new Set(j.competitors.map(key))) {
      const name = j.competitors.find((x) => key(x) === c)!;
      const t = tally.get(c) ?? { name, n: 0, models: new Set() };
      t.n++; t.models.add(short(j.model)); tally.set(c, t);
    }
    const top = [...tally.values()].sort((a, b) => b.n - a.n).slice(0, 8);
    const you = tradeJs.filter((j) => j.mentions_company).length;
    findings.push({
      title: `When customers ask AI for a ${profile.trade} without naming you, AI names you in ${you} of ${tradeJs.length} answers; it names ${top.slice(0, 3).map((t) => t.name).join(', ')} most`,
      detail: `Names that come up across ${tradeJs.length} trade answers: ${top.map((t) => `${t.name} ${t.n}x (${[...t.models].join('+')})`).join('; ') || 'none'}.`,
      severity: you ? 'medium' : 'high', source: null, checked_at: at, kind: 'rollup', competitors: top.map((t) => ({ name: t.name, count: t.n })),
    });
  }
  return findings;
}

/** Compact per-answer signature, for comparing two runs. */
export function signatures(judged: Judged[]) {
  return judged.map((j) => ({
    id: j.prompt.id, model: j.model, outcome: j.outcome, searched: j.searched, mentions: j.mentions_company, declines: j.declines, confused_with: j.confused_with,
    claims: j.claims.map((c) => `${c.verdict}${c.hedged ? '~' : ''}: ${c.claim}`), competitors: j.competitors, answer_chars: j.answer.length,
  }));
}

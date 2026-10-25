// G / fixed — how AI sees you, with a FIXED question set.
// Eleven questions from one template, filled with the dive's name, trade and area, so the
// same set can be asked of every company, every month. Asked of every model in
// G-shared ANSWER_MODELS (deepseek-v4.1-flash-1017 and gpt-6.1-sol), then a judge call
// scores each answer against the dive's facts.
//
// Calls: 1 (profile) + 11 x 2 answers + 11 x 2 judge = 45 LLM calls. No Exa.
// Env: DD_G_TEMP (answer temperature, default 0), DD_G_MAX (only the first N questions),
//      DD_G_MODELS, DD_G_JUDGE.
// Limit: the models on our keys have no web access; answers reflect training data only.
import type { Ctx, Finding } from '../lib.ts';
import { ANSWER_MODELS, ANSWER_TEMP, JUDGE_MODEL, MAX_PROMPTS, usage, askAndJudge, findingsFrom, profileOf, signatures, type Profile, type Prompt } from './G-shared.ts';

export function fixedQuestions(p: Profile): Prompt[] {
  const all: Prompt[] = [
    { id: 'what', kind: 'company', topic: 'identity', text: `What is ${p.name}?` },
    { id: 'reliable', kind: 'company', topic: 'reputation', text: `Is ${p.name} in ${p.area} a reliable ${p.trade}? Would you recommend them?` },
    { id: 'phone', kind: 'company', topic: 'contact', text: `What is the phone number of ${p.name}?` },
    { id: 'website', kind: 'company', topic: 'contact', text: `What is the official website of ${p.name}?` },
    { id: 'address', kind: 'company', topic: 'footprint', text: `Where is the office of ${p.name}? Please give the address.` },
    { id: 'founded', kind: 'company', topic: 'identity', text: `When was ${p.name} founded, and who owns or runs it?` },
    { id: 'services', kind: 'company', topic: 'products_services', text: `What products and services does ${p.name} offer?` },
    { id: 'licences', kind: 'company', topic: 'credentials', text: `What licences, registrations or certifications does ${p.name} hold?` },
    { id: 'complaints', kind: 'company', topic: 'risks', text: `Has ${p.name} had any complaints, scams or legal problems?` },
    { id: 'best', kind: 'trade', topic: 'findability', text: `Who are the best ${p.trades} in ${p.area}? Please name specific companies.` },
    { id: 'hire', kind: 'trade', topic: 'findability', text: `I live in ${p.area}, ${p.state} and I want to ${p.job}. Which companies should I contact?` },
  ];
  // Small test runs: keep a mix (first company questions, plus one trade question).
  if (MAX_PROMPTS >= all.length) return all;
  return [...all.filter((q) => q.kind === 'company').slice(0, Math.max(1, MAX_PROMPTS - 1)), all.find((q) => q.kind === 'trade')!];
}

export async function run(ctx: Ctx, dive: any): Promise<{ findings: Finding[]; notes: Record<string, unknown> }> {
  const profile = await profileOf(ctx, dive);
  ctx.log(`profile: ${profile.name} | ${profile.trade} | ${profile.area}, ${profile.state} | job: ${profile.job}`);
  const prompts = fixedQuestions(profile);
  const judged = await askAndJudge(ctx, dive, profile, prompts);
  const findings = findingsFrom(ctx, profile, judged, prompts);
  return {
    findings,
    notes: {
      profile, answer_temperature: ANSWER_TEMP, models: ANSWER_MODELS, judge: JUDGE_MODEL, usage_by_model: usage,
      prompts, signatures: signatures(judged),
      answers: judged.map((j) => ({ id: j.prompt.id, model: j.model, outcome: j.outcome, searched: j.searched, stub: j.stub, answer: j.answer, claims: j.claims, dropped: j.dropped, competitors: j.competitors, confused_with: j.confused_with, recommended: j.recommended, judge_summary: j.judge_summary })),
      limit: 'deepseek answers from training data only; gpt-6.1-sol sometimes runs its own web search (see searched), so its answers can reflect the live web.',
    },
  };
}

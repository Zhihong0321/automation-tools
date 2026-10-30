import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRICES, addMeter, diveUsage, emptyUsage, price } from './cost.ts';

test('a company-dive is priced from its tokens, Tavily credits, Brave and Exa calls', () => {
  const cost = price(diveUsage({
    tavily_calls: 10, tavily_credits: 15, brave_calls: 8,
    llm: [{ step: 'triage', engine: 'deepseek-v4.1-flash-1017', ms: 1, promptChars: 0, answerChars: 0, tokensIn: 600_000, tokensOut: 400_000 }],
    people_exa: [{ dollars: 0.01, ok: true }, { dollars: 0, ok: false }],
  }));
  const deepseek = 100 / 1000 / 7.2;
  const want = deepseek + 15 * PRICES.tavilyCredit + 8 * PRICES.braveCall + 0.01 + PRICES.exaSearch;
  assert.ok(Math.abs(cost.usd - want) < 1e-9, `${cost.usd} vs ${want}`);
  assert.equal(cost.estimated, false);
  assert.deepEqual(cost.unpriced, []);
});

test('calls without reported tokens are estimated from text length and marked', () => {
  const cost = price(diveUsage({ llm: [{ step: 'dossier', engine: 'deepseek-v4.1-flash-1017', ms: 1, promptChars: 4000, answerChars: 400 }] }));
  assert.equal(cost.estimated, true);
  assert.match(cost.lines[0].detail, /1\.0k in \/ 100 out/);
});

test('a model with no price is counted and named, not guessed', () => {
  const cost = price(diveUsage({ llm: [{ step: 'x', engine: 'pi/MiniMax-M2', ms: 1, promptChars: 10, answerChars: 10, tokensIn: 5, tokensOut: 5 }] }));
  assert.equal(cost.usd, 0);
  assert.deepEqual(cost.unpriced, ['pi/MiniMax-M2 (1 call)']);
  assert.equal(cost.lines[0].usd, null);
});

test('deeper-dive meters add up, old ones split tokens by calls', () => {
  const u = emptyUsage();
  addMeter(u, { llm: { calls: 2, failed: 0, promptChars: 0, answerChars: 0, tokensIn: 100, tokensOut: 50, byModel: { 'deepseek-a': 2 }, byModelTokens: { 'deepseek-a': { in: 100, out: 50 } } },
    maps: { calls: 3, failed: 0, byTool: {} }, exa: { calls: 2, failed: 0, results: 0, priced: 1, dollars: 0.02 }, brave: { calls: 1, failed: 0 }, http: { calls: 4, failed: 0 } });
  addMeter(u, { llm: { calls: 4, tokensIn: 400, tokensOut: 0, byModel: { 'deepseek-a': 3, 'gpt-x': 1 } } as any });
  assert.deepEqual(u.llm['deepseek-a'], { calls: 5, tokensIn: 400, tokensOut: 50, estimated: true });
  assert.deepEqual(u.llm['gpt-x'], { calls: 1, tokensIn: 100, tokensOut: 0, estimated: true });
  const cost = price(u);
  assert.ok(Math.abs(cost.lines.find((l) => l.item === 'Exa')!.usd! - (0.02 + PRICES.exaSearch)) < 1e-12);
  assert.deepEqual(cost.unpriced, ['gpt-x (1 call)']);
});

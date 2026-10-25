import test from 'node:test';
import assert from 'node:assert/strict';
import { shortName, urlKey, Ledger, corpus, parseJson, stripThinking, Budget, BudgetSpent, budgetedCall, streamChat } from './companydive.ts';

test('shortName drops Malaysian and common company suffixes', () => {
  assert.equal(shortName('Eternalgy Sdn Bhd'), 'Eternalgy');
  assert.equal(shortName('ETERNALGY SDN. BHD.'), 'ETERNALGY');
  assert.equal(shortName('Acme Holdings Berhad'), 'Acme Holdings');
  assert.equal(shortName('Foo Pte. Ltd.'), 'Foo');
});

test('urlKey folds www, trailing slash, fragments and tracking params', () => {
  assert.equal(urlKey('https://www.Eternalgy.me/about/?utm_source=x#top'), 'eternalgy.me/about');
  assert.equal(urlKey('https://eternalgy.me/about'), 'eternalgy.me/about');
  assert.equal(urlKey('https://eternalgy.me/faq?format=md'), 'eternalgy.me/faq?format=md');
});

test('ledger dedupes URLs and keeps page text over chunks', () => {
  const l = new Ledger();
  const a = l.add('https://www.x.com/a/', 'A', ['s1'], 'brave:exact');
  const b = l.add('https://x.com/a', '', ['s2'], 'tavily:T1');
  assert.equal(a, b);
  assert.deepEqual(a.found, ['brave:exact', 'tavily:T1']);
  l.setContent(a, 'full page', 'page');
  l.setContent(a, 'chunk', 'chunks');
  assert.equal(a.content, 'full page');
  assert.equal(a.contentKind, 'page');
});

test('corpus puts page text first and respects the size cap', () => {
  const l = new Ledger();
  l.add('https://a.com', 'snip', ['only a snippet'], 'b');
  const p = l.add('https://b.com', 'page', [], 'b');
  l.setContent(p, 'x'.repeat(100), 'page');
  const out = corpus(l.sources, 10_000);
  assert.ok(out.indexOf('[2]') < out.indexOf('[1]'));
  assert.ok(corpus(l.sources, 50).length <= 50);
});

test('parseJson finds the object inside fences and prose', () => {
  assert.deepEqual(parseJson('Sure:\n```json\n{"a": [1, "}"]}\n```'), { a: [1, '}'] });
  assert.deepEqual(parseJson('here {"b": {"c": 2}} trailing'), { b: { c: 2 } });
  assert.equal(stripThinking('<think>hmm</think> {"x":1}'), '{"x":1}');
});

test('Budget refuses the call past the cap and does not count a quota refusal', async () => {
  const budget = new Budget(2);
  const ok = (async () => ({ results: [], usage: { credits: 2 } })) as any;
  const quota = (async () => { throw Object.assign(new Error('every Tavily key is out of credits'), { code: 'quota' }); }) as any;
  await assert.rejects(budgetedCall(budget, 'search', { query: 'q' }, 'refused', quota));
  assert.equal(budget.used, 0);
  await budgetedCall(budget, 'search', { query: 'q' }, 'one', ok);
  await budgetedCall(budget, 'search', { query: 'q' }, 'two', ok);
  assert.equal(budget.used, 2);
  assert.equal(budget.credits, 4);
  await assert.rejects(budgetedCall(budget, 'search', { query: 'q' }, 'three', ok), BudgetSpent);
});

test('streamChat joins content deltas, drops reasoning, and sends no max_tokens', async () => {
  process.env.CONTACT_LLM_URL = 'https://llm.test/v1';
  process.env.CONTACT_LLM_KEY = 'k';
  process.env.CONTACT_LLM_MODEL = 'deepseek-v4.1-flash-1017';
  let sent: Record<string, unknown> = {};
  const sse = [
    'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}',
    'data: {"choices":[{"delta":{"content":"{\\"ok\\""}}]}',
    ': keep-alive',
    'data: {"choices":[{"delta":{"content":": true}"}}]}',
    'data: [DONE]',
    '',
  ].join('\n');
  const fake = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    // Split mid-line to prove partial chunks are reassembled.
    const bytes = new TextEncoder().encode(sse);
    const body = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 40)); c.enqueue(bytes.slice(40)); c.close(); } });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  assert.equal(await streamChat('hi', fake), '{"ok": true}');
  assert.equal(sent.stream, true);
  assert.equal('max_tokens' in sent, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ask, config, pool, resetForTests } from './extract-llm.ts';

const cfg = { url: 'https://llm.example/v1', key: 'k', model: 'deepseek-v4.1-flash-1017' };
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('config needs all three variables', () => {
  assert.equal(config({}), null);
  assert.equal(config({ CONTACT_LLM_URL: 'https://llm.example/v1/', CONTACT_LLM_KEY: 'k' }), null);
  assert.deepEqual(config({ CONTACT_LLM_URL: 'https://llm.example/v1/', CONTACT_LLM_KEY: ' k ', CONTACT_LLM_MODEL: 'deepseek-v4.1-flash-1017' }), cfg);
});

test('one chat call returns the answer', async () => {
  let sent: Record<string, unknown> = {};
  const fetchImpl = (async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://llm.example/v1/chat/completions');
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: ' {"people":[]} ' } }] }));
  }) as unknown as typeof fetch;
  const out = await ask('read this', { maxTokens: 8192 }, cfg, fetchImpl);
  assert.equal(out.answer, '{"people":[]}');
  assert.equal(sent.model, 'deepseek-v4.1-flash-1017');
  assert.equal(sent.max_tokens, 8192);
  assert.equal(sent.temperature, 0);
});

test('half an emoji left by a page cut is replaced, not sent', async () => {
  let body = '';
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    body = String(init.body);
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }));
  }) as unknown as typeof fetch;
  await ask('call us 📞'.slice(0, -1), {}, cfg, fetchImpl);
  assert.doesNotMatch(body, /\\ud83d/i);
  assert.equal(JSON.parse(body).messages[0].content, 'call us �');
});

test('failures carry the codes the extract retry and lane cooldown read', async () => {
  const code = async (fetchImpl: typeof fetch) => {
    try { await ask('x', { maxTokens: 10 }, cfg, fetchImpl); return 'ok'; } catch (e) { return (e as { code?: string }).code; }
  };
  assert.equal(await code(reply(429, { error: 'slow down' })), 'rate_limit');
  assert.equal(await code(reply(500, { error: 'down' })), 'failed');
  assert.equal(await code(reply(200, { choices: [{ finish_reason: 'length', message: { content: '' } }] })), 'length');
  assert.equal(await code(reply(200, { choices: [{ finish_reason: 'stop', message: { content: '' } }] })), 'empty');
  assert.equal(await code((async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }) as unknown as typeof fetch), 'timeout');
  assert.equal(await ask('x', {}, null).catch((e) => e.code), 'not_configured');
});

test('Hive keys join the pool after Vectide, on the deepseek model', () => {
  const env = { CONTACT_LLM_URL: 'https://llm.example/v1', CONTACT_LLM_KEY: 'k', CONTACT_LLM_MODEL: 'deepseek-v4.1-flash-1017', CONTACT_LLM_HIVE_KEYS: ' h1, h2 ,,h3' };
  assert.deepEqual(pool(env).map((c) => [c.url, c.key, c.model]), [
    ['https://llm.example/v1', 'k', 'deepseek-v4.1-flash-1017'],
    ['https://api.thehive.ai/api/v3', 'h1', 'deepseek-ai/deepseek-v4.1-flash-1017'],
    ['https://api.thehive.ai/api/v3', 'h2', 'deepseek-ai/deepseek-v4.1-flash-1017'],
    ['https://api.thehive.ai/api/v3', 'h3', 'deepseek-ai/deepseek-v4.1-flash-1017'],
  ]);
  assert.equal(config({ CONTACT_LLM_HIVE_KEYS: 'h1' })?.key, 'h1');
});

test('calls take turns, and a 429 moves the call to the next provider', async () => {
  resetForTests();
  const providers = ['a', 'b', 'c'].map((key) => ({ url: 'https://llm.example/v1', key, model: 'm' }));
  const seen: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const key = String((init.headers as Record<string, string>).authorization).slice(7);
    seen.push(key);
    if (key === 'a') return new Response('busy', { status: 429 });
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: key } }] }));
  }) as unknown as typeof fetch;
  assert.equal((await ask('x', {}, providers, fetchImpl)).answer, 'b');
  assert.equal((await ask('x', {}, providers, fetchImpl)).answer, 'b');
  assert.equal((await ask('x', {}, providers, fetchImpl)).answer, 'c');
  assert.equal((await ask('x', {}, providers, fetchImpl)).answer, 'b', 'a rests after its 429');
  assert.deepEqual(seen, ['a', 'b', 'b', 'c', 'b']);
});

test('an empty answer moves the call on without resting the provider', async () => {
  resetForTests();
  const providers = ['a', 'b'].map((key) => ({ url: 'https://llm.example/v1', key, model: 'm' }));
  const seen: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const key = String((init.headers as Record<string, string>).authorization).slice(7);
    seen.push(key);
    const content = key === 'a' && seen.length === 1 ? '' : key;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }));
  }) as unknown as typeof fetch;
  assert.equal((await ask('x', {}, providers, fetchImpl)).answer, 'b');
  assert.equal((await ask('x', {}, providers, fetchImpl)).answer, 'b');
  assert.equal((await ask('x', {}, providers, fetchImpl)).answer, 'a', 'a was not rested');
  assert.deepEqual(seen, ['a', 'b', 'b', 'a']);
  const all = providers.map((p) => ({ ...p }));
  const empty = (async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '' } }] }))) as unknown as typeof fetch;
  assert.equal(await ask('x', {}, all, empty).catch((e) => e.code), 'empty', 'every provider empty still reports empty');
});

test('a lane marked first takes every call; the others rotate behind it', async () => {
  resetForTests();
  const lanes = [
    { url: 'https://a.example/v1', key: 'a', model: 'm' },
    { url: 'https://p.example/v1', key: 'p', model: 'm', first: true },
    { url: 'https://b.example/v1', key: 'b', model: 'm' },
  ];
  const hits: string[] = [];
  let busy = false;
  const fetchImpl = (async (url: string) => {
    hits.push(new URL(url).host[0]!);
    if (busy && url.startsWith('https://p.')) return new Response('{}', { status: 429 });
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }));
  }) as unknown as typeof fetch;
  for (let i = 0; i < 3; i++) await ask('x', {}, lanes, fetchImpl);
  assert.deepEqual(hits, ['p', 'p', 'p']);
  hits.length = 0;
  busy = true;
  await ask('x', {}, lanes, fetchImpl);
  await ask('x', {}, lanes, fetchImpl);
  // The first lane answered 429 and rests; the next calls rotate over the others.
  assert.equal(hits[0], 'p');
  assert.deepEqual(hits.slice(1).sort(), ['a', 'b']);
});

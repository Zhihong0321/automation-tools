import test from 'node:test';
import assert from 'node:assert/strict';
import { ask, config } from './extract-llm.ts';

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

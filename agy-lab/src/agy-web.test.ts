import test from 'node:test';
import assert from 'node:assert/strict';
import { ask, configured } from './agy-web.ts';

test('cloud contact runner preflights, sends sandboxed prompt, and returns the answer', async () => {
  const previousToken = process.env.AGY_WEB_TOKEN;
  const previousUrl = process.env.AGY_WEB_URL;
  const previousModel = process.env.AGY_WEB_MODEL;
  const previousFetch = globalThis.fetch;
  const calls: Array<{ path: string; body: Record<string, unknown>; authorization: string }> = [];
  process.env.AGY_WEB_TOKEN = 'test-token';
  process.env.AGY_WEB_URL = 'https://agy.example.test';
  process.env.AGY_WEB_MODEL = 'gemini-3.8-flash-medium';
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, body: JSON.parse(String(init?.body)), authorization: new Headers(init?.headers).get('authorization') ?? '' });
    return Response.json(path === '/api/prompt'
      ? { ok: true, answer: '```json\n{"decision_makers":[]}\n```', ms: 42 }
      : { ok: true });
  };
  try {
    assert.equal(configured(), true);
    assert.match((await ask('Find company contacts', 60_000)).answer, /decision_makers/);
    assert.deepEqual(calls.map((call) => call.path), ['/api/ensure-active', '/api/prompt']);
    assert.equal(calls[1]?.authorization, 'Bearer test-token');
    assert.equal(calls[1]?.body.prompt, 'Find company contacts');
    assert.equal(calls[1]?.body.tools, true);
    assert.equal(calls[1]?.body.model, 'gemini-3.8-flash-medium');
    assert.equal(calls[1]?.body.sandbox, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.AGY_WEB_TOKEN; else process.env.AGY_WEB_TOKEN = previousToken;
    if (previousUrl === undefined) delete process.env.AGY_WEB_URL; else process.env.AGY_WEB_URL = previousUrl;
    if (previousModel === undefined) delete process.env.AGY_WEB_MODEL; else process.env.AGY_WEB_MODEL = previousModel;
  }
});

test('cloud contact runner rotates and retries once after account auth failure', async () => {
  const previousToken = process.env.AGY_WEB_TOKEN;
  const previousFetch = globalThis.fetch;
  const paths: string[] = [];
  process.env.AGY_WEB_TOKEN = 'test-token';
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (path === '/api/prompt' && paths.filter((item) => item === path).length === 1) {
      return Response.json({ ok: false, auth_failure: true, error: 'account expired' });
    }
    return Response.json(path === '/api/prompt' ? { ok: true, answer: '{}' } : { ok: true });
  };
  try {
    assert.equal((await ask('Research', 60_000)).answer, '{}');
    assert.deepEqual(paths, ['/api/ensure-active', '/api/prompt', '/api/rotate', '/api/prompt']);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.AGY_WEB_TOKEN; else process.env.AGY_WEB_TOKEN = previousToken;
  }
});

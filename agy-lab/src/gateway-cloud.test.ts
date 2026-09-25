import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveModel } from './gateway.ts';

test('agy-web is a separate cloud model when the service token is configured', () => {
  const previous = process.env.AGY_WEB_TOKEN;
  process.env.AGY_WEB_TOKEN = 'test-token';
  try {
    assert.deepEqual(resolveModel('agy-web'), { engine: 'agy', model: 'agy-web', location: 'container', cloud: true });
  } finally {
    if (previous === undefined) delete process.env.AGY_WEB_TOKEN; else process.env.AGY_WEB_TOKEN = previous;
  }
});

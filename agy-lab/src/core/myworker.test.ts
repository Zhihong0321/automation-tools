import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage } from './myworker.ts';

test('identifies page-reading jobs to myworker', async () => {
  const previous = process.env.LOCAL_GMAP_WORKER_API_KEY;
  process.env.LOCAL_GMAP_WORKER_API_KEY = 'test-key';
  try {
    let request: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      request = init;
      return Response.json({ job: { status: 'done', result: { content: 'page' } } });
    };
    await fetchPage('https://example.com', { fetchImpl });
    const body = JSON.parse(String(request?.body));
    assert.equal(body.callerId, 'telemarketing');
    assert.equal(body.taskDescription, 'Read web page');
    assert.ok(body.taskDescription.length <= 50);
    assert.equal(body.url, 'https://example.com');
  } finally {
    if (previous === undefined) delete process.env.LOCAL_GMAP_WORKER_API_KEY;
    else process.env.LOCAL_GMAP_WORKER_API_KEY = previous;
  }
});

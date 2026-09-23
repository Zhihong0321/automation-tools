import test from 'node:test';
import assert from 'node:assert/strict';
import type http from 'node:http';
import { create, finish, handle, liveTypes, take } from './jobs.ts';

const ASK_TYPES = ['chatgpt.ask', 'meta.ask', 'agy.ask'];

/** POST /api/jobs/heartbeat exactly as worker/macmini.mjs sends it. */
async function heartbeat(worker: string, types: string[], version?: string): Promise<unknown> {
  let captured: unknown = null;
  const req = {
    method: 'POST', headers: {}, socket: { remoteAddress: '203.0.113.7' },
  } as unknown as http.IncomingMessage;
  const handled = await handle(req, {} as http.ServerResponse, new URL('http://lab/api/jobs/heartbeat'), {
    json: (_res, _status, body) => { captured = body; },
    readJson: async () => ({ worker, types, version }),
  });
  assert.equal(handled, true);
  return captured;
}

test('a beat registers a worker the table has never seen, types and all', async () => {
  // The redeploy case. Railway restarting empties the worker table while the
  // mini is mid-job, so the beat has to be able to introduce the lane from
  // nothing — re-registering the name alone would read as "serving nothing".
  assert.equal(liveTypes().includes('agy.ask'), false);
  await heartbeat('macmini-ask', ASK_TYPES);
  for (const type of ASK_TYPES) assert.equal(liveTypes().includes(type), true);
});

test('a beat keeps a busy lane live past the window that dropped it', async () => {
  await heartbeat('macmini-busy', ['gmap.scan']);
  await new Promise((r) => setTimeout(r, 25));
  // `withinMs` stands in for elapsed time: 10ms ago is the 90s cliff a lane used
  // to fall off while it was three minutes into an agy.ask it had claimed.
  assert.equal(liveTypes(10).includes('gmap.scan'), false, 'silence must still age a lane out');
  await heartbeat('macmini-busy', ['gmap.scan']);
  assert.equal(liveTypes(10).includes('gmap.scan'), true, 'a beat must refresh it');
});

test('a beat without a worker name is refused', async () => {
  let status = 0;
  const req = { method: 'POST', headers: {}, socket: {} } as unknown as http.IncomingMessage;
  await handle(req, {} as http.ServerResponse, new URL('http://lab/api/jobs/heartbeat'), {
    json: (_res, code) => { status = code; },
    readJson: async () => ({ types: ASK_TYPES }),
  });
  assert.equal(status, 400);
});

test('a targeted health job can only be claimed by its named lane', async () => {
  const job = create('worker.health', { recovery: true }, 45_000, 'health-target');
  assert.equal(await take('another-lane', { types: ['worker.health'], waitMs: 0 }), null);
  assert.equal((await take('health-target', { types: ['worker.health'], waitMs: 0 }))?.id, job.id);
  finish(job.id, true, { recovery: 'ok' }, null);
});

test('hub health check dispatches to a lane and reports its result', async () => {
  await heartbeat('health-route-test', ['worker.health', 'gmap.scan']);
  let response: Record<string, unknown> = {};
  const req = { method: 'POST', headers: {}, socket: {} } as unknown as http.IncomingMessage;
  const handling = handle(req, {} as http.ServerResponse, new URL('http://lab/api/jobs/health-check'), {
    json: (_res, _status, body) => { response = body as Record<string, unknown>; },
    readJson: async () => ({ waitMs: 1_000 }),
  });
  const job = await take('health-route-test', { types: ['worker.health'], waitMs: 1_000 });
  assert.equal(job?.targetWorker, 'health-route-test');
  assert.deepEqual(job?.payload, { recovery: true });
  finish(job!.id, true, { recovery: 'ok' }, null);
  await handling;
  const check = (response.workers as Array<Record<string, unknown>>).find((worker) => worker.worker === 'health-route-test');
  assert.equal(check?.status, 'done');
  assert.deepEqual(check?.result, { recovery: 'ok' });
});

test('hub pins main before dispatching an OTA job to each update coordinator', async () => {
  const old = 'a'.repeat(40);
  const target = 'b'.repeat(40);
  await heartbeat('ota-route-test', ['worker.update'], old);
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.WORKER_OTA_ADMIN_TOKEN;
  process.env.WORKER_OTA_ADMIN_TOKEN = 'test-admin-token-with-at-least-32-characters';
  globalThis.fetch = async () => Response.json({ object: { type: 'commit', sha: target } });
  try {
    let denied = 0;
    await handle({ method: 'POST', headers: { 'x-worker-update-token': 'wrong' }, socket: {} } as unknown as http.IncomingMessage,
      {} as http.ServerResponse, new URL('http://lab/api/jobs/update-workers'), {
        json: (_res, status) => { denied = status; },
        readJson: async () => ({}),
      });
    assert.equal(denied, 403);

    let response: Record<string, unknown> = {};
    const req = { method: 'POST', headers: { 'x-worker-update-token': process.env.WORKER_OTA_ADMIN_TOKEN }, socket: {} } as unknown as http.IncomingMessage;
    await handle(req, {} as http.ServerResponse, new URL('http://lab/api/jobs/update-workers'), {
      json: (_res, _status, body) => { response = body as Record<string, unknown>; },
      readJson: async () => ({}),
    });
    assert.equal(response.targetCommit, target);
    const check = (response.workers as Array<Record<string, unknown>>).find((worker) => worker.worker === 'ota-route-test');
    assert.equal(check?.status, 'pending');
    const job = await take('ota-route-test', { types: ['worker.update'], waitMs: 0 });
    assert.equal(job?.targetWorker, 'ota-route-test');
    assert.deepEqual(job?.payload, { commit: target });
    finish(job!.id, true, { status: 'updated' }, null);

    let rejected = 0;
    await handle({ method: 'POST', headers: {}, socket: {} } as unknown as http.IncomingMessage,
      {} as http.ServerResponse, new URL('http://lab/api/jobs'), {
        json: (_res, status) => { rejected = status; },
        readJson: async () => ({ type: 'worker.update', payload: { commit: target } }),
      });
    assert.equal(rejected, 403);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.WORKER_OTA_ADMIN_TOKEN;
    else process.env.WORKER_OTA_ADMIN_TOKEN = previousToken;
  }
});

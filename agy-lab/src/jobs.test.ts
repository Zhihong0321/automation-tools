import test from 'node:test';
import assert from 'node:assert/strict';
import type http from 'node:http';
import { coolDown, create, finish, get, handle, liveTypes, snapshot, take } from './jobs.ts';

const ASK_TYPES = ['chatgpt.ask', 'meta.ask', 'agy.ask'];

/** POST /api/jobs/heartbeat exactly as worker/macmini.mjs sends it. */
async function heartbeat(worker: string, types: string[]): Promise<unknown> {
  let captured: unknown = null;
  const req = {
    method: 'POST', headers: {}, socket: { remoteAddress: '203.0.113.7' },
  } as unknown as http.IncomingMessage;
  const handled = await handle(req, {} as http.ServerResponse, new URL('http://lab/api/jobs/heartbeat'), {
    json: (_res, _status, body) => { captured = body; },
    readJson: async () => ({ worker, types }),
  });
  assert.equal(handled, true);
  return captured;
}

test('an agy.ask lease follows the payload budget instead of the five-minute default', () => {
  const job = create('agy.ask', { prompt: 'research', timeoutMs: 1_200_000 }, 300_000);
  assert.equal(job.timeoutMs, 1_200_000);
});

test('sweep keeps a running agy job when the stored lease is five minutes and the payload is twenty', () => {
  const job = create('agy.ask', { prompt: 'research' }, 300_000);
  job.payload = { prompt: 'research', timeoutMs: 1_200_000 };
  job.status = 'running';
  job.startedAt = new Date(Date.now() - 6 * 60_000).toISOString();
  job.worker = 'pi';
  job.attempts = 1;
  const seen = get(job.id);
  assert.equal(seen?.status, 'running');
  assert.equal(seen?.timeoutMs, 1_200_000);
  assert.equal(seen?.attempts, 1);
});

test('a browser ask keeps its short lease when the payload budget is longer', () => {
  const job = create('chatgpt.ask', { prompt: 'audit', timeoutMs: 300_000 }, 120_000);
  assert.equal(job.timeoutMs, 120_000);
});

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

test('a quota result cools down every lane sharing the account and stops claims', async () => {
  const type = 'quota-test.ask';
  const group = 'quota-test:account';
  for (const worker of ['quota-test-1', 'quota-test-2']) {
    const req = { method: 'POST', headers: {}, socket: {} } as unknown as http.IncomingMessage;
    await handle(req, {} as http.ServerResponse, new URL('http://lab/api/jobs/heartbeat'), {
      json: () => {},
      readJson: async () => ({ worker, types: [type], cooldownGroup: group }),
    });
  }

  const first = create(type, {});
  assert.equal((await take('quota-test-1', { types: [type], waitMs: 0 }))?.id, first.id);
  const second = create(type, {});
  const waiting = take('quota-test-2', { types: ['quota-test.other'], waitMs: 5_000 });
  const req = { method: 'POST', headers: {}, socket: {} } as unknown as http.IncomingMessage;
  let result: Record<string, unknown> = {};
  await handle(req, {} as http.ServerResponse, new URL(`http://lab/api/jobs/${first.id}/result`), {
    json: (_res, _status, body) => { result = body as Record<string, unknown>; },
    readJson: async () => ({ worker: 'quota-test-1', ok: false,
      error: 'quota_reached: Individual quota reached. Resets in 1h37m47s.',
      errorCode: 'quota_reached', retryAfterMs: 5_825_000 }),
  });
  assert.equal((await waiting), null, 'an existing long poll must be released');
  assert.equal(typeof result.cooldownUntil, 'string');
  assert.equal(liveTypes().includes(type), false);
  assert.equal((await take('quota-test-2', { types: [type], waitMs: 0 })), null);
  assert.equal(second.status, 'pending');
  const lanes = snapshot().workers.filter((w) => w.name.startsWith('quota-test-'));
  assert.equal(lanes.length, 2);
  assert.ok(lanes.every((w) => w.cooldownUntil === result.cooldownUntil));
  finish(second.id, false, null, 'test cleanup');
});

test('a worker can claim pending work when its cooldown expires', async () => {
  const worker = 'quota-expiry';
  const type = 'quota-expiry.ask';
  await heartbeat(worker, [type]);
  const job = create(type, {});
  assert.ok(coolDown(worker, 20, 'test quota'));
  assert.equal((await take(worker, { types: [type], waitMs: 0 })), null);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await take(worker, { types: [type], waitMs: 0 }))?.id, job.id);
  finish(job.id, true, {}, null);
});

test('the snapshot joins a running job to the worker that claimed it', async () => {
  const worker = 'dashboard-join-worker';
  const type = 'dashboard-join.ask';
  await heartbeat(worker, [type]);
  const job = create(type, { keyword: 'solar', place: 'Johor' });
  assert.equal((await take(worker, { types: [type], waitMs: 0 }))?.id, job.id);

  const running = snapshot();
  const lane = running.workers.find((item) => item.name === worker);
  assert.ok(lane);
  assert.equal(lane.status, 'online');
  assert.equal(running.counts.running >= 1, true);

  // This is the exact join performed by workers.ts in the browser.
  const claimed = running.jobs.find((item) => item.status === 'running' && item.worker === worker);
  assert.equal(claimed?.id, job.id);
  assert.equal(claimed?.type, type);
  assert.equal(typeof claimed?.startedAt, 'string');
  assert.deepEqual(claimed?.payload, { keyword: 'solar', place: 'Johor' });

  finish(job.id, true, { found: 3 }, null);
  const finished = snapshot();
  assert.equal(finished.jobs.some((item) => item.status === 'running' && item.worker === worker), false);
  assert.equal(finished.jobs.find((item) => item.id === job.id)?.status, 'done');
  assert.equal(finished.workers.find((item) => item.name === worker)?.done, 1);
});

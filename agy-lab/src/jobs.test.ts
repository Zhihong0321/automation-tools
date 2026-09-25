import test from 'node:test';
import assert from 'node:assert/strict';
import type http from 'node:http';
import { activate, coolDown, create, finish, get, handle, liveTypes, quotaRetryAfterMs, snapshot, take, wait } from './jobs.ts';

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
  const type = 'agy.quota-test';
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
      errorCode: 'quota_reached', retryAfterMs: 5_872_000 }),
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

test('contact work stays running after its former lease and accepts a late answer', async () => {
  const job = create('research.contact', { name: 'Example' }, 1_000);
  assert.equal(job.timeoutMs, 0);
  assert.equal((await take('research-pc-1', { types: ['research.contact'], waitMs: 0 }))?.id, job.id);
  job.startedAt = new Date(Date.now() - 2_000).toISOString();
  assert.equal(get(job.id)?.status, 'running');
  assert.equal(job.attempts, 1);
  assert.equal(await take('research-pc-2', { types: ['research.contact'], waitMs: 0 }), null);
  finish(job.id, true, { decision_makers: [{ name: 'Late' }] }, null);
  assert.equal(job.status, 'done');
});

test('contact work is claimable only after its saved report has the job id', async () => {
  const job = create('research.contact', { name: 'Example' }, 1_000, false);
  assert.equal(await take('research-pc-1', { types: ['research.contact'], waitMs: 0 }), null);
  activate(job.id);
  assert.equal((await take('research-pc-1', { types: ['research.contact'], waitMs: 0 }))?.id, job.id);
  const settled = wait(job.id, 0);
  finish(job.id, true, {}, null);
  assert.equal((await settled)?.status, 'done');
});

test('old workers cannot claim contact work, while durable workers can', async () => {
  const job = create('research.contact', { name: 'Example' }, 0);
  const claim = async (protocol: string | null): Promise<string | null> => {
    let sent: Record<string, unknown> | null = null;
    const req = { method: 'GET', headers: {}, socket: { remoteAddress: '203.0.113.7' } } as unknown as http.IncomingMessage;
    const res = { writableEnded: false, on: () => {}, writeHead: () => {},
      end: () => { res.writableEnded = true; } } as unknown as http.ServerResponse;
    const url = new URL('http://lab/api/jobs/next?worker=research-pc&types=research.contact&wait=0');
    if (protocol) url.searchParams.set('contactProtocol', protocol);
    await handle(req, res, url, { json: (_res, _status, body) => { sent = body as Record<string, unknown>; }, readJson: async () => ({}) });
    return (sent?.job as { id: string } | undefined)?.id ?? null;
  };
  assert.equal(await claim(null), null);
  assert.equal(job.status, 'pending');
  assert.equal(await claim('durable-v1'), job.id);
  finish(job.id, true, {}, null);
});

test('a cooling worker heartbeat restores the visible deadline and blocks claims', async () => {
  const worker = 'quota-heartbeat-worker';
  const type = 'quota-heartbeat.ask';
  const until = new Date(Date.now() + 5_825_000).toISOString();
  let response: { worker?: { status?: string; cooldownUntil?: string } } = {};
  const req = { method: 'POST', headers: {}, socket: {} } as unknown as http.IncomingMessage;
  await handle(req, {} as http.ServerResponse, new URL('http://lab/api/jobs/heartbeat'), {
    json: (_res, _status, body) => { response = body as typeof response; },
    readJson: async () => ({ worker, types: [type], cooldownGroup: 'quota-heartbeat:agy',
      cooldownUntil: until, cooldownReason: 'Individual quota reached' }),
  });
  assert.ok(Math.abs(Date.parse(response.worker?.cooldownUntil ?? '') - Date.parse(until)) < 50);
  const visible = snapshot().workers.find((w) => w.name === worker);
  assert.equal(visible?.status, 'cooldown');
  assert.equal(visible?.cooldownReason, 'Individual quota reached');
  assert.ok((visible?.cooldownRemainingMs ?? 0) > 5_800_000);
  assert.equal(liveTypes().includes(type), false);
  assert.equal(await take(worker, { types: [type], waitMs: 0 }), null);
});

test('the broker recognizes the actual older Windows worker quota stack and cools both lanes', async () => {
  const error = 'Error: error: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 4h22m51s.\n    at ask (file:///E:/000/local-worker/agy.mjs:115:25)';
  assert.equal(quotaRetryAfterMs(error), 15_776_000);
  const type = 'agy.legacy-quota-test';
  await heartbeat('legacy-windows-agy1', [type]);
  await heartbeat('legacy-windows-agy2', [type]);
  const job = create(type, {});
  assert.equal((await take('legacy-windows-agy1', { types: [type], waitMs: 0 }))?.id, job.id);
  const req = { method: 'POST', headers: {}, socket: {} } as unknown as http.IncomingMessage;
  await handle(req, {} as http.ServerResponse, new URL(`http://lab/api/jobs/${job.id}/result`), {
    json: () => {},
    readJson: async () => ({ worker: 'legacy-windows-agy1', ok: false, error }),
  });
  const lanes = snapshot().workers.filter((w) => w.name.startsWith('legacy-windows-agy'));
  assert.equal(lanes.length, 2);
  assert.ok(lanes.every((w) => w.status === 'cooldown'));
  assert.ok(lanes.every((w) => (w.cooldownRemainingMs ?? 0) > 15_700_000));
  assert.equal(liveTypes().includes(type), false);
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

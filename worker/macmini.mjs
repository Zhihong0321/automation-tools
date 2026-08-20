#!/usr/bin/env node
// The home worker. Runs on the Mac mini; talks only outbound.
//
// WHY THIS EXISTS. The Google Maps scan has to come from a residential IP —
// Google answers a datacenter profile with a thinner result page rather than an
// error, so a scan run in the Railway container is quietly incomplete. The mini
// is on a home line and is always on. It has no public address, so it dials the
// lab rather than the lab dialling it.
//
// THE LOOP IS THE WHOLE PROGRAM:
//
//   GET /api/jobs/next?worker=…   held open ~25s
//     204  -> ask again immediately
//     200  -> run the handler, POST the result, ask again
//     err  -> wait (backing off to 60s), ask again — never exit
//
// A gmap.scan holds the loop for minutes while it runs; that is intended. One
// machine, one scan at a time, is what a residential line can do without
// looking like something other than a person.
//
// It never exits on purpose. A worker that quits on a network blip is a worker
// that is offline until someone notices, and the whole point of this machine is
// that nobody is watching it.
//
// Usage:
//   LAB_TOKEN=… node worker/macmini.mjs
// or put LAB_TOKEN in ~/.gmap-worker.env and just run it. See worker/README.md.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { scan as gmapScan } from './gmap.mjs';

// Config from a file the process owner can chmod 600, so the token is not in a
// launchd plist that every process on the box can read.
const ENV_FILE = process.env.WORKER_ENV_FILE ?? path.join(os.homedir(), '.gmap-worker.env');
if (fs.existsSync(ENV_FILE)) {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (err) {
    console.error('[worker] could not read ' + ENV_FILE + ': ' + err.message);
  }
}

const LAB = (process.env.LAB_URL ?? 'https://ee-auto.up.railway.app').replace(/\/+$/, '');
const TOKEN = (process.env.LAB_TOKEN ?? '').trim();
const NAME = (process.env.WORKER_NAME ?? os.hostname()).trim();
/** Empty = take any job. Set it once a second worker exists and they must not steal each other's work. */
const TYPES = (process.env.WORKER_TYPES ?? '').trim();
const WAIT_SEC = 25;

if (!TOKEN) {
  console.error('LAB_TOKEN is not set. Put it in ' + ENV_FILE + ' as LAB_TOKEN=… or pass it in the environment.');
  process.exit(1);
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const say = (msg) => console.log('[' + stamp() + '] ' + msg);

const auth = { authorization: 'Bearer ' + TOKEN };
const jsonHeaders = { ...auth, 'content-type': 'application/json' };

// ------------------------------------------------------------------ handlers

/**
 * The proof job, and the reason Phase 1 exists.
 *
 * `publicIp` is the field that matters: it is what the internet sees when THIS
 * machine makes a request. If it is the home line, the scan will be served the
 * full result page. If it ever comes back as a Railway address, the job ran in
 * the container and the entire premise is gone — so it is reported, never
 * assumed, and a failure to determine it is recorded rather than swallowed.
 */
async function ping(payload) {
  let publicIp = null;
  let publicIpError = null;
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error('ipify answered ' + r.status);
    publicIp = (await r.json()).ip ?? null;
  } catch (err) {
    publicIpError = err.message;
  }
  return {
    hostname: os.hostname(),
    platform: os.platform() + ' ' + os.release() + ' ' + os.arch(),
    node: process.version,
    uptimeSec: Math.round(os.uptime()),
    publicIp,
    publicIpError,
    echo: payload ?? null,
    at: new Date().toISOString(),
  };
}

const handlers = { ping, 'gmap.scan': gmapScan };

// ---------------------------------------------------------------- the client

async function claim() {
  const q = new URLSearchParams({ worker: NAME, wait: String(WAIT_SEC) });
  if (TYPES) q.set('types', TYPES);
  // Above the server's own 25s ceiling: the server is expected to answer 204
  // first, so a timeout here means the network ate it, not that it was idle.
  const r = await fetch(LAB + '/api/jobs/next?' + q, {
    headers: auth,
    signal: AbortSignal.timeout((WAIT_SEC + 15) * 1000),
  });
  // A bad token will never fix itself by retrying, and a loop that retries it
  // forever looks exactly like a worker that is running fine.
  if (r.status === 401) throw Object.assign(new Error('401 — LAB_TOKEN is wrong or was rotated'), { fatal: true });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error('/api/jobs/next answered ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return (await r.json()).job ?? null;
}

async function report(id, ok, result, error) {
  const r = await fetch(LAB + '/api/jobs/' + id + '/result', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ worker: NAME, ok, result, error }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error('posting the result answered ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

async function run(job) {
  const handler = handlers[job.type];
  const at = Date.now();
  if (!handler) {
    // Not a crash: an unknown type means this worker is older than whatever
    // queued the job. Saying so beats leaving it to expire as a silent timeout.
    say('job ' + job.id + ' type=' + job.type + ' — no handler on this worker');
    await report(job.id, false, null, 'no handler for type "' + job.type + '" on worker ' + NAME);
    return;
  }
  say('job ' + job.id + ' type=' + job.type + ' — running');
  try {
    const result = await handler(job.payload);
    await report(job.id, true, result, null);
    say('job ' + job.id + ' done in ' + (Date.now() - at) + 'ms');
  } catch (err) {
    // The handler failing must not take the loop down with it. Report and carry on.
    say('job ' + job.id + ' FAILED after ' + (Date.now() - at) + 'ms: ' + err.message);
    await report(job.id, false, null, err.stack?.slice(0, 2000) ?? String(err)).catch((e) =>
      say('could not even report the failure: ' + e.message),
    );
  }
}

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    say('stopping on ' + sig);
    // A job in flight keeps its lease; the broker hands it to the next worker
    // once that lease expires, so exiting here loses time, never the job.
    process.exit(0);
  });
}

say('worker "' + NAME + '" -> ' + LAB + (TYPES ? ' (types: ' + TYPES + ')' : ' (any type)'));

let backoff = 0;
while (!stopping) {
  try {
    const job = await claim();
    backoff = 0;
    if (job) await run(job);
  } catch (err) {
    if (err.fatal) {
      say('FATAL: ' + err.message);
      process.exit(1);
    }
    backoff = Math.min(backoff ? backoff * 2 : 5_000, 60_000);
    say('poll failed (' + err.message + ') — retrying in ' + backoff / 1000 + 's');
    await new Promise((r) => setTimeout(r, backoff));
  }
}

// agy-lab: the job broker.
//
// This exists for one reason: the Google Maps scan has to run from a home IP.
// Google silently degrades a datacenter profile — the same search that returns
// ~100 businesses from a residential line returns ~60 from a rented one, with no
// error and no captcha — so a scan run inside this container produces a dataset
// that is thin and looks complete. A Mac mini at home does not have that problem.
//
// DIRECTION. The mini sits behind home NAT with no public address, so this
// service can never connect TO it. The mini connects here and asks for work:
// GET /api/jobs/next holds the request open for up to ~25s and answers the moment
// a job exists. That is the whole reason this is a queue and not an outbound
// webhook — no tunnel, no port forwarding, no dynamic DNS, nothing on the home
// router to keep alive.
//
// IN MEMORY, DELIBERATELY. Jobs live in a Map and die with the process. A Railway
// redeploy takes ~6 minutes and drops everything in flight, which is a real cost
// and still the right trade for now: the alternative is a database dependency
// added before the transport it would persist has been proven to work at all.
// The upgrade path is one file behind the same functions; the callers do not
// change. What IS handled is the failure this makes likely — see LEASES below.
//
// LEASES. A job handed to a worker that then dies would sit `running` forever, and
// a queue that quietly strands work is worse than one that loses it visibly. Each
// job carries a lease; a `running` job past its lease goes back to `pending` on
// the next sweep, up to MAX_ATTEMPTS, after which it fails with a message saying
// so rather than cycling forever on something that kills workers.
import http from 'node:http';
import crypto from 'node:crypto';

export interface Ctx {
  json: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
}

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  type: string;
  payload: unknown;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Which worker holds (or held) it. */
  worker: string | null;
  /** How many times it has been handed out. A retry after a lease expiry counts. */
  attempts: number;
  /** Lease length. A run longer than this is assumed dead — set it above the real worst case. */
  timeoutMs: number;
  result: unknown;
  error: string | null;
}

export interface WorkerInfo {
  name: string;
  lastSeenAt: string;
  /** As seen by Railway's proxy — the home IP the whole design is about. */
  ip: string | null;
  taken: number;
  done: number;
  failed: number;
  /**
   * The job types this worker's last claim asked for. Recorded so the gateway can
   * tell whether anything capable of a type is actually online BEFORE routing to
   * it — without this a call for an engine no live worker serves becomes a job
   * that sits pending until it times out, which reads to the caller as the engine
   * being slow rather than absent.
   */
  types: string[] | null;
}

/** Long enough for a Maps search with its scroll plateau, short enough to notice a dead worker. */
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_TIMEOUT_MS = 1_800_000;
/** Past this a job is poison, not unlucky: it has killed three workers. */
const MAX_ATTEMPTS = 3;
/** Ring size. Finished jobs are evicted oldest-first; pending and running are never evicted. */
const MAX_JOBS = 500;
/**
 * Long-poll ceiling. Railway's proxy and most clients tolerate a 30s idle
 * response; 25s leaves room to answer before anything in between decides the
 * request is stuck.
 */
const MAX_WAIT_MS = 25_000;

const jobs = new Map<string, Job>();
const workers = new Map<string, WorkerInfo>();

interface Waiter {
  worker: string;
  types: string[] | null;
  settle: (job: Job | null) => void;
  timer: ReturnType<typeof setTimeout>;
}
const waiters: Waiter[] = [];

/** Callers blocked in `wait()`, keyed by job id. */
const finishWaiters = new Map<string, Set<(job: Job) => void>>();

/**
 * Announce a job reaching a terminal state. Must be called from EVERY place a
 * job becomes done or failed — `finish()` for a real result, `sweep()` for a
 * lease that expired past its attempts. A terminal transition that skips this
 * leaves `wait()` hanging until its own timeout, which looks exactly like a slow
 * worker and is why the timeout is not a substitute for calling it.
 */
function settleFinished(job: Job): void {
  const set = finishWaiters.get(job.id);
  if (!set) return;
  finishWaiters.delete(job.id);
  for (const resolve of set) resolve(job);
}

const now = (): string => new Date().toISOString();
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * The caller's address as Railway sees it. x-forwarded-for is spoofable, which
 * matters nowhere here: it is displayed so a person can confirm the worker is
 * where they think it is, never trusted for a decision.
 */
function callerIp(req: http.IncomingMessage): string | null {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return raw.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? null;
}

function touch(name: string, ip: string | null, types?: string[] | null): WorkerInfo {
  const existing = workers.get(name);
  const info: WorkerInfo =
    existing ?? { name, lastSeenAt: now(), ip, taken: 0, done: 0, failed: 0, types: null };
  info.lastSeenAt = now();
  if (ip) info.ip = ip;
  // Only a claim declares types. A result POST also touches, and must not erase
  // what the claim recorded — an empty list there would read as "serves nothing".
  if (types && types.length) info.types = types;
  workers.set(name, info);
  return info;
}

/**
 * Workers seen within `withinMs`, i.e. the ones a route may still count on. A
 * worker that stopped polling is not "slow", it is gone; the gateway needs that
 * distinction to refuse rather than enqueue.
 */
export function liveWorkers(withinMs = 90_000): WorkerInfo[] {
  const at = Date.now();
  return [...workers.values()].filter((w) => at - Date.parse(w.lastSeenAt) <= withinMs);
}

/** Every job type at least one live worker is currently claiming. */
export function liveTypes(withinMs = 90_000): string[] {
  const out = new Set<string>();
  for (const w of liveWorkers(withinMs)) for (const t of w.types ?? []) out.add(t);
  return [...out];
}

/**
 * Expire leases and evict old finished jobs. Called on every read and every
 * hand-out rather than from an interval: a timer in a container that Railway may
 * pause is one more thing that can be quietly not running, and the sweep is O(n)
 * over at most MAX_JOBS entries.
 */
function sweep(): void {
  const at = Date.now();
  for (const job of jobs.values()) {
    if (job.status !== 'running' || !job.startedAt) continue;
    if (at - Date.parse(job.startedAt) <= job.timeoutMs) continue;
    if (job.attempts >= MAX_ATTEMPTS) {
      job.status = 'failed';
      job.finishedAt = now();
      job.error = 'lease expired ' + job.attempts + 'x without a result (last worker: ' + (job.worker ?? 'unknown') + ')';
      settleFinished(job);
      continue;
    }
    job.status = 'pending';
    job.startedAt = null;
    job.worker = null;
  }

  if (jobs.size <= MAX_JOBS) return;
  // Insertion order is creation order, so the first finished job found is the
  // oldest one. Pending and running are skipped: dropping work that has not run
  // is the one loss this cache must never cause.
  for (const [id, job] of jobs) {
    if (jobs.size <= MAX_JOBS) break;
    if (job.status === 'done' || job.status === 'failed') jobs.delete(id);
  }
}

function pending(types: string[] | null): Job | null {
  for (const job of jobs.values()) {
    if (job.status !== 'pending') continue;
    if (types && !types.includes(job.type)) continue;
    return job;
  }
  return null;
}

function lease(job: Job, worker: string): Job {
  job.status = 'running';
  job.startedAt = now();
  job.worker = worker;
  job.attempts += 1;
  const info = workers.get(worker);
  if (info) info.taken += 1;
  return job;
}

/** Hand a freshly created job straight to a waiting worker, if one matches. */
function wake(job: Job): void {
  const i = waiters.findIndex((w) => !w.types || w.types.includes(job.type));
  if (i === -1) return;
  const w = waiters.splice(i, 1)[0]!;
  clearTimeout(w.timer);
  w.settle(lease(job, w.worker));
}

// ------------------------------------------------------------------- the API

export function create(type: string, payload: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Job {
  sweep();
  const job: Job = {
    id: crypto.randomBytes(6).toString('hex'),
    type,
    payload: payload ?? null,
    status: 'pending',
    createdAt: now(),
    startedAt: null,
    finishedAt: null,
    worker: null,
    attempts: 0,
    timeoutMs: Math.min(Math.max(1_000, timeoutMs), MAX_TIMEOUT_MS),
    result: null,
    error: null,
  };
  jobs.set(job.id, job);
  wake(job);
  return job;
}

/**
 * Claim one job, waiting up to `waitMs` for one to appear.
 *
 * `signal` is the request being aborted — a worker that hung up must not keep a
 * slot in the waiter list, because the next job created would be handed to a
 * socket nobody is reading and would only come back after its lease expired.
 */
export function take(
  worker: string,
  opts: { waitMs?: number; types?: string[] | null; signal?: AbortSignal } = {},
): Promise<Job | null> {
  sweep();
  const types = opts.types && opts.types.length ? opts.types : null;
  const ready = pending(types);
  if (ready) return Promise.resolve(lease(ready, worker));

  const waitMs = Math.min(Math.max(0, opts.waitMs ?? MAX_WAIT_MS), MAX_WAIT_MS);
  if (!waitMs) return Promise.resolve(null);

  return new Promise<Job | null>((resolve) => {
    let settled = false;
    const done = (job: Job | null): void => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener('abort', onAbort);
      resolve(job);
    };
    const w: Waiter = {
      worker,
      types,
      settle: done,
      timer: setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i !== -1) waiters.splice(i, 1);
        done(null);
      }, waitMs),
    };
    function onAbort(): void {
      const i = waiters.indexOf(w);
      if (i !== -1) waiters.splice(i, 1);
      clearTimeout(w.timer);
      done(null);
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    waiters.push(w);
  });
}

export function finish(id: string, ok: boolean, result: unknown, error: string | null): Job | null {
  const job = jobs.get(id);
  if (!job) return null;
  // A result for a job whose lease already expired is still accepted: the work
  // genuinely happened, and refusing it would mean re-running a scan that has
  // already spent its Google budget. It may arrive after a retry was handed out;
  // last writer wins, and `attempts` is what records that it happened twice.
  job.status = ok ? 'done' : 'failed';
  job.finishedAt = now();
  job.result = ok ? (result ?? null) : null;
  job.error = ok ? null : (error ?? 'worker reported failure with no message');
  const info = job.worker ? workers.get(job.worker) : undefined;
  if (info) {
    if (ok) info.done += 1;
    else info.failed += 1;
  }
  settleFinished(job);
  return job;
}

/**
 * Resolve when a job reaches a terminal state, or when `timeoutMs` runs out.
 *
 * This is what lets a request await its own job instead of the caller polling.
 * Resolving with the job STILL RUNNING on timeout is deliberate: the work is not
 * cancelled, the result will land, and the caller gets an id it can read later —
 * so a slow answer degrades to "come back for it" rather than being thrown away.
 * `null` means no such job at all.
 */
export function wait(id: string, timeoutMs: number): Promise<Job | null> {
  const job = get(id);
  if (!job) return Promise.resolve(null);
  if (job.status === 'done' || job.status === 'failed') return Promise.resolve(job);

  return new Promise<Job | null>((resolve) => {
    const done = (j: Job | null): void => {
      clearTimeout(timer);
      finishWaiters.get(id)?.delete(settle);
      resolve(j);
    };
    const settle = (j: Job): void => done(j);
    const timer = setTimeout(() => done(get(id)), Math.max(1_000, timeoutMs));
    const set = finishWaiters.get(id) ?? new Set();
    set.add(settle);
    finishWaiters.set(id, set);
  });
}

export function get(id: string): Job | null {
  sweep();
  return jobs.get(id) ?? null;
}

export function snapshot(): {
  counts: Record<JobStatus, number>;
  waiting: number;
  jobs: Job[];
  workers: WorkerInfo[];
} {
  sweep();
  const counts: Record<JobStatus, number> = { pending: 0, running: 0, done: 0, failed: 0 };
  for (const job of jobs.values()) counts[job.status] += 1;
  return {
    counts,
    waiting: waiters.length,
    jobs: [...jobs.values()].reverse(),
    workers: [...workers.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
  };
}

// ----------------------------------------------------------------- the routes

/** Returns true when it handled the request. */
export async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ctx: Ctx): Promise<boolean> {
  const p = url.pathname;
  const method = req.method ?? 'GET';
  const { json, readJson } = ctx;

  // Claim work. Checked before the collection routes so /api/jobs/next is never
  // read as a job id.
  if (method === 'GET' && p === '/api/jobs/next') {
    const q = url.searchParams;
    const worker = (q.get('worker') ?? '').trim();
    if (!worker) {
      json(res, 400, { error: 'worker is required — name the machine asking, it is what /api/jobs reports' });
      return true;
    }
    const types = (q.get('types') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    touch(worker, callerIp(req), types);
    const waitSec = Number(q.get('wait'));
    const controller = new AbortController();
    // The socket closing IS the cancellation. Without this a worker restarted
    // mid-poll leaves a waiter that will be handed the next job and drop it.
    res.on('close', () => controller.abort());
    const job = await take(worker, {
      waitMs: Number.isFinite(waitSec) ? waitSec * 1000 : MAX_WAIT_MS,
      types,
      signal: controller.signal,
    });
    if (res.writableEnded) return true;
    // 204, not 200 with a null: "nothing right now" is the ordinary answer here,
    // and a worker loop should be able to branch on the status alone.
    if (!job) {
      res.writeHead(204, { 'cache-control': 'no-store' });
      res.end();
      return true;
    }
    json(res, 200, { job });
    return true;
  }

  if (method === 'POST' && p === '/api/jobs') {
    const body = await readJson(req);
    const type = str(body.type).trim();
    if (!type) {
      json(res, 400, { error: 'type is required' });
      return true;
    }
    const job = create(type, body.payload ?? null, num(body.timeoutMs, DEFAULT_TIMEOUT_MS));
    json(res, 201, { job });
    return true;
  }

  if (method === 'GET' && p === '/api/jobs') {
    json(res, 200, snapshot());
    return true;
  }

  const result = /^\/api\/jobs\/([a-f0-9]{12})\/result$/.exec(p);
  if (method === 'POST' && result) {
    const body = await readJson(req);
    const worker = str(body.worker).trim();
    if (worker) touch(worker, callerIp(req));
    const job = finish(result[1]!, body.ok !== false, body.result ?? null, str(body.error) || null);
    if (!job) {
      // Almost always the ring having evicted it, or a redeploy having dropped it.
      // Say which, because "unknown job" reads like a bug in the worker.
      json(res, 404, { error: 'no such job — it was evicted, or the service restarted while it ran', id: result[1] });
      return true;
    }
    json(res, 200, { job });
    return true;
  }

  const one = /^\/api\/jobs\/([a-f0-9]{12})$/.exec(p);
  if (method === 'GET' && one) {
    const job = get(one[1]!);
    if (!job) {
      json(res, 404, { error: 'no such job', id: one[1] });
      return true;
    }
    json(res, 200, { job });
    return true;
  }

  return false;
}

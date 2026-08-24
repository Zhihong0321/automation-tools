// The admission queue: what stands between a burst of API calls and an account
// getting rate-limited by the site it belongs to.
//
// Every engine here is somebody's personal account with a human usage limit
// attached. Ten parallel calls do not make ten answers arrive faster - they make
// one profile thrash (MAX_OPEN_BROWSERS=1, so each call evicts the last) and they
// make the traffic look like exactly what a bot-detection system is built to
// catch. So calls are admitted one lane at a time, spaced, and counted.
//
// Three refusals, in order of how early they fire:
//
//   1. hourly cap    - this account has had enough for now. 429.
//   2. queue depth   - too many already waiting. 429, with how long to wait.
//   3. estimated wait- the queue is short but slow. 429 rather than a request
//                      that sits for ten minutes and then answers into a socket
//                      whose client gave up nine minutes ago.
//
// Anything that passes all three WAITS rather than fails: the caller asked for an
// answer, and an answer at +40s is worth more than an error at +0s. Callers that
// disagree set their own client timeout.
//
// Slots are per LANE, not per engine: ChatGPT and Meta AI share one browser, so
// they share one lane. Gaps, caps and statistics are per ENGINE, because the
// account that gets rate-limited is per engine.

export type Engine = 'agy' | 'chatgpt' | 'meta';
/** Where the work runs. The container is this process; the mini is a worker on the job queue. */
export type Location = 'container' | 'mini';
type Lane = 'agy' | 'browser' | 'mini';

/**
 * The mini is its own lane, not extra width on `browser`.
 *
 * `browser` is width 1 because the container has exactly one Chrome. The mini is
 * a DIFFERENT machine with a DIFFERENT ChatGPT account and its own browser, so
 * sharing a lane with the container would serialize two things that have no
 * reason to wait for each other and throw away the capacity the mini was added
 * for. Separate lane, separate width, separate gap.
 */
const laneOf = (engine: Engine, location: Location = 'container'): Lane =>
  location === 'mini' ? 'mini' : engine === 'agy' ? 'agy' : 'browser';

const int = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
};

/**
 * Per-engine policy.
 *
 * The gap is the important one and the least obvious: it is not about capacity,
 * it is about not looking like a script. Two seconds between browser calls costs
 * nothing against a 12-second answer and keeps a burst from arriving as a burst.
 * Zero for agy, which is a CLI talking to an API that expects programs.
 *
 * Hourly caps default to off. A cap that nobody chose is a pipeline that stops
 * at 3am for a reason nobody remembers - but the account limits here are real, so
 * the knob exists and is documented.
 */
function policy(engine: Engine): {
  minGapMs: number;
  maxDepth: number;
  maxWaitMs: number;
  hourlyLimit: number;
} {
  const prefix = engine === 'chatgpt' ? 'CGPT' : engine.toUpperCase();
  return {
    minGapMs: int(prefix + '_MIN_GAP_MS', engine === 'agy' ? 0 : 2000),
    maxDepth: int(prefix + '_MAX_QUEUE', int('QUEUE_MAX_DEPTH', 10)),
    maxWaitMs: int(prefix + '_MAX_WAIT_MS', int('QUEUE_MAX_WAIT_MS', 300_000)),
    hourlyLimit: int(prefix + '_HOURLY_LIMIT', 0),
  };
}

/** How many run at once in a lane. One browser is a hard limit of the container, not a policy. */
const laneConcurrency = (lane: Lane): number =>
  lane === 'agy'
    ? Math.max(1, int('AGY_MAX_CONCURRENT', 2))
    : lane === 'mini'
      // ego lite runs each account in its own task space, so the mini's ceiling is
      // accounts, not browsers — unlike the container, where it is literally one
      // Chrome. Five is what the worker's LANES actually run: three ChatGPT lanes,
      // one per signed-in account (Zhihong PRO, 三专, gan gemini), plus AGY_LANES=2
      // of agy's own.
      //
      // This number must equal the lane count and never exceed it, because a width
      // wider than the lanes behind it does not admit more work — it just moves the
      // queue one hop later, into the job broker, where the extra calls sit
      // `pending` and nothing measures them. That is exactly what it was doing to
      // agy at 3: two agy calls were admitted here in the same millisecond and the
      // second then waited 306 seconds for the single lane that served agy.ask.
      ? Math.max(1, int('MINI_MAX_CONCURRENT', 5))
      : Math.max(1, int('MAX_OPEN_BROWSERS', 1));

interface LaneState {
  inflight: number;
  waiting: Array<() => void>;
  /** Exponential moving average of how long a call in this lane takes, seeded on first use. */
  emaMs: number;
  samples: number;
}

interface EngineState {
  lastStartedAt: number;
  /** Start times within the last hour, for the cap. Trimmed on read. */
  recent: number[];
  ok: number;
  failed: number;
  refused: number;
  totalMs: number;
}

const lanes: Record<Lane, LaneState> = {
  agy: { inflight: 0, waiting: [], emaMs: 20_000, samples: 0 },
  browser: { inflight: 0, waiting: [], emaMs: 13_000, samples: 0 },
  // Seeded from measured mini round trips (~7.5s end to end including the job hop).
  mini: { inflight: 0, waiting: [], emaMs: 8_000, samples: 0 },
};

const engines: Record<Engine, EngineState> = {
  agy: fresh(),
  chatgpt: fresh(),
  meta: fresh(),
};

function fresh(): EngineState {
  return { lastStartedAt: 0, recent: [], ok: 0, failed: 0, refused: 0, totalMs: 0 };
}

export interface BusyError extends Error {
  status: 429;
  type: string;
  retryAfterSec: number;
  queue: Record<string, unknown>;
}

function busy(type: string, message: string, retryAfterSec: number, engine: Engine): BusyError {
  engines[engine].refused++;
  return Object.assign(new Error(message), {
    status: 429 as const,
    type,
    retryAfterSec: Math.max(1, Math.ceil(retryAfterSec)),
    queue: snapshot(engine),
  });
}

const hourAgo = (): number => Date.now() - 3_600_000;

function recentHits(engine: Engine): number[] {
  const s = engines[engine];
  s.recent = s.recent.filter((t) => t > hourAgo());
  return s.recent;
}

/**
 * What a call will wait, before it commits to waiting.
 *
 * Deliberately pessimistic about the call already running: its remaining time is
 * counted as a whole average rather than half of one, because under-promising a
 * wait is what produces a client that gives up mid-answer.
 */
function estimateWaitMs(lane: Lane, engine: Engine): number {
  const l = lanes[lane];
  const concurrency = laneConcurrency(lane);
  const ahead = l.waiting.length + Math.min(l.inflight, concurrency);
  const rounds = Math.ceil(Math.max(0, ahead - concurrency + 1) / concurrency);
  const gap = policy(engine).minGapMs;
  return Math.max(0, rounds * (l.emaMs + gap));
}

export interface QueueInfo {
  /** How many were ahead when this call arrived. */
  ahead: number;
  estimatedWaitMs: number;
}

export interface Admitted<T> {
  value: T;
  queuedMs: number;
  ahead: number;
}

/**
 * Admit one call, or refuse it.
 *
 * `onQueued` fires once, before the wait, when there is a wait - the streaming
 * path uses it to tell the client it is queued rather than leaving a socket
 * silent for a minute.
 */
export async function run<T>(
  engine: Engine,
  fn: () => Promise<T>,
  hooks: { onQueued?: (info: QueueInfo) => void; location?: Location } = {},
): Promise<Admitted<T>> {
  const lane = laneOf(engine, hooks.location);
  const l = lanes[lane];
  const p = policy(engine);
  const arrived = Date.now();

  const hits = recentHits(engine);
  if (p.hourlyLimit && hits.length >= p.hourlyLimit) {
    const oldest = hits[0] ?? arrived;
    const freeIn = (oldest + 3_600_000 - arrived) / 1000;
    throw busy(
      'rate_limit_exceeded',
      `${engine} has used its hourly allowance (${hits.length}/${p.hourlyLimit}). It frees up in ${Math.ceil(freeIn / 60)} min.`,
      freeIn,
      engine,
    );
  }

  const ahead = l.waiting.length + l.inflight;
  if (l.waiting.length >= p.maxDepth) {
    const wait = estimateWaitMs(lane, engine);
    throw busy(
      'queue_full',
      `System busy: ${l.waiting.length} calls are already waiting for ${lane === 'agy' ? 'agy' : lane === 'mini' ? 'the mini' : 'the browser'} and the queue is capped at ${p.maxDepth}. Retry in about ${Math.ceil(wait / 1000)}s.`,
      wait / 1000,
      engine,
    );
  }

  const estimatedWaitMs = estimateWaitMs(lane, engine);
  if (estimatedWaitMs > p.maxWaitMs) {
    throw busy(
      'queue_too_slow',
      `System busy: the wait is about ${Math.ceil(estimatedWaitMs / 1000)}s, past the ${Math.round(p.maxWaitMs / 1000)}s this gateway will hold a request. Retry shortly.`,
      estimatedWaitMs / 1000,
      engine,
    );
  }

  if (ahead > 0 && hooks.onQueued) hooks.onQueued({ ahead, estimatedWaitMs });

  // ---- wait for a slot, FIFO -------------------------------------------
  if (l.inflight >= laneConcurrency(lane)) {
    await new Promise<void>((resolve) => l.waiting.push(resolve));
  }
  l.inflight++;

  try {
    // ---- space it out --------------------------------------------------
    const s = engines[engine];
    const since = Date.now() - s.lastStartedAt;
    if (s.lastStartedAt && since < p.minGapMs) await sleep(p.minGapMs - since);

    const startedAt = Date.now();
    s.lastStartedAt = startedAt;
    s.recent.push(startedAt);
    const queuedMs = startedAt - arrived;

    try {
      const value = await fn();
      const ms = Date.now() - startedAt;
      s.ok++;
      s.totalMs += ms;
      observe(l, ms);
      return { value, queuedMs, ahead };
    } catch (err) {
      // A failure still says how long the lane is busy for, and a failure that
      // took 90 seconds should not leave the estimate thinking calls take 13.
      const ms = Date.now() - startedAt;
      s.failed++;
      observe(l, ms);
      throw err;
    }
  } finally {
    l.inflight--;
    l.waiting.shift()?.();
  }
}

/** Seed on the first real measurement rather than trusting the constant above. */
function observe(l: LaneState, ms: number): void {
  l.emaMs = l.samples === 0 ? ms : Math.round(l.emaMs * 0.7 + ms * 0.3);
  l.samples++;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** What /api/queue serves, and what rides along on a 429. */
export function snapshot(engine?: Engine): Record<string, unknown> {
  const laneView = (lane: Lane) => ({
    running: lanes[lane].inflight,
    waiting: lanes[lane].waiting.length,
    concurrency: laneConcurrency(lane),
    averageMs: Math.round(lanes[lane].emaMs),
    samples: lanes[lane].samples,
  });
  const engineView = (e: Engine) => {
    const s = engines[e];
    const p = policy(e);
    return {
      lane: laneOf(e),
      minGapMs: p.minGapMs,
      maxQueue: p.maxDepth,
      maxWaitMs: p.maxWaitMs,
      hourlyLimit: p.hourlyLimit || null,
      usedThisHour: recentHits(e).length,
      answered: s.ok,
      failed: s.failed,
      refused: s.refused,
      averageMs: s.ok ? Math.round(s.totalMs / s.ok) : null,
      estimatedWaitMs: estimateWaitMs(laneOf(e), e),
    };
  };
  if (engine) return { engine, ...engineView(engine), lanes: { [laneOf(engine)]: laneView(laneOf(engine)) } };
  return {
    lanes: { agy: laneView('agy'), browser: laneView('browser') },
    engines: { agy: engineView('agy'), chatgpt: engineView('chatgpt'), meta: engineView('meta') },
  };
}

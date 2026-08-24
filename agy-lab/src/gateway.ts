// The gateway: one endpoint other tools point at, two engines behind it.
//
// Everything else in this service is a harness — install a CLI, watch a login,
// dump a page. This is the part that exists to be CONSUMED: a tool that already
// speaks to an LLM should be able to change a base URL and get agy or a signed-in
// ChatGPT session instead, without learning anything about profiles, pty sessions
// or Chrome.
//
// Hence OpenAI's chat-completions shape rather than a nicer one of our own. Not
// because it is a good API — it carries fields neither engine has (temperature,
// max_tokens, logprobs) and a token accounting neither can produce — but because
// every client library, agent framework and script already emits it. A shape that
// needs a new client is a shape nobody adopts. POST /api/ask is the honest native
// form for anything written against this service directly.
//
// What the OpenAI shape promises and this cannot deliver:
//   - sampling parameters. A browser session has no temperature knob, and agy's
//     -p takes none. They are accepted and ignored, never silently approximated.
//   - token counts. Reported as a character-based estimate and labelled as one.
//   - many completions per call (n>1). Refused rather than faked.
// Everything ignored is listed back in the response so a caller can see it was.
import crypto from 'node:crypto';
import type http from 'node:http';
import * as agy from './agy.ts';
import * as sessions from './sessions.ts';
import * as meta from './meta.ts';
import * as queue from './queue.ts';
import * as jobs from './jobs.ts';
import * as log from './logstore.ts';

export interface Ctx {
  json: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
}

/**
 * Timeouts are generous because both engines are slow by construction: agy is a
 * real model call, ChatGPT is a browser watching text appear. A caller that wants
 * to give up sooner passes timeoutMs; nothing here is faster for being hurried.
 */
const AGY_TIMEOUT_MS = Number(process.env.AGY_ASK_TIMEOUT_MS ?? 300_000);
const CGPT_TIMEOUT_MS = Number(process.env.CGPT_ASK_TIMEOUT_MS ?? 180_000);
/** Meta AI is the same shape of slow as ChatGPT - a browser watching text appear. */
const META_TIMEOUT_MS = Number(process.env.META_ASK_TIMEOUT_MS ?? CGPT_TIMEOUT_MS);

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

interface HttpError extends Error {
  status: number;
  type: string;
}

function fail(status: number, message: string, type = 'invalid_request_error'): HttpError {
  return Object.assign(new Error(message), { status, type }) as HttpError;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

type Location = queue.Location;

type Route = { location: Location } & (
  | { engine: 'agy'; model: string }
  // `pinnedSession` records whether the CALLER named the account, as in
  // `chatgpt:mini-2@mini`, or whether `session` is just the default this resolver
  // filled in. On the mini that difference decides who picks the account: a
  // default must not, because the worker now has one lane per signed-in account
  // and the lane is the thing that knows which one is free.
  | { engine: 'chatgpt'; model: string; session: string; pinnedSession?: boolean }
  | { engine: 'meta'; model: string; session: string; pinnedSession?: boolean }
);

/** The job type the mini's worker lane claims for an engine. */
const jobTypeFor = (engine: queue.Engine): string => engine + '.ask';

/**
 * Is a worker that serves this engine actually polling right now?
 *
 * Without this check a call for a mini engine becomes a job that sits pending
 * until it times out, and the caller reads that as the engine being slow rather
 * than absent — a minute of waiting to be told something that was knowable
 * immediately.
 */
function miniLive(engine: queue.Engine): boolean {
  return jobs.liveTypes().includes(jobTypeFor(engine));
}

/**
 * Where a request runs when it did not say.
 *
 * Explicit `@mini` / `@container` always wins; this is only the bare-name case.
 * The mini is preferred when it is live because it is the capacity that was
 * ADDED — a different machine, a different account, its own rate limit — so
 * sending pooled traffic to the container first would leave the new capacity
 * idle and keep the old bottleneck. Falls back the moment the mini stops polling.
 */
function defaultLocation(engine: 'agy' | 'chatgpt' | 'meta'): Location {
  const pref = process.env.ROUTING_PREFER?.trim().toLowerCase();
  if (pref === 'container') return 'container';
  if (pref === 'mini') return miniLive(engine) ? 'mini' : 'container';
  return miniLive(engine) ? 'mini' : 'container';
}

/** The default timeout for a route, since two of the three engines are browsers. */
const timeoutFor = (route: Route): number =>
  route.engine === 'agy' ? AGY_TIMEOUT_MS : route.engine === 'meta' ? META_TIMEOUT_MS : CGPT_TIMEOUT_MS;

/**
 * Which ChatGPT account a bare `chatgpt` means.
 *
 * A ready session wins over a merely listed one: sessions outlive their logins
 * here, and routing to a signed-out profile produces a 503 for a request that a
 * working account beside it could have answered.
 */
function defaultSession(kind: sessions.Kind): string {
  const pinned = (kind === 'meta' ? process.env.META_DEFAULT_SESSION : process.env.CGPT_DEFAULT_SESSION)?.trim();
  if (pinned) return pinned;
  const all = sessions.list().filter((s) => s.initialized && s.kind === kind);
  const pick = all.find((s) => s.lastProbe?.status === 'ready') ?? all[0];
  if (!pick) {
    throw fail(
      503,
      kind === 'meta'
        // The engine is retired, so pointing a caller at the import flow would be
        // sending them to set up something nothing routes to. Say what happened.
        ? 'The Meta AI engine is retired: the container address is region-blocked and no mini worker claims meta.ask. Use agy or chatgpt, or fb.* for Facebook research.'
        : 'No ChatGPT session exists yet. Create one with POST /api/cgpt, then /login.',
      'no_session',
    );
  }
  return pick.id;
}

/**
 * Model name to engine.
 *
 * `gpt-*` maps to ChatGPT on purpose. Tools hard-code a model id far more often
 * than they expose one, and a request for gpt-4o against this gateway means "the
 * ChatGPT this box is signed in to" — the only honest reading available. What it
 * must never do is quietly answer it with agy, so every response names the model
 * that actually ran.
 */
export function resolveModel(raw: string): Route {
  let wanted = str(raw).trim();
  if (!wanted || wanted.toLowerCase() === 'auto') {
    const fallback = process.env.DEFAULT_MODEL?.trim();
    return resolveModel(!fallback || fallback.toLowerCase() === 'auto' ? 'agy' : fallback);
  }
  // `@mini` / `@container` pins the location. Split before the session split so an
  // account id containing an @ is not mistaken for one.
  let pinned: Location | null = null;
  const at = wanted.lastIndexOf('@');
  if (at > 0) {
    const tail = wanted.slice(at + 1).toLowerCase();
    if (tail === 'mini' || tail === 'macmini') { pinned = 'mini'; wanted = wanted.slice(0, at); }
    else if (tail === 'container' || tail === 'cloud') { pinned = 'container'; wanted = wanted.slice(0, at); }
    else throw fail(404, `Unknown location "@${tail}". Use @mini or @container.`, 'model_not_found');
  }
  const [head, ...rest] = wanted.split(/[:/]/);
  const name = (head ?? '').toLowerCase();
  // Gemini is served here through the AGY runtime.  Keeping `gemini` as a
  // first-class alias lets feature-specific configuration say what it wants
  // (for example VIP_GEMINI_MODEL=gemini) without inventing a second engine or
  // accidentally routing that traffic to another provider.
  if (name === 'agy' || name === 'antigravity' || name === 'gemini' || name === 'google') {
    const location = pinned ?? defaultLocation('agy');
    if (location === 'mini' && !miniLive('agy')) {
      throw fail(503, 'No mini worker is claiming agy.ask right now.', 'engine_unavailable');
    }
    return { engine: 'agy', model: location === 'mini' ? 'agy@mini' : 'agy', location };
  }
  // Meta before ChatGPT: "meta" is checked by exact name, and llama-* is the
  // model family a caller pointing at Meta AI is most likely to hard-code.
  if (name === 'meta' || name === 'metaai' || name === 'meta.ai' || /^llama/.test(name)) {
    const location = pinned ?? defaultLocation('meta');
    if (location === 'mini') {
      if (!miniLive('meta')) {
        throw fail(503, 'The Meta AI engine is retired; no mini worker claims meta.ask. Use agy or chatgpt, or fb.* for Facebook research.', 'engine_unavailable');
      }
      const session = rest.join(':').trim() || process.env.MINI_META_DEFAULT_SESSION?.trim() || 'meta-main';
      return { engine: 'meta', model: 'meta:' + session + '@mini', session, location };
    }
    const session = rest.join(':').trim() || defaultSession('meta');
    return { engine: 'meta', model: 'meta:' + session, session, location };
  }
  if (name === 'chatgpt' || name === 'openai' || /^(gpt|o[134])/.test(name)) {
    const location = pinned ?? defaultLocation('chatgpt');
    if (location === 'mini') {
      if (!miniLive('chatgpt')) {
        throw fail(503, 'No mini worker is claiming chatgpt.ask right now.', 'engine_unavailable');
      }
      // The mini's accounts live in ITS registry, not this container's session
      // store, so defaultSession() must not be consulted for them — it would name
      // a container profile the mini has never heard of.
      const explicit = rest.join(':').trim();
      const session = explicit || process.env.MINI_DEFAULT_SESSION?.trim() || 'mini-main';
      return {
        engine: 'chatgpt', model: 'chatgpt:' + session + '@mini', session, location,
        pinnedSession: Boolean(explicit),
      };
    }
    const session = rest.join(':').trim() || defaultSession('chatgpt');
    return { engine: 'chatgpt', model: 'chatgpt:' + session, session, location };
  }
  throw fail(404, `Unknown model "${wanted}". GET /v1/models lists what this gateway serves.`, 'model_not_found');
}

function models(): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  const entry = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    object: 'model',
    created: now,
    owned_by: 'agy-lab',
    ...extra,
  });
  const live = sessions.list().filter((s) => s.initialized);
  const cgpt = live.filter((s) => s.kind === 'chatgpt');
  const metaSessions = live.filter((s) => s.kind === 'meta');
  const named = (prefix: string, list: typeof live, engine: string) =>
    list.map((s) =>
      entry(prefix + ':' + s.id, {
        engine,
        label: s.label,
        ready: s.lastProbe?.status === 'ready',
        lastProbe: s.lastProbe,
      }),
    );
  // What the mini is serving RIGHT NOW, from the types its lanes last claimed —
  // not from configuration. A location that is listed but not polling is the one
  // thing this endpoint exists to make visible, so liveness is read per call and
  // the entry is emitted either way rather than being hidden when it is down.
  const miniWorkers = jobs.liveWorkers();
  const miniEntry = (engine: queue.Engine) => {
    const live = miniLive(engine);
    const id = engine + '@mini';
    return entry(id, {
      engine,
      location: 'mini',
      ready: live,
      workers: miniWorkers.filter((w) => (w.types ?? []).includes(jobTypeFor(engine))).map((w) => w.name),
      ...(live ? {} : { detail: 'no worker is claiming ' + jobTypeFor(engine) }),
    });
  };

  return {
    object: 'list',
    data: [
      entry('agy', { engine: 'agy', location: 'container' }),
      ...named('chatgpt', cgpt, 'chatgpt'),
      ...(cgpt.length ? [entry('chatgpt', { engine: 'chatgpt', alias_for: 'chatgpt:' + defaultSession('chatgpt') })] : []),
      ...named('meta', metaSessions, 'meta'),
      ...(miniLive('meta')
        ? [entry('meta', {
            engine: 'meta',
            location: 'mini',
            alias_for: 'meta:' + (process.env.MINI_META_DEFAULT_SESSION?.trim() || 'meta-main') + '@mini',
          })]
        : metaSessions.length
          ? [entry('meta', { engine: 'meta', location: 'container', alias_for: 'meta:' + defaultSession('meta') })]
          : []),
      miniEntry('chatgpt'),
      miniEntry('meta'),
      miniEntry('agy'),
    ],
  };
}

/**
 * Run a call on the mini by putting it on the job queue and awaiting the result.
 *
 * The mini is not reachable from here — it is behind a home connection and polls
 * out. So a "route to the mini" is a job it claims, which is why this needs
 * jobs.wait() and why the gateway could not offer a second location before that
 * existed.
 *
 * There is no streaming: the worker reports once, when it is done. onDelta is
 * called with the whole answer so a streaming client still gets its one chunk
 * rather than silence.
 */
async function miniAsk(
  route: Route,
  prompt: string,
  opts: { timeoutMs?: number; onDelta?: (chunk: string) => void } = {},
): Promise<AskResult> {
  const timeoutMs = opts.timeoutMs ?? timeoutFor(route);
  const session = route.engine === 'agy' ? undefined : (route as { session: string }).session;

  // Give the worker its full budget, then wait slightly longer than the job's own
  // timeout: expiring here first would report a timeout for work still running.
  // Send `id` ONLY when the caller pinned the account. Stamping the resolver's
  // default on every job is what made three concurrent `chatgpt@mini` calls all
  // name `mini-main`: three lanes, three accounts, and every job addressed to the
  // same one. They fought over a single ego lite task space and two of three came
  // back `compose_failed`. Omitted, each lane answers as its own account.
  const pinned = route.engine !== 'agy' && (route as { pinnedSession?: boolean }).pinnedSession === true;
  const job = jobs.create(
    jobTypeFor(route.engine),
    { ...(pinned ? { id: session } : {}), prompt, timeoutMs },
    timeoutMs,
  );
  const settled = await jobs.wait(job.id, timeoutMs + 5_000);

  if (!settled) throw fail(502, 'the mini job vanished before it finished', 'engine_error');
  if (settled.status === 'pending' || settled.status === 'running') {
    throw fail(504, `the mini did not answer within ${Math.round(timeoutMs / 1000)}s (job ${settled.id} is still running)`, 'timeout');
  }
  if (settled.status === 'failed') {
    throw fail(502, settled.error ?? 'the mini reported a failure with no message', 'engine_error');
  }

  const out = (settled.result ?? {}) as { ok?: boolean; answer?: string; ms?: number; code?: string; error?: string };
  // The worker reports transport success separately from engine success: a job
  // can be `done` and still carry ok:false, e.g. a signed-out account.
  if (out.ok === false) {
    const code = out.code ?? 'engine_error';
    const unavailable = code === 'signed_out' || code === 'no_space' || code === 'region_blocked';
    const status = unavailable ? 503 : code === 'answer_timeout' ? 504 : 502;
    throw fail(status, out.error ?? 'the mini could not answer: ' + code, unavailable ? 'engine_unavailable' : 'engine_error');
  }
  const answer = str(out.answer).trim();
  if (!answer) throw fail(502, 'the mini returned an empty answer', 'engine_error');

  opts.onDelta?.(answer);
  // `ms` is the WORKER's clock: how long the handler ran once a lane picked the
  // job up. The time before that -- the job sitting `pending` because every lane
  // serving its type was busy -- was measured by nobody and reported to nobody,
  // and it is the single largest number in a slow run. Report
  // 2rO7nzyANyjYDpfOf0mQ recorded `round04 {"ms": 49030}` for a round that
  // occupied 355 seconds; the missing 306 were spent in this gap. Anything that
  // reads a round's duration has to be able to see both halves.
  const brokerQueuedMs = settled.startedAt
    ? Math.max(0, Date.parse(settled.startedAt) - Date.parse(settled.createdAt))
    : 0;
  return {
    answer,
    ms: num(out.ms, 0),
    model: route.model,
    engine: route.engine,
    ...(brokerQueuedMs > 250 ? { queuedMs: brokerQueuedMs } : {}),
  };
}

// ---------------------------------------------------------------------------
// Messages in, prompt out
// ---------------------------------------------------------------------------

/** OpenAI content is a string or an array of parts; both arrive from real clients. */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const p = part as { type?: string; text?: string };
        if (typeof p?.text === 'string') return p.text;
        // An image part is not an error, but neither engine can be handed one
        // through the surface it has, so say so in place rather than drop it.
        return p?.type ? '[unsupported content part: ' + p.type + ']' : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Flatten a conversation into one prompt.
 *
 * Neither engine takes a message array: agy's -p is a string, and a ChatGPT ask
 * opens a fresh temporary chat and types once. So multi-turn history has to be
 * rendered INTO the prompt, labelled, or the model reads a transcript as one
 * person talking. A single user message is passed through unlabelled, because
 * that is the common case and a "User:" prefix changes how a model answers it.
 */
export function promptFromMessages(messages: unknown): string {
  if (!Array.isArray(messages) || !messages.length) throw fail(400, 'messages must be a non-empty array.');
  const list = messages.map((m) => {
    const msg = m as { role?: unknown; content?: unknown };
    return { role: str(msg.role, 'user').toLowerCase(), text: contentText(msg.content) };
  });
  const isSystem = (role: string) => role === 'system' || role === 'developer';
  const system = list.filter((m) => isSystem(m.role)).map((m) => m.text).filter(Boolean);
  const turns = list.filter((m) => !isSystem(m.role) && m.text);
  const parts = [...system];
  if (turns.length === 1 && turns[0]!.role === 'user') parts.push(turns[0]!.text);
  else {
    for (const t of turns) {
      const label = t.role === 'assistant' ? 'Assistant' : t.role === 'tool' ? 'Tool' : 'User';
      parts.push(label + ': ' + t.text);
    }
    if (turns.length && turns[turns.length - 1]!.role !== 'assistant') parts.push('Assistant:');
  }
  const prompt = parts.join('\n\n').trim();
  if (!prompt) throw fail(400, 'messages carried no text to send.');
  return prompt;
}

/** Labelled an estimate everywhere it is returned, because ~4 chars per token is what it is. */
const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 4));

/** Sampling knobs a client sent that no engine here has. Reported, never approximated. */
const IGNORABLE = [
  'temperature',
  'top_p',
  'max_tokens',
  'max_completion_tokens',
  'presence_penalty',
  'frequency_penalty',
  'logprobs',
  'logit_bias',
  'seed',
  'stop',
  'tool_choice',
  'response_format',
];

// ---------------------------------------------------------------------------
// Running one ask
// ---------------------------------------------------------------------------

export interface AskResult {
  answer: string;
  ms: number;
  model: string;
  engine: 'agy' | 'chatgpt' | 'meta';
  /** Browser engines only: false means the answer stopped growing because time ran out, not because it finished. */
  settled?: boolean;
  /** How long this call waited for its turn. Absent when it did not wait. */
  queuedMs?: number;
}

/**
 * Every engine call goes through the admission queue, and none goes round it.
 *
 * The engines are personal accounts with human usage limits, and a burst does not
 * make answers arrive faster - it makes one Chrome profile thrash and the traffic
 * look automated. See queue.ts for the three ways a call can be refused rather
 * than queued; all three surface here as a 429 with Retry-After.
 */
async function runAsk(
  route: Route,
  prompt: string,
  opts: { timeoutMs?: number; tools?: boolean; onDelta?: (chunk: string) => void; onQueued?: (info: queue.QueueInfo) => void } = {},
): Promise<AskResult> {
  const admitted = await queue
    .run(route.engine, () => engineAsk(route, prompt, opts), { onQueued: opts.onQueued, location: route.location })
    .catch((err: unknown) => {
      const e = err as queue.BusyError;
      if (e.status === 429) throw e;
      throw err;
    });
  // Two queues, one number. A mini call can wait HERE for an admission slot and
  // then wait again in the job broker for a lane that serves its type; reporting
  // only the first would have hidden the 306s that miniAsk now measures, and
  // overwriting it with the first would hide it just as well. They add.
  const queuedMs = admitted.queuedMs + (admitted.value.queuedMs ?? 0);
  return { ...admitted.value, ...(queuedMs > 250 ? { queuedMs } : {}) };
}

/** Internal native call used by the durable business-intelligence orchestrator. */
export async function askModel(
  model: string,
  prompt: string,
  opts: { timeoutMs?: number; tools?: boolean } = {},
): Promise<AskResult> {
  return runAsk(resolveModel(model), prompt, opts);
}

async function engineAsk(
  route: Route,
  prompt: string,
  opts: { timeoutMs?: number; tools?: boolean; onDelta?: (chunk: string) => void } = {},
): Promise<AskResult> {
  if (route.location === 'mini') return miniAsk(route, prompt, opts);

  if (route.engine === 'agy') {
    // A dead session and a slow one are different problems with different fixes,
    // and the status code is the only part of this most clients will read.
    const out = await agy
      .ask(prompt, { timeoutMs: opts.timeoutMs ?? AGY_TIMEOUT_MS, tools: opts.tools })
      .catch((err: unknown) => {
        const e = err as { code?: string; message?: string };
        if (e.code === 'logged_out') throw fail(503, 'agy is not signed in: ' + e.message, 'engine_unavailable');
        if (e.code === 'not_installed') throw fail(503, e.message ?? 'agy is not installed.', 'engine_unavailable');
        if (e.code === 'timeout') throw fail(504, e.message ?? 'agy timed out.', 'timeout');
        throw fail(502, e.message ?? 'agy failed.', 'engine_error');
      });
    // agy's -p prints when it is done; there is no growing text to stream.
    opts.onDelta?.(out.answer);
    return { answer: out.answer, ms: out.ms, model: route.model, engine: 'agy' };
  }

  // Two browser engines, one code path: they differ in which site they drive,
  // not in how a call to them can fail.
  const site = route.engine === 'meta' ? 'Meta AI' : 'ChatGPT';
  const drive = route.engine === 'meta' ? meta.ask : sessions.ask;
  const out = (await drive(route.session, prompt, {
    timeoutMs: opts.timeoutMs ?? timeoutFor(route),
    fresh: true,
    onDelta: opts.onDelta,
  }).catch((err: unknown) => {
    const e = err as { code?: string; message?: string };
    const message = e.message ?? `the ${site} session failed.`;
    if (e.code === 'logged_out') throw fail(503, message, 'engine_unavailable');
    if (/bad session id|no profile directory/i.test(message)) throw fail(404, message, 'model_not_found');
    throw fail(502, message, 'engine_error');
  })) as { answer?: string; ms?: number; settled?: boolean };

  const answer = str(out.answer);
  if (!answer) {
    throw fail(
      502,
      `the ${site} session produced no text. GET /api/cgpt/:id/frame shows what it is looking at.`,
      'engine_error',
    );
  }
  return { answer, ms: num(out.ms, 0), model: route.model, engine: route.engine, settled: out.settled === true };
}

// ---------------------------------------------------------------------------
// The OpenAI shape
// ---------------------------------------------------------------------------

const completionId = (): string => 'chatcmpl-' + crypto.randomUUID().replace(/-/g, '');

function usage(prompt: string, answer: string): Record<string, unknown> {
  const prompt_tokens = estimateTokens(prompt);
  const completion_tokens = estimateTokens(answer);
  return { prompt_tokens, completion_tokens, total_tokens: prompt_tokens + completion_tokens, estimated: true };
}

function completionBody(id: string, result: AskResult, prompt: string, ignored: string[]): Record<string, unknown> {
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: result.answer },
        // `length` is the truthful answer when a ChatGPT reply was still growing
        // as the clock ran out: the text is real, but it is not the whole reply.
        finish_reason: result.settled === false ? 'length' : 'stop',
      },
    ],
    usage: usage(prompt, result.answer),
    agy_lab: {
      engine: result.engine,
      ms: result.ms,
      ...(result.queuedMs ? { queuedMs: result.queuedMs } : {}),
      ...(result.settled === undefined ? {} : { settled: result.settled }),
      ...(ignored.length ? { ignored } : {}),
    },
  };
}

function sseOpen(res: http.ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    // Railway's edge buffers a response it takes for a document. Without this the
    // whole stream lands at once, which is the one thing streaming exists to avoid.
    'x-accel-buffering': 'no',
  });
}

function sseSend(res: http.ServerResponse, data: unknown): void {
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

function chunkBody(
  id: string,
  model: string,
  delta: Record<string, unknown>,
  finish: string | null,
): Record<string, unknown> {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

async function chatCompletions(req: http.IncomingMessage, res: http.ServerResponse, ctx: Ctx): Promise<void> {
  const body = await ctx.readJson(req);
  if (num(body.n, 1) !== 1) throw fail(400, 'n>1 is not supported: each call is one real model run, not a sample.');

  const route = resolveModel(str(body.model));
  const prompt = promptFromMessages(body.messages);
  const timeoutMs = num(body.timeoutMs ?? body.timeout_ms, timeoutFor(route));
  const ignored = IGNORABLE.filter((k) => body[k] !== undefined);
  const id = completionId();
  log.note(req, { engine: route.engine, model: route.model, stream: body.stream === true });
  log.notePrompt(req, prompt);

  if (body.stream !== true) {
    const result = await runAsk(route, prompt, { timeoutMs, tools: body.tools === true });
    noteResult(req, result);
    ctx.json(res, 200, completionBody(id, result, prompt, ignored));
    return;
  }

  // Streaming. From here the status line is already sent, so an engine failure can
  // no longer be an HTTP error: it goes down the stream as a final chunk carrying
  // the reason, which is the only form a client still reading will ever see.
  sseOpen(res);
  sseSend(res, chunkBody(id, route.model, { role: 'assistant', content: '' }, null));
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  // A queued call can sit for a minute before the engine says anything. An SSE
  // connection that silent gets closed by an intermediary that assumes it died, so
  // the wait is narrated in comment lines - ignored by every SSE client, and
  // enough traffic to keep the socket honest.
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stopHeartbeat = (): void => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  };
  try {
    const result = await runAsk(route, prompt, {
      timeoutMs,
      tools: body.tools === true,
      onQueued: (info) => {
        if (aborted) return;
        res.write(': queued ahead=' + info.ahead + ' eta=' + Math.ceil(info.estimatedWaitMs / 1000) + 's\n\n');
        heartbeat = setInterval(() => {
          if (aborted) return stopHeartbeat();
          res.write(': waiting\n\n');
        }, 15_000);
      },
      onDelta: (chunk) => {
        stopHeartbeat();
        if (!aborted && chunk) sseSend(res, chunkBody(id, route.model, { content: chunk }, null));
      },
    });
    stopHeartbeat();
    noteResult(req, result);
    if (aborted) return void res.end();
    sseSend(res, chunkBody(id, result.model, {}, result.settled === false ? 'length' : 'stop'));
    sseSend(res, {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: result.model,
      choices: [],
      usage: usage(prompt, result.answer),
      agy_lab: {
        engine: result.engine,
        ms: result.ms,
        ...(result.queuedMs ? { queuedMs: result.queuedMs } : {}),
        ...(ignored.length ? { ignored } : {}),
      },
    });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: unknown) {
    stopHeartbeat();
    const e = err as HttpError & { retryAfterSec?: number; queue?: unknown };
    log.noteError(req, e);
    sseSend(res, {
      error: {
        message: e.message,
        type: e.type ?? 'engine_error',
        code: e.status ?? 502,
        ...(e.retryAfterSec ? { retry_after: e.retryAfterSec } : {}),
      },
    });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

/** One place that copies an answer's shape into the log record. */
function noteResult(req: http.IncomingMessage, result: AskResult): void {
  log.note(req, {
    engine: result.engine,
    model: result.model,
    answerChars: result.answer.length,
    engineMs: result.ms,
    ...(result.queuedMs ? { queuedMs: result.queuedMs } : {}),
  });
}

// ---------------------------------------------------------------------------
// The native shape
// ---------------------------------------------------------------------------

async function nativeAsk(req: http.IncomingMessage, res: http.ServerResponse, ctx: Ctx): Promise<void> {
  const body = await ctx.readJson(req);
  const route = resolveModel(str(body.model ?? body.engine));
  const prompt = body.messages ? promptFromMessages(body.messages) : str(body.prompt).trim();
  if (!prompt) throw fail(400, 'prompt is required (or messages).');
  log.note(req, { engine: route.engine, model: route.model });
  log.notePrompt(req, prompt);
  const result = await runAsk(route, prompt, {
    timeoutMs: num(body.timeoutMs, timeoutFor(route)),
    tools: body.tools === true,
  });
  noteResult(req, result);
  ctx.json(res, 200, {
    model: result.model,
    engine: result.engine,
    answer: result.answer,
    ms: result.ms,
    ...(result.queuedMs ? { queuedMs: result.queuedMs } : {}),
    ...(result.settled === undefined ? {} : { settled: result.settled }),
  });
}

// ---------------------------------------------------------------------------

/** Returns true when it handled the request. */
export async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  ctx: Ctx,
): Promise<boolean> {
  const p = url.pathname.replace(/^\/api\/v1\//, '/v1/');
  const method = req.method ?? 'GET';
  try {
    if (method === 'GET' && (p === '/v1/models' || p === '/api/models')) {
      ctx.json(res, 200, models());
      return true;
    }
    // What the queue is doing right now: running, waiting, spacing, and how much
    // of each engine's hourly allowance is gone. The thing to look at when a call
    // comes back 429 or takes a minute to start.
    if (method === 'GET' && p === '/api/queue') {
      ctx.json(res, 200, queue.snapshot());
      return true;
    }
    if (method === 'POST' && p === '/v1/chat/completions') {
      await chatCompletions(req, res, ctx);
      return true;
    }
    if (method === 'POST' && p === '/api/ask') {
      await nativeAsk(req, res, ctx);
      return true;
    }
    return false;
  } catch (err: unknown) {
    const e = err as HttpError & { retryAfterSec?: number; queue?: Record<string, unknown> };
    log.noteError(req, e);
    if (res.headersSent) {
      res.end();
      return true;
    }
    // Retry-After is the part a client can act on without reading prose, and the
    // queue snapshot is the part a human can. A 429 carries both.
    if (e.retryAfterSec) res.setHeader('retry-after', String(e.retryAfterSec));
    ctx.json(res, e.status ?? 500, {
      error: {
        message: e.message ?? String(err),
        type: e.type ?? 'server_error',
        code: e.status ?? 500,
        ...(e.retryAfterSec ? { retry_after: e.retryAfterSec } : {}),
      },
      ...(e.queue ? { queue: e.queue } : {}),
    });
    return true;
  }
}

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

type Route = { engine: 'agy'; model: string } | { engine: 'chatgpt'; model: string; session: string };

/**
 * Which ChatGPT account a bare `chatgpt` means.
 *
 * A ready session wins over a merely listed one: sessions outlive their logins
 * here, and routing to a signed-out profile produces a 503 for a request that a
 * working account beside it could have answered.
 */
function defaultSession(): string {
  const pinned = process.env.CGPT_DEFAULT_SESSION?.trim();
  if (pinned) return pinned;
  const all = sessions.list().filter((s) => s.initialized);
  const pick = all.find((s) => s.lastProbe?.status === 'ready') ?? all[0];
  if (!pick) {
    throw fail(503, 'No ChatGPT session exists yet. Create one with POST /api/cgpt, then /login.', 'no_session');
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
  const wanted = str(raw).trim();
  if (!wanted || wanted.toLowerCase() === 'auto') {
    const fallback = process.env.DEFAULT_MODEL?.trim();
    return resolveModel(!fallback || fallback.toLowerCase() === 'auto' ? 'agy' : fallback);
  }
  const [head, ...rest] = wanted.split(/[:/]/);
  const name = (head ?? '').toLowerCase();
  if (name === 'agy' || name === 'antigravity') return { engine: 'agy', model: 'agy' };
  if (name === 'chatgpt' || name === 'openai' || /^(gpt|o[134])/.test(name)) {
    const session = rest.join(':').trim() || defaultSession();
    return { engine: 'chatgpt', model: 'chatgpt:' + session, session };
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
  const cgpt = sessions.list().filter((s) => s.initialized);
  return {
    object: 'list',
    data: [
      entry('agy', { engine: 'agy' }),
      ...cgpt.map((s) =>
        entry('chatgpt:' + s.id, {
          engine: 'chatgpt',
          label: s.label,
          ready: s.lastProbe?.status === 'ready',
          lastProbe: s.lastProbe,
        }),
      ),
      ...(cgpt.length ? [entry('chatgpt', { engine: 'chatgpt', alias_for: 'chatgpt:' + defaultSession() })] : []),
    ],
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
  engine: 'agy' | 'chatgpt';
  /** ChatGPT only: false means the answer stopped growing because time ran out, not because it finished. */
  settled?: boolean;
}

async function runAsk(
  route: Route,
  prompt: string,
  opts: { timeoutMs?: number; tools?: boolean; onDelta?: (chunk: string) => void } = {},
): Promise<AskResult> {
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

  const out = (await sessions
    .ask(route.session, prompt, { timeoutMs: opts.timeoutMs ?? CGPT_TIMEOUT_MS, fresh: true, onDelta: opts.onDelta })
    .catch((err: unknown) => {
      const e = err as { code?: string; message?: string };
      const message = e.message ?? 'the ChatGPT session failed.';
      if (e.code === 'logged_out') throw fail(503, message, 'engine_unavailable');
      if (/bad session id|no profile directory/i.test(message)) throw fail(404, message, 'model_not_found');
      throw fail(502, message, 'engine_error');
    })) as { answer?: string; ms?: number; settled?: boolean };

  const answer = str(out.answer);
  if (!answer) {
    throw fail(
      502,
      'the ChatGPT session produced no text. GET /api/cgpt/:id/frame shows what it is looking at.',
      'engine_error',
    );
  }
  return { answer, ms: num(out.ms, 0), model: route.model, engine: 'chatgpt', settled: out.settled === true };
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
  const timeoutMs = num(
    body.timeoutMs ?? body.timeout_ms,
    route.engine === 'agy' ? AGY_TIMEOUT_MS : CGPT_TIMEOUT_MS,
  );
  const ignored = IGNORABLE.filter((k) => body[k] !== undefined);
  const id = completionId();

  if (body.stream !== true) {
    const result = await runAsk(route, prompt, { timeoutMs, tools: body.tools === true });
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
  try {
    const result = await runAsk(route, prompt, {
      timeoutMs,
      tools: body.tools === true,
      onDelta: (chunk) => {
        if (!aborted && chunk) sseSend(res, chunkBody(id, route.model, { content: chunk }, null));
      },
    });
    if (aborted) return void res.end();
    sseSend(res, chunkBody(id, result.model, {}, result.settled === false ? 'length' : 'stop'));
    sseSend(res, {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: result.model,
      choices: [],
      usage: usage(prompt, result.answer),
      agy_lab: { engine: result.engine, ms: result.ms, ...(ignored.length ? { ignored } : {}) },
    });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: unknown) {
    const e = err as HttpError;
    sseSend(res, { error: { message: e.message, type: e.type ?? 'engine_error', code: e.status ?? 502 } });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

// ---------------------------------------------------------------------------
// The native shape
// ---------------------------------------------------------------------------

async function nativeAsk(req: http.IncomingMessage, res: http.ServerResponse, ctx: Ctx): Promise<void> {
  const body = await ctx.readJson(req);
  const route = resolveModel(str(body.model ?? body.engine));
  const prompt = body.messages ? promptFromMessages(body.messages) : str(body.prompt).trim();
  if (!prompt) throw fail(400, 'prompt is required (or messages).');
  const result = await runAsk(route, prompt, {
    timeoutMs: num(body.timeoutMs, route.engine === 'agy' ? AGY_TIMEOUT_MS : CGPT_TIMEOUT_MS),
    tools: body.tools === true,
  });
  ctx.json(res, 200, {
    model: result.model,
    engine: result.engine,
    answer: result.answer,
    ms: result.ms,
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
    const e = err as HttpError;
    if (res.headersSent) {
      res.end();
      return true;
    }
    ctx.json(res, e.status ?? 500, {
      error: { message: e.message ?? String(err), type: e.type ?? 'server_error', code: e.status ?? 500 },
    });
    return true;
  }
}

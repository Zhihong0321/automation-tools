// The opencode CLI, pinned to muse 1.2, as a worker job.
//
// This replaces meta-ego.mjs. Meta AI was never activated on this machine — no
// ego lite profile ever held a facebook.com or meta.ai cookie, so every route to
// it ended at an interactive Facebook login nobody was going to sit through at
// 3am. muse 1.2 is served through opencode's own provider and answers the same
// model without a browser, a profile or a session to keep signed in.
//
// It still answers under the `meta.*` job types, because those are what the
// deployed gateway knows how to reach (`meta@mini` in GET /v1/models). The
// engine changed; the address did not. See worker/README.md.
//
// WHY A SCRATCH CWD. opencode is a coding agent, not a chat endpoint: it reads
// the directory it starts in and will happily describe, or offer to edit, the
// repo the worker was launched from. Answers here are supposed to be about the
// prompt and nothing else, so it runs in an empty directory of its own — the
// same reasoning that makes agy.mjs run from the home directory.
//
// Tool use is never auto-approved. `opencode run --auto` approves every
// permission with nobody watching, on a machine sitting on the home network.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BIN = process.env.OPENCODE_BIN ?? 'opencode';
const MODEL = process.env.MUSE_MODEL ?? 'opencode/muse-spark-1.2-contributor-free';
const DEFAULT_TIMEOUT_MS = Number(process.env.MUSE_TIMEOUT_MS ?? 180_000);
const CWD = process.env.MUSE_CWD ?? path.join(os.homedir(), '.gmap-worker', 'muse-cwd');

/** Everything opencode prints that means "this account cannot call the model". */
const NOT_AUTHED = /unauthor|forbidden|not (?:signed|logged) in|no credentials|api key|authenticate|quota|rate limit/i;

/**
 * Run one prompt through `opencode run --format json`.
 *
 * The JSON stream is the contract rather than the pretty output: the default
 * format prints an ANSI banner naming the model above the answer, and stripping
 * a banner by pattern is the kind of thing that silently starts returning the
 * banner. Events arrive as NDJSON; the `text` parts in order are the answer.
 */
export async function ask(payload = {}) {
  const prompt = String(payload.prompt ?? '').trim();
  if (!prompt) throw new Error('meta.ask needs a prompt');
  const timeoutMs = Number(payload.timeoutMs) > 0 ? Number(payload.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const model = String(payload.model ?? MODEL);

  fs.mkdirSync(CWD, { recursive: true });

  const startedAt = Date.now();
  const { code, stdout, stderr, timedOut } = await run(
    ['run', '--dir', CWD, '--format', 'json', '-m', model, prompt],
    timeoutMs,
  );
  const ms = Date.now() - startedAt;

  if (timedOut) {
    throw Object.assign(new Error(`muse did not finish within ${Math.round(timeoutMs / 1000)}s`), { code: 'answer_timeout' });
  }

  const { answer, error, finish } = parseEvents(stdout);

  if (error) {
    throw Object.assign(new Error(error), { code: NOT_AUTHED.test(error) ? 'signed_out' : 'engine_error' });
  }
  if (!answer) {
    // Exit code alone is not enough — opencode can exit 0 having emitted only a
    // step_finish, which is a refusal or an empty turn, not a transport failure.
    const detail = firstLine(stderr) || `opencode exited ${code} without an answer`;
    throw Object.assign(new Error(detail), { code: NOT_AUTHED.test(stderr) ? 'signed_out' : 'engine_error' });
  }

  return {
    engine: 'muse',
    model,
    answer,
    ms,
    at: new Date().toISOString(),
    ...(finish ? { finish } : {}),
    ...(stderr.trim() ? { stderr: firstLine(stderr) } : {}),
  };
}

/**
 * Is muse usable right now?
 *
 * One real model call, for the reason agy.mjs gives: an opencode that is
 * installed and an opencode whose provider will actually serve this model are
 * different claims, and a caller about to route work here needs the second.
 */
export async function probe(payload = {}) {
  const startedAt = Date.now();
  try {
    const out = await ask({ prompt: 'Reply with exactly one word: ok', timeoutMs: Number(payload.timeoutMs) || 90_000 });
    return { status: 'ready', engine: 'muse', model: out.model, detail: `answered in ${out.ms}ms`, sample: out.answer.slice(0, 80), ms: Date.now() - startedAt };
  } catch (err) {
    return { status: err.code === 'signed_out' ? 'signed_out' : 'unknown', engine: 'muse', detail: err.message, ms: Date.now() - startedAt };
  }
}

/** NDJSON in, the assistant's text out. Unparseable lines are skipped, not fatal. */
function parseEvents(stdout) {
  const text = [];
  let error = null;
  let finish = null;
  for (const line of String(stdout).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(trimmed); } catch { continue; }
    if (ev.type === 'text' && ev.part?.text) text.push(ev.part.text);
    else if (ev.type === 'error') error = ev.error?.message ?? ev.part?.message ?? JSON.stringify(ev).slice(0, 300);
    else if (ev.type === 'step_finish') finish = ev.part?.reason ?? null;
  }
  return { answer: text.join('').trim(), error, finish };
}

function run(args, timeoutMs) {
  return new Promise((resolve) => {
    // opencode is installed beside node under nvm, which a launchd job does not
    // inherit — the same gap ~/.local/bin is for ego-browser.
    const PATH_ = `${path.dirname(process.execPath)}:${process.env.HOME}/.local/bin:${process.env.PATH ?? ''}`;
    const child = spawn(BIN, args, {
      cwd: CWD,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: PATH_, CI: '1', NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: `${stderr}\ncould not run ${BIN}: ${err.message}`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr, timedOut });
    });
  });
}

function firstLine(text, limit = 300) {
  const line = String(text).split(/\r?\n/).find((l) => l.trim()) ?? String(text);
  return line.length > limit ? `${line.slice(0, limit)}...` : line.trim();
}

// Standalone, so this can be proven on the mini before anything routes to it:
//   node worker/muse.mjs probe
//   node worker/muse.mjs ask "capital of Malaysia? one word"
if (import.meta.filename === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    const out = cmd === 'ask' ? await ask({ prompt: rest.join(' ') }) : await probe();
    console.log(JSON.stringify(out, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.code ?? 'engine_error', error: error.message }, null, 2));
    process.exit(1);
  }
}

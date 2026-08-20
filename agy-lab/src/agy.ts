// Everything that knows what agy is: where it installs, how to ask it whether it
// is signed in, and what its answers mean.
//
// The four health states are lifted from the session-monitor in gmap-recon, and
// for the same reason: `ok | broken` collapses "could not tell" into "logged
// out", which sends a human to re-authenticate for nothing. Here it would also
// corrupt the experiment — a container that failed to allocate a pty is not a
// container that failed to authenticate, and the whole point is to tell them apart.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import * as pty from './pty.ts';

const execFileAsync = promisify(execFile);

export const HOME = process.env.HOME ?? '/data';
export const BIN_DIR = path.join(HOME, '.local', 'bin');
export const BIN = path.join(BIN_DIR, 'agy');
/** agy's own appDataDir: settings, conversations, and - with no keyring - credentials. */
export const APP_DATA = path.join(HOME, '.gemini', 'antigravity-cli');

export const INSTALL_CMD = 'curl -fsSL https://antigravity.google/cli/install.sh | bash';

export type Health = 'ready' | 'logged_out' | 'not_installed' | 'unknown';

export interface Status {
  installed: boolean;
  bin: string | null;
  version: string | null;
  home: string;
  appData: string;
  /** True when a D-Bus session bus exists. It will not: containers have none, which
   *  is exactly why agy falls back to a file credential store here. */
  dbus: boolean;
  /** Which auth route the environment is set up for, before any probe runs. */
  configured: { geminiApiKey: boolean; modelProvider: string | null; adc: boolean };
  volume: { path: string; mounted: boolean };
}

function has(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export async function version(): Promise<string | null> {
  // `agy --help` lists no --version flag; `changelog` prints the current release
  // first. Cheapest signal available, and never fatal - an unknown version is
  // cosmetic, a wrong auth verdict is not.
  try {
    const { stdout } = await execFileAsync(BIN, ['changelog'], { timeout: 20_000, maxBuffer: 1 << 22 });
    return /^\s*v?(\d+\.\d+\.\d+)/m.exec(stdout)?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function status(): Promise<Status> {
  const installed = has(BIN);
  let modelProvider: string | null = null;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(APP_DATA, 'settings.json'), 'utf8')) as { modelProvider?: string };
    modelProvider = s.modelProvider ?? null;
  } catch {
    /* no settings yet - agy writes it on first run */
  }
  return {
    installed,
    bin: installed ? BIN : null,
    version: installed ? await version() : null,
    home: HOME,
    appData: APP_DATA,
    dbus: Boolean(process.env.DBUS_SESSION_BUS_ADDRESS) || has('/run/dbus/system_bus_socket'),
    configured: {
      geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
      modelProvider,
      adc: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    },
    volume: { path: HOME, mounted: has(path.join(HOME, '.railway-volume-marker')) || isMount(HOME) },
  };
}

/** A volume shows up as its own device; the image layer shares the root device. */
function isMount(p: string): boolean {
  try {
    return fs.statSync(p).dev !== fs.statSync('/').dev;
  } catch {
    return false;
  }
}

/**
 * The auth probe: one real, tool-free model call.
 *
 * Nothing short of using the credentials proves they are still good — agy caches
 * a token that the log shows expiring roughly every 35 minutes, so "a token file
 * exists" is not the same claim as "the session works". Deliberately no
 * --dangerously-skip-permissions: a prompt asking only for the word OK calls no
 * tools, so it never reaches the permission gate, and the health check can never
 * become the thing that auto-approves a tool call.
 */
const AUTH_FAILURE = /not logged in|You are not logged into Antigravity|authentication required|not (?:authenticated|signed[- ]?in)|please (?:sign|log)[- ]?in|unauthenticated|401/i;

export interface ProbeResult {
  status: Health;
  detail: string;
  ms: number;
  at: string;
  stdout?: string;
}

export async function probe(timeoutMs = 120_000): Promise<ProbeResult> {
  const started = Date.now();
  const done = (s: Health, detail: string, stdout?: string): ProbeResult => ({
    status: s,
    detail,
    ms: Date.now() - started,
    at: new Date().toISOString(),
    ...(stdout ? { stdout } : {}),
  });

  if (!has(BIN)) return done('not_installed', `No binary at ${BIN}. Run Install first.`);

  const args = [
    '-p', 'Reply with exactly: OK',
    '--print-timeout', `${Math.max(1, Math.round(timeoutMs / 1000))}s`,
    '--output-format', 'text',
  ];
  try {
    const { stdout } = await execFileAsync(BIN, args, { timeout: timeoutMs + 15_000, maxBuffer: 8 << 20 });
    const text = stdout.trim();
    if (AUTH_FAILURE.test(text)) return done('logged_out', firstLine(text), text);
    if (!text) {
      // Known non-TTY behaviour, not a logout. Reporting it as one would send you
      // to re-authenticate a session that is fine.
      return done('unknown', 'agy exited 0 but printed nothing - non-TTY behaviour, not a logout.');
    }
    return done('ready', `Signed in. Answered in ${Date.now() - started}ms.`, text);
  } catch (err: unknown) {
    const e = err as { stderr?: unknown; stdout?: unknown; message?: string; code?: unknown; killed?: boolean };
    const detail =
      (typeof e.stderr === 'string' && e.stderr.trim()) ||
      (typeof e.stdout === 'string' && e.stdout.trim()) ||
      e.message ||
      String(err);
    if (e.code === 'ENOENT') return done('not_installed', `No binary at ${BIN}.`);
    if (AUTH_FAILURE.test(detail)) return done('logged_out', firstLine(detail), detail);
    if (e.killed) return done('unknown', `No answer within ${Math.round(timeoutMs / 1000)}s. Busy or wedged, not necessarily logged out.`);
    return done('unknown', firstLine(detail), detail);
  }
}

/**
 * Point agy at the Gemini API instead of a Google login.
 *
 * The documented headless route: GEMINI_API_KEY plus "modelProvider": "gemini" in
 * settings.json. The env var alone is not enough — the provider switch is what
 * makes the CLI stop reaching for a keyring session that a container does not have.
 */
export function setModelProvider(provider: string | null): { path: string; settings: unknown } {
  fs.mkdirSync(APP_DATA, { recursive: true });
  const file = path.join(APP_DATA, 'settings.json');
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    /* first write */
  }
  if (provider === null) delete settings.modelProvider;
  else settings.modelProvider = provider;
  // Write-then-rename so a kill mid-write leaves the previous good file, not a
  // truncated one agy will refuse to parse.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, file);
  return { path: file, settings };
}

export function firstLine(text: string, limit = 300): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
  return line.length > limit ? `${line.slice(0, limit)}...` : line.trim();
}

// ---------------------------------------------------------------------------
// Asking agy something, synchronously
// ---------------------------------------------------------------------------

/**
 * How many agy runs may be in flight at once.
 *
 * agy is a Node process with a language server behind it, in a 4GB container that
 * is also holding a headed Chrome. Two is the point where a burst of API calls
 * queues instead of racing the browser for memory — and the failure mode of
 * getting this wrong is the container restarting, which reads as every endpoint
 * breaking rather than as one prompt being greedy.
 */
const MAX_CONCURRENT = Math.max(1, Number(process.env.AGY_MAX_CONCURRENT ?? 2));
let inFlight = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

export interface AskOptions {
  timeoutMs?: number;
  /** --dangerously-skip-permissions. Off unless a caller asks: there is no per-tool allow flag. */
  tools?: boolean;
  /** agy's --output-format. `text` unless a caller wants agy's own json envelope. */
  format?: string;
}

export interface AskOutcome {
  answer: string;
  ms: number;
  /** Which mechanism produced the answer. `pty` means the plain run printed nothing. */
  via: 'exec' | 'pty';
}

export interface AskError extends Error {
  /** `logged_out` | `timeout` | `not_installed` | `empty` — what the caller should do about it. */
  code?: string;
}

function fail(code: string, message: string): AskError {
  return Object.assign(new Error(message), { code }) as AskError;
}

/**
 * One prompt in, one answer out, on the same call.
 *
 * /api/run starts a terminal session and hands back an id to poll, which is the
 * right shape for watching a long agent run and the wrong one for a tool that
 * wants an answer. This is the other shape. It reuses probe's execFile path
 * because that is the one measured to work in this container, and falls back to a
 * pty only for the one known failure it has: agy occasionally exits 0 having
 * printed nothing when nothing is attached to its stdout.
 */
export async function ask(prompt: string, opts: AskOptions = {}): Promise<AskOutcome> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const started = Date.now();
  if (!has(BIN)) throw fail('not_installed', `No agy binary at ${BIN}. POST /api/install first.`);

  const args = [
    '-p', prompt,
    '--print-timeout', `${Math.max(1, Math.round(timeoutMs / 1000))}s`,
    '--output-format', opts.format ?? 'text',
    ...(opts.tools === true ? ['--dangerously-skip-permissions'] : []),
  ];

  return withSlot(async () => {
    let text = '';
    try {
      const { stdout } = await execFileAsync(BIN, args, { timeout: timeoutMs + 15_000, maxBuffer: 32 << 20 });
      text = stdout.trim();
    } catch (err: unknown) {
      const e = err as { stderr?: unknown; stdout?: unknown; message?: string; code?: unknown; killed?: boolean };
      const detail =
        (typeof e.stderr === 'string' && e.stderr.trim()) ||
        (typeof e.stdout === 'string' && e.stdout.trim()) ||
        e.message ||
        String(err);
      if (e.code === 'ENOENT') throw fail('not_installed', `No agy binary at ${BIN}.`);
      if (AUTH_FAILURE.test(detail)) throw fail('logged_out', firstLine(detail));
      if (e.killed) throw fail('timeout', `agy gave no answer within ${Math.round(timeoutMs / 1000)}s.`);
      throw fail('failed', firstLine(detail));
    }
    if (text) return { answer: text, ms: Date.now() - started, via: 'exec' };

    // Empty and exit 0. Known non-TTY behaviour, not a logout — so retry the same
    // command through a terminal rather than reporting a blank answer as success.
    const command = pty.sh(BIN) + ' ' + args.map(pty.sh).join(' ') + ' 2>&1';
    const out = await pty.run(command, { timeoutMs: timeoutMs + 15_000, fakeSsh: true });
    const answer = out.output.trim();
    if (out.timedOut) throw fail('timeout', `agy gave no answer within ${Math.round(timeoutMs / 1000)}s.`);
    if (AUTH_FAILURE.test(answer)) throw fail('logged_out', firstLine(answer));
    if (!answer) throw fail('empty', 'agy exited 0 and printed nothing, twice - once piped and once on a terminal.');
    return { answer, ms: Date.now() - started, via: 'pty' };
  });
}

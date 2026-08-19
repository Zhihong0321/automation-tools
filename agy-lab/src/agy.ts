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

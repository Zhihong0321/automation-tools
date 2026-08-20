// A pseudo-terminal, without a native dependency.
//
// agy needs a real TTY to finish an OAuth login. Its own changelog is explicit:
// the authorization code is read "via the controlling terminal (/dev/tty on POSIX
// and CONIN$ on Windows) when stdin is consumed by a piped prompt", and "truly
// headless runs fail fast with an actionable message instead of blocking". A
// plain child_process.spawn hands it pipes, not a terminal, so the paste step can
// never complete that way — the run dies before it prints a URL worth pasting.
//
// node-pty is the usual answer and the wrong one here: it needs a C++ toolchain
// in the image and rebuilds every time Node's ABI moves. util-linux's `script`
// already allocates a pty, runs a command inside it, and forwards our stdin into
// it. That is the entire feature, from a package Debian ships anyway.
//
//   -q  no "Script started/done" banner polluting the output
//   -f  flush after every write, so output streams instead of landing in one
//       block when the process exits — the difference between watching a login
//       and staring at nothing for ninety seconds
//   /dev/null  discard the typescript file; we capture stdout ourselves
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

/** Keep the tail of the output. A TUI redraw can emit megabytes; nobody reads the middle. */
const MAX_BUFFER = 512 * 1024;

export interface SessionView {
  id: string;
  command: string;
  running: boolean;
  exitCode: number | null;
  startedAt: string;
  endedAt: string | null;
  bytes: number;
}

export class PtySession {
  id: string;
  command: string;
  startedAt: string;
  endedAt: string | null = null;
  exitCode: number | null = null;
  running = true;
  /** Resolves when the command has exited, so a caller can await a run instead of polling it. */
  done: Promise<void>;

  #resolveDone: (() => void) | null = null;
  #child: ChildProcessWithoutNullStreams;
  #chunks: Buffer[] = [];
  #bytes = 0;
  /** Bytes discarded off the front, so a client's offset stays meaningful after a trim. */
  #dropped = 0;

  constructor(id: string, command: string, env: Record<string, string>) {
    this.id = id;
    this.command = command;
    this.startedAt = new Date().toISOString();
    this.done = new Promise<void>((resolve) => {
      this.#resolveDone = resolve;
    });

    this.#child = spawn('script', ['-q', '-f', '-c', command, '/dev/null'], {
      env: { ...process.env, ...env },
      cwd: process.env.HOME ?? '/data',
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;

    // script merges the child's stderr into the pty, but its OWN errors (command
    // not found, no pty available) arrive on stderr. Fold them in so a failure to
    // start is visible in the same stream rather than silently dropped.
    this.#child.stdout.on('data', (b: Buffer) => this.#push(b));
    this.#child.stderr.on('data', (b: Buffer) => this.#push(b));

    this.#child.on('error', (err) => {
      this.#push(Buffer.from(`\n[agy-lab] failed to start: ${err.message}\n`));
      this.#finish(null);
    });
    this.#child.on('close', (code) => this.#finish(code));
  }

  #push(b: Buffer): void {
    this.#chunks.push(b);
    this.#bytes += b.length;
    while (this.#bytes > MAX_BUFFER && this.#chunks.length > 1) {
      const head = this.#chunks.shift()!;
      this.#bytes -= head.length;
      this.#dropped += head.length;
    }
  }

  #finish(code: number | null): void {
    if (!this.running) return;
    this.running = false;
    this.exitCode = code;
    this.endedAt = new Date().toISOString();
    this.#resolveDone?.();
  }

  /**
   * Write to the terminal. This is how the OAuth code gets pasted.
   *
   * The newline is the submit: agy is waiting on a line read, and a code without
   * it sits in the buffer forever looking exactly like a hung login.
   */
  write(text: string, newline = true): boolean {
    if (!this.running) return false;
    return this.#child.stdin.write(newline ? `${text}\n` : text);
  }

  /** Total bytes ever produced, including trimmed ones — the offset clients count against. */
  get total(): number {
    return this.#dropped + this.#bytes;
  }

  /** Output from `offset` onward. An offset inside the trimmed region snaps forward. */
  since(offset: number): { data: string; offset: number; truncated: boolean } {
    const from = Math.max(offset, this.#dropped);
    const buf = Buffer.concat(this.#chunks);
    const slice = buf.subarray(from - this.#dropped);
    return { data: slice.toString('utf8'), offset: this.total, truncated: from > offset };
  }

  kill(): void {
    if (!this.running) return;
    // SIGHUP, not SIGKILL: script owns the pty and should tear it down, otherwise
    // agy is orphaned still holding the terminal.
    this.#child.kill('SIGHUP');
    setTimeout(() => this.running && this.#child.kill('SIGKILL'), 3000).unref();
  }

  view(): SessionView {
    return {
      id: this.id,
      command: this.command,
      running: this.running,
      exitCode: this.exitCode,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      bytes: this.total,
    };
  }
}

const sessions = new Map<string, PtySession>();
let counter = 0;

/**
 * Start a command in a pty.
 *
 * `fakeSsh` sets the variables that make agy believe it is on a remote host.
 * That matters: the docs describe two different login behaviours — a local run
 * launches a browser (there is none here, so it hangs or fails), while an SSH run
 * "prints a unique authorization URL" for you to paste a code back into. The
 * second is the only one that can work in a container, and these variables are
 * how the detection is normally driven. Left toggleable because whether it is
 * sufficient is precisely what this harness exists to find out.
 */
export function start(command: string, opts: { fakeSsh?: boolean; env?: Record<string, string> } = {}): PtySession {
  const env: Record<string, string> = { TERM: 'xterm-256color', ...opts.env };
  if (opts.fakeSsh !== false) {
    env.SSH_CONNECTION = '10.0.0.2 52344 10.0.0.1 22';
    env.SSH_CLIENT = '10.0.0.2 52344 22';
    env.SSH_TTY = '/dev/pts/0';
  }
  const id = `s${++counter}`;
  const session = new PtySession(id, command, env);
  sessions.set(id, session);

  // Keep the last few for post-mortem, drop the rest. A dead session's output is
  // the whole point of running the experiment; unbounded retention is not.
  for (const [key, s] of sessions) {
    if (sessions.size <= 8) break;
    if (!s.running) sessions.delete(key);
  }
  return session;
}

export function get(id: string): PtySession | undefined {
  return sessions.get(id);
}

export function list(): SessionView[] {
  return [...sessions.values()].map((s) => s.view());
}

/** Shell-quote for the single string `script -c` hands to sh. */
export function sh(arg: string): string {
  return `'${arg.replace(/'/g, `'\''`)}'`;
}

/**
 * Run a command in a pty and wait for it, rather than streaming it to a browser.
 *
 * The interactive sessions above exist because a login needs a human mid-flight.
 * A prompt does not: it is one command whose whole output is the answer, and the
 * caller is an HTTP request that has to hold the connection open anyway. Same pty
 * for the same reason — agy behaves differently without a controlling terminal,
 * and "exits 0, prints nothing" is the shape that difference takes.
 */
export async function run(
  command: string,
  opts: { timeoutMs?: number; fakeSsh?: boolean; env?: Record<string, string> } = {},
): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> {
  const session = start(command, { fakeSsh: opts.fakeSsh, env: opts.env });
  let timedOut = false;
  const timer = opts.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        session.kill();
      }, opts.timeoutMs)
    : null;
  try {
    await session.done;
  } finally {
    if (timer) clearTimeout(timer);
  }
  return { output: clean(session.since(0).data), exitCode: session.exitCode, timedOut };
}

/**
 * Strip what the terminal added.
 *
 * A pty carries colour codes, cursor moves and carriage returns that no caller of
 * an API wants in a string it is about to parse. The patterns are built from char
 * codes instead of written as escapes: an escape lost in an edit leaves a regex
 * that silently matches nothing, and the damage then shows up as control bytes
 * inside an answer some other tool is parsing.
 */
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const CR = String.fromCharCode(13);
const CSI = new RegExp(ESC + '[[][0-9;?]*[ -/]*[@-~]', 'g');
const OSC = new RegExp(ESC + '[]][^' + BEL + ESC + ']*(' + BEL + '|' + ESC + '.)', 'g');
const LONE = new RegExp(ESC + '.', 'g');

export function clean(text: string): string {
  return text.replace(CSI, '').replace(OSC, '').replace(LONE, '').split(CR).join('').trim();
}

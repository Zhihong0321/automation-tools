// agy-lab: the HTTP surface.
//
// This binds 0.0.0.0 because Railway requires it, and it exposes a shell endpoint
// because finding out where a credential lands is not a thing you can do through
// a fixed API. Those two facts together are why LAB_TOKEN is mandatory and the
// process refuses to start without it. There is no "dev mode" that skips it: an
// open /api/exec on a public hostname is a root shell for whoever scans the port
// first, and this container will be holding a live Google session.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import * as agy from './agy.ts';
import * as pty from './pty.ts';
import * as snap from './snapshot.ts';
import * as browser from './browser.ts';
import * as cgpt from './cgptroutes.ts';
import * as gateway from './gateway.ts';
import * as jobs from './jobs.ts';
import * as queue from './queue.ts';
import * as log from './logstore.ts';
import * as intel from './intel.ts';
import * as reportdb from './reportdb.ts';
import { page } from './ui.ts';
import { page as docsPage } from './docs.ts';
import { document as openApiDocument } from './openapi.ts';
import { page as portalPage } from './portal.ts';
import { page as guidePage } from './guide.ts';

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.LAB_TOKEN ?? '';
const PORTAL_TOKEN = process.env.PORTAL_TOKEN?.trim() ?? '';

if (TOKEN.length < 16) {
  console.error('LAB_TOKEN is missing or shorter than 16 characters. Refusing to start.');
  console.error('Set it in the Railway service variables, then redeploy.');
  process.exit(1);
}

/** Snapshots by label, so a login can be diffed against the state before it. */
const snapshots = new Map<string, snap.Snapshot>();

const STARTED_AT = new Date().toISOString();
/** Survives only until the next restart, which is exactly the window it describes. */
let lastCrash: { kind: string; message: string; at: string } | null = null;

/**
 * Stay up, and say what happened.
 *
 * An unhandled rejection is fatal by default in modern Node, and this process
 * drives browsers whose pages close under it at unpredictable moments — so the
 * default turns "a screenshot lost its page" into "the container restarted and
 * every endpoint 502s". Surviving is the right trade here: this is a research
 * harness whose job is to still be answering when something else broke, and a
 * recorded crash you can read beats a clean exit you cannot.
 */
for (const kind of ['unhandledRejection', 'uncaughtException'] as const) {
  process.on(kind, (err: unknown) => {
    const message = (err as Error)?.stack ?? String(err);
    lastCrash = { kind, message: message.slice(0, 2000), at: new Date().toISOString() };
    console.error(`[${kind}] ${message}`);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/** Hash both sides first, so timingSafeEqual never sees mismatched lengths. */
function authorized(req: http.IncomingMessage, url: URL): boolean {
  const header = req.headers.authorization ?? '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : (url.searchParams.get('token') ?? '');
  const digest = (value: string): Buffer => crypto.createHash('sha256').update(value).digest();
  if (crypto.timingSafeEqual(digest(supplied), digest(TOKEN))) return true;
  const productRoute = url.pathname.startsWith('/api/reports')
    || url.pathname.startsWith('/api/business-search')
    || url.pathname.startsWith('/api/company-research')
    || url.pathname.startsWith('/api/person-research');
  return productRoute && PORTAL_TOKEN.length >= 16
    && crypto.timingSafeEqual(digest(supplied), digest(PORTAL_TOKEN));
}

// 1 MB is the right cap for a prompt or a lead. It is the wrong cap for a worker
// handing back a finished crawl: ads research returns its creatives inline, because
// the images live on the mini's disk and there is no blob store between the two.
// Only the result route gets the larger ceiling, and only workers can reach it.
const RESULT_ROUTE = /^\/api\/jobs\/[^/]+\/result(\?|$)/;
const BODY_LIMIT = 1 << 20;
const RESULT_LIMIT = Number(process.env.RESULT_BODY_LIMIT ?? 32 << 20);

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const cap = RESULT_ROUTE.test(req.url ?? '') ? RESULT_LIMIT : BODY_LIMIT;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > cap) throw new Error(`body too large (over ${Math.round(cap / (1 << 20))}MB)`);
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('body is not valid JSON');
  }
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const server = http.createServer((req, res) => {
  void handle(req, res).catch((err: unknown) => {
    json(res, 500, { error: (err as Error).message ?? String(err) });
  });
});

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://' + (req.headers.host ?? 'localhost'));
  const p = url.pathname;
  const method = req.method ?? 'GET';

  // Railway's healthcheck has no token and must never be given one.
  if (p === '/healthz') return json(res, 200, { ok: true, at: new Date().toISOString() });

  // The shell is public; every byte of data behind it is not. The page prompts for
  // the token and sends it with each call.
  if (method === 'GET' && (p === '/' || p === '/index.html')) {
    const html = page();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return void res.end(html);
  }

  // The API reference, served by the deploy it documents so the two cannot drift.
  // Public for the same reason the console is: it describes the surface, and the
  // token is what actually guards it.
  if (method === 'GET' && (p === '/docs' || p === '/docs.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return void res.end(docsPage());
  }

  if (method === 'GET' && (p === '/research' || p === '/research/' || p === '/portal')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
    return void res.end(portalPage());
  }

  // The end-user guide. Public like the portal shell it explains, and for the same
  // reason: it holds no credential, and it is the page you send someone *before*
  // they have a key. noindex because the workspace it describes is private.
  if (method === 'GET' && (p === '/guide' || p === '/guide.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
    return void res.end(guidePage());
  }

  if (method === 'GET' && p === '/openapi.json') {
    return json(res, 200, openApiDocument);
  }

  // Published reports are deliberately outside the bearer-token gate. Their
  // opaque 20-character id is the share capability, and the page contains only
  // public business evidence. The authenticated API below creates and inspects
  // them; requesters can send the /r/:id link without also leaking LAB_TOKEN.
  if (await intel.handlePublic(req, res, url)) return;

  // /v1/* is the gateway - the OpenAI-shaped surface other tools point at. It sits
  // behind the same token because a bearer header is exactly what an OpenAI client
  // already sends, so pointing one here costs a base URL and nothing else.
  if (!p.startsWith('/api/') && !p.startsWith('/v1/')) return json(res, 404, { error: 'not found' });

  // Log from here down, before the auth gate, so a rejected token is recorded too:
  // a 401 nobody can see is how a misconfigured client stays misconfigured. The
  // record closes itself when the response does, whatever route handled it.
  //
  // The worker's own bookkeeping is the exception. Its long-poll is one request
  // every 25s, forever, from a machine that is supposed to be idle most of the
  // time, and its heartbeat is one more every 30s for as long as a job runs —
  // logged, they would be thousands of records a day burying every request
  // anyone actually cares about. Result posts and failures still land in the log.
  const workerChatter = (method === 'GET' && p === '/api/jobs/next')
    || (method === 'POST' && p === '/api/jobs/heartbeat');
  if (!workerChatter) {
    log.begin(req, url);
    res.on('finish', () => log.end(req, res.statusCode));
    res.on('close', () => log.end(req, res.statusCode));
  }

  if (!authorized(req, url)) {
    // An OpenAI client parses the error envelope and prints its message; a bare
    // {error: string} shows up there as [object Object].
    return p.startsWith('/v1/')
      ? json(res, 401, { error: { message: 'bad or missing token', type: 'invalid_request_error', code: 'invalid_api_key' } })
      : json(res, 401, { error: 'bad or missing token' });
  }

  // ---- business intelligence product API -------------------------------
  if (await intel.handleApi(req, res, url, { json, readJson })) return;

  // ---- the gateway ------------------------------------------------------
  // Before everything else, because this is the surface that has consumers: a
  // route added below must never shadow one that other tools are calling.
  if (await gateway.handle(req, res, url, { json, readJson })) return;

  // ---- ChatGPT sessions --------------------------------------------------
  // Delegated wholesale. These routes own a browser process each and have their
  // own locking discipline; interleaving them with the agy routes here would put
  // that discipline somewhere it is easy to miss.
  if (p.startsWith('/api/cgpt') || p === '/api/net') {
    if (await cgpt.handle(req, res, url, { json, readJson })) return;
  }

  // ---- the job broker -----------------------------------------------------
  // Work handed to a machine this service cannot reach. The Mac mini long-polls
  // /api/jobs/next from home, runs the job on a residential IP, and posts the
  // result back. See jobs.ts for why the direction is inverted.
  if (p === '/api/jobs' || p.startsWith('/api/jobs/')) {
    if (await jobs.handle(req, res, url, { json, readJson })) return;
  }

  // ---- logs ---------------------------------------------------------------
  // One record per request, newest first. ?errors=1 (or /api/logs/errors) is the
  // error log: everything that answered 4xx/5xx or recorded a failure.
  if (method === 'GET' && (p === '/api/logs' || p === '/api/logs/errors')) {
    const q = url.searchParams;
    const asNumber = (v: string | null): number | undefined => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
    try {
      return json(res, 200, {
        ...log.read({
          limit: asNumber(q.get('limit')),
          errorsOnly: p.endsWith('/errors') || q.get('errors') === '1',
          engine: q.get('engine') ?? undefined,
          status: asNumber(q.get('status')),
          since: q.get('since') ?? undefined,
          date: q.get('date') ?? undefined,
          path: q.get('path') ?? undefined,
        }),
        days: log.days(),
      });
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  }

  // ---- state -------------------------------------------------------------
  if (method === 'GET' && p === '/api/status') {
    return json(res, 200, {
      ...(await agy.status()),
      memory: browser.memory(),
      startedAt: STARTED_AT,
      uptimeSec: Math.round(process.uptime()),
      lastCrash,
      queue: queue.snapshot(),
      logs: log.stats(),
      sessions: pty.list(),
      snapshots: [...snapshots.keys()],
    });
  }

  if (method === 'POST' && p === '/api/probe') {
    const body = await readJson(req);
    return json(res, 200, await agy.probe(num(body.timeoutMs, 120_000)));
  }

  // ---- install -----------------------------------------------------------
  // Run through the pty like everything else: the installer prints progress and a
  // PATH warning worth seeing, and one streaming mechanism is easier to trust
  // than two.
  if (method === 'POST' && p === '/api/install') {
    const cmd = agy.INSTALL_CMD + ' 2>&1; echo "[exit $?]"; ls -la ' + pty.sh(agy.BIN_DIR) + ' 2>&1';
    return json(res, 202, pty.start(cmd, { fakeSsh: false }).view());
  }

  // ---- terminal sessions -------------------------------------------------
  if (method === 'POST' && p === '/api/session') {
    const body = await readJson(req);
    const command = str(body.command).trim();
    if (!command) return json(res, 400, { error: 'command is required' });
    const env = (body.env && typeof body.env === 'object' ? body.env : {}) as Record<string, string>;
    return json(res, 202, pty.start(command, { fakeSsh: body.fakeSsh !== false, env }).view());
  }

  // The login. Snapshot first, then start the run that triggers it.
  //
  // Print mode rather than the TUI on purpose: agy's changelog documents the
  // authorization code being read from the controlling terminal specifically in
  // `-p` runs, and a linear prompt-and-answer is legible in a browser in a way a
  // full-screen TUI redrawing over itself is not.
  if (method === 'POST' && p === '/api/login') {
    const body = await readJson(req);
    snapshots.set('pre-login', snap.take(agy.HOME));
    const timeout = num(body.timeoutMs, 900_000);
    const command =
      pty.sh(agy.BIN) + ' -p ' + pty.sh(str(body.prompt, 'Reply with exactly: OK')) +
      ' --print-timeout ' + Math.round(timeout / 1000) + 's --output-format text 2>&1';
    const s = pty.start(command, { fakeSsh: body.fakeSsh !== false });
    return json(res, 202, { ...s.view(), snapshot: 'pre-login' });
  }

  const sessionMatch = /^\/api\/session\/([a-z0-9]+)(\/input|\/kill)?$/.exec(p);
  if (sessionMatch) {
    const s = pty.get(sessionMatch[1]!);
    if (!s) return json(res, 404, { error: 'no such session' });

    if (method === 'GET' && !sessionMatch[2]) {
      const out = s.since(num(Number(url.searchParams.get('offset')), 0));
      return json(res, 200, { ...s.view(), ...out });
    }
    // Writing the OAuth code into a live terminal is the entire login flow.
    if (method === 'POST' && sessionMatch[2] === '/input') {
      const body = await readJson(req);
      const ok = s.write(str(body.text), body.newline !== false);
      return json(res, ok ? 200 : 409, { ...s.view(), written: ok });
    }
    if (method === 'POST' && sessionMatch[2] === '/kill') {
      s.kill();
      return json(res, 200, s.view());
    }
  }

  // ---- run a prompt ------------------------------------------------------
  if (method === 'POST' && p === '/api/run') {
    const body = await readJson(req);
    const prompt = str(body.prompt).trim();
    if (!prompt) return json(res, 400, { error: 'prompt is required' });
    const timeout = num(body.timeoutMs, 300_000);
    // Tools are opt-in per run. There is no narrower per-tool allow flag on the
    // command line, so --dangerously-skip-permissions is all-or-nothing: it must
    // be a deliberate choice each time, not a default that quietly auto-approves
    // whatever an agent decides to run inside a container holding a live session.
    const args =
      '-p ' + pty.sh(prompt) +
      ' --print-timeout ' + Math.round(timeout / 1000) + 's' +
      ' --output-format ' + str(body.format, 'text') +
      (body.tools === true ? ' --dangerously-skip-permissions' : '');
    return json(res, 202, pty.start(pty.sh(agy.BIN) + ' ' + args + ' 2>&1', { fakeSsh: true }).view());
  }

  // ---- research ----------------------------------------------------------
  if (method === 'POST' && p === '/api/exec') {
    const body = await readJson(req);
    const cmd = str(body.cmd).trim();
    if (!cmd) return json(res, 400, { error: 'cmd is required' });
    const timeout = num(body.timeoutMs, 60_000);
    return await new Promise<void>((resolve) => {
      exec(cmd, { timeout, maxBuffer: 8 << 20, cwd: agy.HOME, env: process.env }, (err, stdout, stderr) => {
        json(res, 200, {
          cmd,
          code: err ? ((err as { code?: number | string }).code ?? 1) : 0,
          killed: Boolean((err as { killed?: boolean } | null)?.killed),
          stdout,
          stderr,
        });
        resolve();
      });
    });
  }

  if (method === 'POST' && p === '/api/snapshot') {
    const body = await readJson(req);
    const label = str(body.label, 'now');
    const s = snap.take(str(body.root, agy.HOME));
    snapshots.set(label, s);
    return json(res, 200, { label, files: Object.keys(s).length });
  }

  if (method === 'GET' && p === '/api/snapshot/diff') {
    const from = snapshots.get(url.searchParams.get('from') ?? 'pre-login');
    if (!from) return json(res, 404, { error: 'no such snapshot', have: [...snapshots.keys()] });
    const toLabel = url.searchParams.get('to');
    const to = toLabel ? snapshots.get(toLabel) : snap.take(agy.HOME);
    if (!to) return json(res, 404, { error: 'no such snapshot', have: [...snapshots.keys()] });
    return json(res, 200, snap.diff(from, to));
  }

  if (method === 'GET' && p === '/api/file') {
    const file = url.searchParams.get('path');
    if (!file) return json(res, 400, { error: 'path is required' });
    try {
      // reveal=1 prints secrets verbatim. Off by default: the file we are hunting
      // for is a live token, and a browser tab is not a vault.
      return json(res, 200, snap.inspect(file, url.searchParams.get('reveal') === '1'));
    } catch (err) {
      return json(res, 404, { error: (err as Error).message });
    }
  }

  if (method === 'POST' && p === '/api/settings/provider') {
    const body = await readJson(req);
    const provider = body.provider === null ? null : str(body.provider, 'gemini');
    return json(res, 200, agy.setModelProvider(provider));
  }

  json(res, 404, { error: 'not found', path: p });
}

// A cwd that does not exist makes every exec fail with a bare ENOENT that reads
// like a missing binary. Cheap to rule out at boot rather than debug later.
fs.mkdirSync(agy.HOME, { recursive: true });

// Run outside the container and HOME is a real person's home directory, where
// this process will happily rewrite the settings.json of an agy they use daily.
// Loud, because it is not obvious until something has already been overwritten.
if (agy.HOME !== '/data') {
  console.warn('WARNING: HOME is ' + agy.HOME + ', not /data.');
  console.warn('This writes to a real home directory. Set HOME=/data unless you mean it.');
}

// Without this a bind failure is an unhandled 'error' event and a stack trace.
// Railway shows the last line of the log when a deploy fails to become healthy,
// so that line should say what went wrong rather than name a file in node:net.
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('Could not start: ' + err.message);
  process.exit(1);
});

/**
 * Nothing survives a restart mid-run, so say so instead of leaving the report at
 * `running` forever. See reportdb.reapAbandoned -- the restart that stranded
 * these runs is the same restart that gets here.
 */
function reapAbandonedRuns(staleMinutes: number): void {
  if (!reportdb.configured()) return;
  void reportdb.reapAbandoned(staleMinutes, intel.activeReports())
    .then((n) => { if (n) console.log('reaped ' + n + ' abandoned run(s) that no process was still working on'); })
    .catch((err: Error) => console.warn('could not reap abandoned runs: ' + err.message));
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('agy-lab listening on :' + PORT);
  console.log('  HOME     ' + agy.HOME);
  console.log('  agy      ' + (fs.existsSync(agy.BIN) ? agy.BIN : 'not installed yet - POST /api/install'));
  console.log('  appData  ' + agy.APP_DATA);
  // Age 0 at boot: this process owns no run yet, so anything non-terminal was
  // stranded by the restart that just happened.
  reapAbandonedRuns(0);
  // On the interval an age test IS needed, and a generous one -- a company
  // report can legitimately run for hours behind a busy serial worker lane, and
  // rounds heartbeat published_report.updated_at so a working run stays fresh.
  // unref so this timer never holds the process open.
  setInterval(() => reapAbandonedRuns(180), 15 * 60_000).unref();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // Close the browsers before the process goes. A Chrome killed with its profile
    // lock still held leaves a SingletonLock behind, and the next deploy opens to
    // "profile is already in use" on a profile nothing is using.
    void browser.releaseAll().finally(() => server.close(() => process.exit(0)));
  });
}

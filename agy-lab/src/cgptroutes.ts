// HTTP surface for the ChatGPT sessions, split out so server.ts stays readable.
//
// Logging in is scripted, not driven by hand — see login.ts. There was a
// click-on-a-screenshot remote control here and it is gone: a login is a fixed
// sequence of known fields, so aiming a mouse at a JPEG spent three round trips
// per step to do what filling a named input does in one, and missed silently
// whenever the frame was stale.
//
// GET /frame survives as a READ-ONLY diagnostic. When a scripted login stops on
// an unrecognised page, the only thing that answers "what is it actually showing"
// is a picture of it. Nothing accepts coordinates any more.
import type http from 'node:http';
import * as browser from './browser.ts';
import * as sessions from './sessions.ts';
import * as login from './login.ts';

export interface Ctx {
  json: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * What does the outside world see when this container connects?
 *
 * READ THE RESULT CAREFULLY. A bare fetch has no browser TLS fingerprint, sends no
 * browser headers and runs no JavaScript, so Cloudflare answers it with 403 and
 * `cf-mitigated: challenge` from ANY address — measured from a residential
 * connection whose real Chrome reaches ChatGPT fine. A 403 here is therefore not
 * evidence of a block; it is the expected reply to something that is obviously not
 * a browser.
 *
 * What this endpoint is actually for: the egress IP itself, and the DIFFERENCE
 * between mitigations. `challenge` means "prove you are a browser", which a real
 * Chrome can do. `block` means the address is refused outright, which no amount of
 * fingerprinting fixes and which a residential proxy is the only answer to.
 *
 * The real verdict comes from probing a session with the browser.
 */
async function netCheck(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { proxy: process.env.PROXY_URL ? 'configured' : 'none' };

  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(10_000) });
    out.egressIp = ((await r.json()) as { ip?: string }).ip;
  } catch (err) {
    out.egressIp = 'lookup failed: ' + firstLine((err as Error).message);
  }

  for (const url of ['https://chatgpt.com/', 'https://chatgpt.com/api/auth/session']) {
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      out[url] = {
        status: r.status,
        server: r.headers.get('server'),
        cfRay: r.headers.get('cf-ray'),
        cfMitigated: r.headers.get('cf-mitigated'),
        location: r.headers.get('location'),
      };
    } catch (err) {
      out[url] = { error: firstLine((err as Error).message) };
    }
  }
  return out;
}

/** Returns true when it handled the request. */
export async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  ctx: Ctx,
): Promise<boolean> {
  const p = url.pathname;
  const method = req.method ?? 'GET';
  const { json, readJson } = ctx;

  if (method === 'GET' && p === '/api/net') {
    json(res, 200, await netCheck());
    return true;
  }

  if (p === '/api/cgpt' && method === 'GET') {
    json(res, 200, { sessions: sessions.list(), open: browser.heldView(), idleMs: browser.IDLE_MS });
    return true;
  }

  if (p === '/api/cgpt' && method === 'POST') {
    const body = await readJson(req);
    const id = str(body.id).trim();
    if (!id) return reply(json, res, 400, { error: 'id is required' });
    json(res, 200, sessions.create(id, str(body.label) || undefined));
    return true;
  }

  const m = /^\/api\/cgpt\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,31})\/([a-z]+)$/.exec(p);
  if (!m) return false;
  const id = m[1]!;
  const action = m[2]!;

  // Every action below touches the browser, so every one of them counts as use.
  // Without this the idle sweeper would close a profile mid-login — and a login
  // that stops for an OTP can wait minutes for a human to read a phone.
  browser.touch(id);

  // Scripted login. Credentials arrive here, are typed into the page, and go out
  // of scope with the request: the profile keeps the resulting session cookies,
  // which is the point, and nothing keeps the password.
  if (method === 'POST' && action === 'login') {
    const body = await readJson(req);
    const email = str(body.email).trim();
    const password = str(body.password);
    if (!email || !password) return reply(json, res, 400, { error: 'email and password are required' });
    const out = await login.run(id, { email, password, otp: str(body.otp).trim() || undefined });
    // Record the outcome so the session list reflects it without a second probe.
    if (out.state === 'ready') await sessions.probe(id, { timeoutMs: 30_000, keepOpen: true });
    json(res, 200, out);
    return true;
  }

  // Resume a login that stopped for a code. The browser is still on that page, so
  // this continues the flow rather than starting it again.
  if (method === 'POST' && action === 'otp') {
    const body = await readJson(req);
    const code = str(body.code ?? body.otp).trim();
    if (!code) return reply(json, res, 400, { error: 'code is required' });
    const out = await login.otp(id, code);
    if (out.state === 'ready') await sessions.probe(id, { timeoutMs: 30_000, keepOpen: true });
    json(res, 200, out);
    return true;
  }

  if (method === 'POST' && action === 'probe') {
    const body = await readJson(req);
    json(res, 200, await sessions.probe(id, { timeoutMs: num(body.timeoutMs, 60_000), keepOpen: body.keepOpen === true }));
    return true;
  }

  if (method === 'POST' && action === 'open') {
    const body = await readJson(req);
    const target = str(body.url, sessions.TEMP_CHAT_URL);
    const out = await browser.withProfile(id, async () => {
      sessions.create(id);
      const { page } = await browser.acquire(id);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
      return { id, url: page.url(), title: await page.title().catch(() => '') };
    });
    json(res, 200, out);
    return true;
  }

  if (method === 'POST' && action === 'close') {
    await browser.withProfile(id, () => browser.release(id));
    json(res, 200, { id, open: false });
    return true;
  }

  if (method === 'POST' && action === 'delete') {
    await sessions.remove(id);
    json(res, 200, { id, deleted: true });
    return true;
  }

  // The live view. Sent as raw JPEG rather than base64 in JSON so the page can
  // point an <img> straight at it and let the browser handle decoding and caching.
  if (method === 'GET' && action === 'frame') {
    try {
      const buf = await browser.withProfile(id, async () => {
        const { page } = await browser.acquire(id);
        return page.screenshot({ type: 'jpeg', quality: 55 });
      });
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': buf.length, 'cache-control': 'no-store' });
      res.end(buf);
    } catch (err) {
      json(res, 503, { error: firstLine((err as Error).message) });
    }
    return true;
  }

  if (method === 'POST' && action === 'goto') {
    const body = await readJson(req);
    const target = str(body.url).trim();
    if (!target) return reply(json, res, 400, { error: 'url is required' });
    const out = await browser.withProfile(id, async () => {
      const { page } = await browser.acquire(id);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
      return { id, url: page.url(), title: await page.title().catch(() => '') };
    });
    json(res, 200, out);
    return true;
  }

  if (method === 'POST' && action === 'import') {
    const body = await readJson(req);
    const state = (body.state ?? body) as sessions.StorageState;
    if (!state || (!state.cookies && !state.origins)) {
      return reply(json, res, 400, { error: 'expected a Playwright storageState with cookies and/or origins' });
    }
    json(res, 200, await sessions.importState(id, state));
    return true;
  }

  if (method === 'GET' && action === 'export') {
    // Whole cookies, unredacted: the point of an export is to move a working
    // session somewhere else, and a redacted one moves nothing. Treat the response
    // as the credential it is.
    json(res, 200, await sessions.exportState(id));
    return true;
  }

  if (method === 'POST' && action === 'ask') {
    const body = await readJson(req);
    const prompt = str(body.prompt).trim();
    if (!prompt) return reply(json, res, 400, { error: 'prompt is required' });
    json(res, 200, await sessions.ask(id, prompt, num(body.timeoutMs, 180_000)));
    return true;
  }

  return false;
}

function reply(json: Ctx['json'], res: http.ServerResponse, status: number, body: unknown): boolean {
  json(res, status, body);
  return true;
}

function firstLine(text: string, limit = 300): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
  return line.length > limit ? `${line.slice(0, limit)}...` : line.trim();
}

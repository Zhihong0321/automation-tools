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

  // The observation layer. Everything the automation decides from, dumped from
  // the SERVER'S OWN browser — same withProfile/acquire path, same profile, same
  // launch args as /login uses. A fresh local Chrome is a different experiment
  // and its agreement proves nothing about this one.
  //
  // ?goto=<url>     navigate first (omit to inspect whatever is on screen now)
  // ?click=<sel>    click a selector, then dump what it produced
  // ?wait=<ms>      settle before reading, so a late-rendering page can be
  //                 sampled at several ages instead of guessed at
  //
  // ?click exists so each step of the flow can be advanced and OBSERVED from
  // here, without credentials and without a redeploy per question.
  if (method === 'GET' && action === 'dom') {
    const target = url.searchParams.get('goto');
    const clickSel = url.searchParams.get('click');
    const waitMs = Math.min(Number(url.searchParams.get('wait') ?? 0) || 0, 30_000);

    const out = await browser.withProfile(id, async () => {
      sessions.create(id);
      const { page } = await browser.acquire(id);
      if (target) await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      let clicked: string | null = null;
      if (clickSel) {
        clicked = await page
          .locator(clickSel)
          .first()
          .click({ timeout: 20_000 })
          .then(() => 'ok')
          .catch((e: Error) => 'FAILED: ' + e.message.split('\n')[0]!.slice(0, 120));
      }

      // ?steps=<json array> — drive the flow one action at a time and dump where
      // it ended up. This is the whole point of the debug layer: every remaining
      // screen can be reached and READ from here, so no screen has to be guessed
      // at and no question costs a redeploy.
      //
      // [{"fill":"input#x","value":"a@b.com","wait":800},{"click":"button:text-is(\"Continue\")","wait":3000}]
      //
      // Stops at the first failure and reports which step failed, because
      // continuing past a broken step only produces a confusing final state.
      const stepLog: unknown[] = [];
      const stepsRaw = url.searchParams.get('steps');
      // Keyboard events go to the focused page. Under Xvfb nothing else is
      // competing for focus, but a page that was never brought forward can still
      // swallow them silently - which looks exactly like a widget ignoring input.
      if (stepsRaw) await page.bringToFront().catch(() => {});
      if (stepsRaw) {
        let steps: Array<Record<string, unknown>> = [];
        try {
          const parsed: unknown = JSON.parse(stepsRaw);
          if (Array.isArray(parsed)) steps = parsed as Array<Record<string, unknown>>;
        } catch (e) {
          stepLog.push({ error: 'steps is not valid JSON: ' + (e as Error).message.slice(0, 80) });
        }
        for (const st of steps.slice(0, 20)) {
          const sel = typeof st.click === 'string' ? st.click : typeof st.fill === 'string' ? st.fill : null;
          try {
            if (typeof st.goto === 'string') {
              await page.goto(st.goto, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            } else if (typeof st.fill === 'string') {
              await page.locator(st.fill).first().fill(String(st.value ?? ''), { timeout: 15_000 });
            } else if (typeof st.click === 'string') {
              await page.locator(st.click).first().click({ timeout: 20_000 });
            } else if (typeof st.type === 'string') {
              // Real keystrokes. react-aria and similar widgets track their own
              // state and ignore a value written straight onto the element, so
              // fill() can leave the DOM looking right while the component still
              // believes the field is empty.
              await page.keyboard.type(st.type, { delay: typeof st.delay === 'number' ? st.delay : 80 });
            } else if (typeof st.selectall === 'boolean' && st.selectall) {
              await page.keyboard.press('ControlOrMeta+a');
              await page.keyboard.press('Delete');
            } else if (Array.isArray(st.mouse)) {
              // A real click at viewport coordinates. Two things a selector click
              // cannot do: land inside a CROSS-ORIGIN iframe — page.locator() does
              // not cross that boundary, and Cloudflare Turnstile lives in one — and
              // arrive as an actual mouse event through CDP rather than as an element
              // method, which is part of what a bot check reads.
              const mx = Number((st.mouse as unknown[])[0]);
              const my = Number((st.mouse as unknown[])[1]);
              await page.mouse.move(mx, my, { steps: 12 });
              await page.waitForTimeout(120);
              await page.mouse.down();
              await page.waitForTimeout(70);
              await page.mouse.up();
            } else if (typeof st.press === 'string') {
              await page.keyboard.press(st.press);
            }
            if (typeof st.wait === 'number') await page.waitForTimeout(Math.min(st.wait, 20_000));
            stepLog.push({ ...st, value: st.value ? '(supplied)' : undefined, ok: true });
          } catch (e) {
            stepLog.push({ ...st, value: st.value ? '(supplied)' : undefined, ok: false, selector: sel, error: (e as Error).message.split('\n')[0]!.slice(0, 160) });
            break;
          }
        }
      }

      if (waitMs) await page.waitForTimeout(waitMs);

      const dom = await page.evaluate(() => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el as HTMLElement);
          return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
        };
        // Walk ancestors: aria-hidden and inert are INHERITED, and an element
        // hidden that way is absent from the accessibility tree even though it
        // is plainly visible on screen. That gap is exactly how a raw-DOM
        // detector and getByRole can disagree about the same button.
        const hiddenFromA11y = (el: Element) => {
          let n: Element | null = el;
          while (n) {
            if (n.getAttribute?.('aria-hidden') === 'true') return true;
            if (n.hasAttribute?.('inert')) return true;
            n = n.parentElement;
          }
          return false;
        };
        const clickables = Array.from(
          document.querySelectorAll('button, a, [role="button"], input[type="submit"]'),
        ).map((el) => ({
          tag: el.tagName,
          text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
          testid: el.getAttribute('data-testid'),
          aria: el.getAttribute('aria-label'),
          role: el.getAttribute('role'),
          href: (el.getAttribute('href') ?? '').slice(0, 70),
          visible: box(el),
          ariaHidden: hiddenFromA11y(el),
          disabled: (el as HTMLButtonElement).disabled === true,
        }));
        const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]')).map((el) => ({
          tag: el.tagName,
          type: el.getAttribute('type'),
          name: el.getAttribute('name'),
          id: el.id || null,
          autocomplete: el.getAttribute('autocomplete'),
          inputmode: el.getAttribute('inputmode'),
          placeholder: el.getAttribute('placeholder'),
          visible: box(el),
          ariaHidden: hiddenFromA11y(el),
          // The value, because "I set the field" and "the field holds it" are
          // different claims and only the second one matters. Masked for password
          // inputs: length is enough to know a fill landed, and the value itself
          // has no business in a response body.
          value:
            el.getAttribute('type') === 'password'
              ? '(' + String((el as HTMLInputElement).value ?? '').length + ' chars)'
              : String((el as HTMLInputElement).value ?? (el as HTMLElement).textContent ?? '').slice(0, 60),
        }));
        // \s+, not s+. Without the backslash this deletes every lowercase "s"
        // from the page text, so "Performing security verification" is reported
        // as "Performing ecurity verification" - a dump that quietly lies about
        // the one thing it exists to show.
        return { clickables, inputs, bodyChars: (document.body?.innerText ?? '').length, bodyText: (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 600) };
      });

      // Every frame, not just the top document. A cross-origin iframe is invisible
      // both to page.locator() and to the dump above, so a Turnstile checkbox inside
      // one looks exactly like an empty page with nothing on it — and "nothing is
      // there" is the one conclusion that stops you looking. Playwright attaches to
      // every frame, so this reads them for real instead of guessing at the markup.
      //
      // Rects are converted to VIEWPORT coordinates by adding the iframe element's
      // own offset, so they can be handed straight to a {"mouse":[x,y]} step. That is
      // the point: aim from a measurement, never from a screenshot.
      const frames: unknown[] = [];
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        const fe = await f.frameElement().catch(() => null);
        const fr = fe ? await fe.boundingBox().catch(() => null) : null;
        const inner = await f
          .evaluate(() => {
            const vis = (el: Element) => {
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el as HTMLElement);
              return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
            };
            return Array.from(
              document.querySelectorAll('input, button, a, label, [role="button"], [role="checkbox"], textarea'),
            )
              .filter(vis)
              .slice(0, 25)
              .map((el) => {
                const r = el.getBoundingClientRect();
                return {
                  tag: el.tagName,
                  type: el.getAttribute('type'),
                  id: el.id || null,
                  name: el.getAttribute('name'),
                  role: el.getAttribute('role'),
                  aria: el.getAttribute('aria-label'),
                  text: (el.textContent ?? '').trim().replace(/s+/g, " ").slice(0, 50),
                  rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
                };
              });
          })
          .catch((e: Error) => 'EVAL FAILED: ' + e.message.slice(0, 100));
        const els = Array.isArray(inner)
          ? inner.map((el) => ({
              ...el,
              // centre of the element, in page coordinates
              click: fr ? [Math.round(fr.x + el.rect.x + el.rect.w / 2), Math.round(fr.y + el.rect.y + el.rect.h / 2)] : null,
            }))
          : inner;
        frames.push({
          url: f.url().slice(0, 140),
          name: f.name(),
          frameRect: fr ? { x: Math.round(fr.x), y: Math.round(fr.y), w: Math.round(fr.width), h: Math.round(fr.height) } : null,
          els,
        });
      }

      // Every strategy the automation might use, counted right now against this
      // page. Disagreement between these IS the diagnosis.
      const probes: Record<string, unknown> = {};
      const candidates: Array<[string, { count: () => Promise<number> }]> = [
        ['getByRole button /^log ?in$/i', page.getByRole('button', { name: /^log ?in$/i })],
        ['getByRole link /^log ?in$/i', page.getByRole('link', { name: /^log ?in$/i })],
        ['button:text-is("Log in")', page.locator('button:text-is("Log in")')],
        ['a:text-is("Log in")', page.locator('a:text-is("Log in")')],
        ['button filter hasText /^Log in$/', page.locator('button').filter({ hasText: /^Log in$/ })],
        ['[data-testid="login-button"]', page.locator('[data-testid="login-button"]')],
        ['a[href*="/auth/login"]', page.locator('a[href*="/auth/login"]')],
        ['input#mobile-auth-email', page.locator('input#mobile-auth-email')],
        ['input[name="login_hint"]', page.locator('input[name="login_hint"]')],
        ['input[type="email"]', page.locator('input[type="email"]')],
        ['input[type="password"]', page.locator('input[type="password"]')],
        ['getByRole button /^continue$/i', page.getByRole('button', { name: /^continue$/i })],
        ['#prompt-textarea', page.locator('#prompt-textarea')],
      ];
      for (const [label, loc] of candidates) {
        probes[label] = await loc.count().catch((e: Error) => 'ERR ' + e.message.slice(0, 60));
      }

      return {
        id,
        url: page.url(),
        title: await page.title().catch(() => ''),
        waitedMs: waitMs,
        navigatedTo: target,
        clicked,
        clickSelector: clickSel,
        steps: stepLog,
        frames,
        locatorCounts: probes,
        ...dom,
      };
    });
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

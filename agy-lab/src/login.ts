// Scripted ChatGPT login: email, password, OTP.
//
// This replaces a remote-control browser you drove by clicking on a screenshot.
// That was the wrong shape for the job. A login is a FIXED sequence of known
// fields — there is nothing to explore, so there is nothing to point at. Aiming a
// mouse at a JPEG made every step a round trip (screenshot out, coordinates back,
// screenshot again to see whether it landed) to accomplish what filling a named
// input does in one call, and any lag or scroll offset meant the click missed
// silently.
//
// So: no coordinates. Find the field, fill the field, submit.
//
// Credentials are never stored. They arrive in a request body, are typed into the
// page, and go out of scope with the call — the profile keeps the resulting
// session cookies, which is the entire point, and nothing keeps the password.
import type { Page } from 'patchright';
import * as browser from './browser.ts';
import * as sessions from './sessions.ts';
import { freshCode, parseSecret } from './totp.ts';

/** Where the flow currently is. Each one names the next thing that must happen. */
export type Step = 'ready' | 'chooser' | 'landing' | 'email' | 'password' | 'otp' | 'challenged' | 'unknown';

export interface LoginResult {
  id: string;
  state: 'ready' | 'needs_otp' | 'failed';
  step: Step;
  detail: string;
  url: string;
  ms: number;
  /** Steps actually taken, so a failure says how far it got rather than just that it failed. */
  trail: string[];
}

/**
 * Selector alternatives, most specific first.
 *
 * Written as lists because OpenAI's login is served by more than one front end
 * and the markup differs between them. A single selector that works today is a
 * login that breaks on a Tuesday for reasons nobody can reproduce.
 */
/**
 * Selectors, written against the DOM as it actually is — measured in the
 * container on 2026-08-19, not remembered.
 *
 * What the measurement overturned:
 *   [data-testid="login-button"]   0 matches. Does not exist. This came from
 *                                  gmap-recon's session-monitor and has been
 *                                  dead there too.
 *   a[href*="/auth/login"]         0 matches.
 *   button:has-text("Log in")      8 matches — wrappers, not the button.
 *   getByRole button /^log ?in$/i  2 matches: the real ones, top bar and sidebar.
 *
 * The email field is name="login_hint", NOT name="email". Anything keyed on
 * "email" as a name matches nothing.
 */
export const SEL = {
  // Ordered so a visible, uniquely-named control wins before anything broad.
  email: [
    'input#mobile-auth-email',
    'input[name="login_hint"]',
    'input[type="email"]',
    'input[autocomplete="email"]',
    'input[name="email"]',
    'input[name="username"]',
  ],
  password: ['input[type="password"]', 'input[name="password"]', '#password'],
  otp: ['input[autocomplete="one-time-code"]', 'input[name="code"]', 'input[name="otp"]', 'input[inputmode="numeric"]'],
  composer: ['#prompt-textarea'],
} as const;

/**
 * Submit buttons, by EXACT accessible name.
 *
 * Exactness is a safety requirement here, not tidiness. The sign-in modal also
 * offers "Continue with Google", "Continue with Apple" and "Continue with phone";
 * a loose match on "Continue" clicks an SSO provider and derails the whole flow
 * into a Google login that will never complete.
 */
const SUBMIT_NAMES = [/^continue$/i, /^log ?in$/i, /^next$/i, /^sign ?in$/i];

const CHALLENGE = /just a moment|checking your browser|verify you are human|cf-chl|challenge-platform|attention required/i;

interface Signals {
  chooser: boolean;
  otp: boolean;
  password: boolean;
  email: boolean;
  login: boolean;
  composer: boolean;
  title: string;
}

/**
 * Read every signal from the DOM in one pass.
 *
 * Runs in the page rather than through Playwright selectors because the two
 * previous attempts at this both failed on the same page the screenshot shows
 * plainly. `locator.isVisible()` does NOT wait — it answers about this instant —
 * so against a React shell that has fired DOMContentLoaded but rendered nothing,
 * every selector reports absent and the flow concludes it is on an unrecognised
 * page. And `:has-text("Log in")` matches a substring, which on this site also
 * catches wrapper elements.
 *
 * Matching text exactly, over buttons and anchors only, is what the session probe
 * already does successfully.
 */
export const SIGNALS = () => {
  const visible = (el: Element | null): boolean => {
    if (!el) return false;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const st = getComputedStyle(el as HTMLElement);
    return st.visibility !== 'hidden' && st.display !== 'none';
  };
  const q = (sel: string): boolean => Array.from(document.querySelectorAll(sel)).some(visible);
  const label = (el: Element) => (el.textContent ?? '').trim().toLowerCase();

  return {
    // The account chooser: a real <dialog open> in the TOP LAYER, so it covers
    // the whole page. Measured after a logout - OpenAI remembers the account and
    // asks which one to use. Nothing behind it can be clicked while it is up, so
    // a "Log in" button detected underneath is a button that will never respond,
    // and the flow has to notice the dialog rather than the button.
    chooser: (() => {
      const d = document.querySelector('dialog[open]');
      if (!d || !visible(d)) return false;
      return /choose an account|log in to another account/i.test(d.textContent ?? '');
    })(),
    otp: q('input[autocomplete="one-time-code"], input[name="code"], input[name="otp"], input[inputmode="numeric"]'),
    password: q('input[type="password"], input[name="password"], #password'),
    email: q('input[name="email"], input[type="email"], input[name="username"], #email-input, #username'),
    login:
      q('[data-testid="login-button"], a[href*="/auth/login"]') ||
      Array.from(document.querySelectorAll('button, a')).some(
        (n) => visible(n) && ['log in', 'login', 'sign up', 'sign up for free'].includes(label(n)),
      ),
    composer: q('#prompt-textarea'),
    title: document.title,
  };
};

/**
 * Poll until the page shows something recognisable, then classify it.
 *
 * Polling from Node rather than a page-side waitForFunction keeps one copy of the
 * predicate: the alternative is writing the same DOM walk twice, once to wait on
 * and once to read, and those two copies drift.
 */
async function signals(page: Page, waitMs: number): Promise<Signals> {
  const deadline = Date.now() + waitMs;
  let last: Signals = { chooser: false, otp: false, password: false, email: false, login: false, composer: false, title: '' };
  for (;;) {
    last = await page.evaluate(SIGNALS).catch(() => last);
    if (last.chooser || last.otp || last.password || last.email || last.login || last.composer) return last;
    if (Date.now() >= deadline) return last;
    await page.waitForTimeout(500);
  }
}

export async function detect(page: Page, waitMs = 25_000): Promise<Step> {
  const s = await signals(page, waitMs);

  // Order matters and is not arbitrary. OTP before password because some flows
  // keep a hidden password field on the OTP page; password before email for the
  // same reason; login before ready because the signed-out page has a composer
  // too, so a composer alone must never win.
  // The chooser goes first, ahead of everything. It is a top-layer modal, so
  // whatever else is detected is behind it and unreachable until it is dealt with.
  if (s.chooser) return 'chooser';
  if (s.otp) return 'otp';
  if (s.password) return 'password';
  if (s.email) return 'email';
  if (s.login) return 'landing';
  if (s.composer) return 'ready';
  if (CHALLENGE.test(s.title) || CHALLENGE.test(page.url())) return 'challenged';
  return 'unknown';
}

/** First selector in the list that is present and visible right now, or null. */
async function firstVisible(page: Page, selectors: readonly string[], timeoutMs = 4000): Promise<string | null> {
  for (const sel of selectors) {
    try {
      await page.locator(sel).first().waitFor({ state: 'visible', timeout: timeoutMs });
      return sel;
    } catch {
      /* not present, not visible, or a selector this front end does not use */
    }
  }
  return null;
}

/** Fill the first VISIBLE match. The first match alone can be a hidden duplicate. */
export async function fillFirstVisible(page: Page, selectors: readonly string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    try {
      await page.locator(sel + ':visible').first().fill(value, { timeout: 8000 });
      return true;
    } catch {
      /* not this shape, or still hidden - try the next */
    }
  }
  return false;
}

/**
 * Click the sign-in control.
 *
 * DOM-based and auto-waiting, which together remove the race that broke this.
 *
 * Measured on prod: at 1500ms after navigation getByRole finds 2 buttons, but
 * SIGNALS (a raw DOM walk) reports a visible "Log in" EARLIER than that —
 * getByRole reads the accessibility tree, which lags. So detect() returned
 * "landing", clickLogin sampled getByRole once, got 0, and gave up. That is the
 * whole 1797ms failure: not a wrong selector, a selector consulted too early
 * through a slower index.
 *
 * ":text-is" is exact text over the DOM, the same basis SIGNALS uses, so the two
 * can no longer disagree. ":visible" filters the hidden duplicates — the page
 * carries 12 elements whose text is "Log in" and only 3 are on screen. And
 * click() auto-waits for actionability, so a control that has not rendered yet is
 * waited for instead of being missed by a single badly-timed sample.
 */
export async function clickLogin(page: Page): Promise<boolean> {
  const target = page.locator('button:text-is("Log in"):visible, a:text-is("Log in"):visible').first();
  try {
    await target.click({ timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Click whatever submits this form.
 *
 * Exact text, never a substring: the sign-in modal also offers "Continue with
 * Google", "Continue with Apple" and "Continue with phone", and a loose match
 * clicks an SSO provider and derails the flow into a login that never completes.
 */
async function submit(page: Page): Promise<void> {
  for (const word of ['Continue', 'Log in', 'Next', 'Sign in']) {
    const c = page.locator(`button:text-is("${word}"):visible, [role="button"]:text-is("${word}"):visible`).first();
    try {
      await c.click({ timeout: 6000 });
      return;
    } catch {
      /* not this one */
    }
  }
  await page.keyboard.press('Enter');
}

/**
 * Let the page navigate or re-render before looking again.
 *
 * Measured: clicking Log in opens a MODAL. The URL does not change and no new
 * document loads, so waiting on a navigation is waiting for something that will
 * never happen. The load-state wait stays only for the steps that DO navigate,
 * with a short timeout, and the real settling is the fixed pause plus the polling
 * detector that follows it.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * Wait until the flow is somewhere ELSE before looking again.
 *
 * settle() alone is not enough after a submit. detect() returns as soon as any
 * signal is true, and one second after pressing Enter the code field is still on
 * the page - so the loop reads "otp" again and submits a second time into a
 * request that is still in flight. Measured: eight submissions in thirty seconds,
 * each one cancelling the last, and a trail of otp -> otp -> otp -> otp.
 *
 * A submit is only finished when the page has become a different step. Returns
 * the step it settled on, so the caller can tell "moved on" from "gave up".
 */
async function waitForStepChange(page: Page, from: Step, ms = 25_000): Promise<Step> {
  const deadline = Date.now() + ms;
  let now = from;
  while (Date.now() < deadline) {
    await page.waitForTimeout(750);
    now = await detect(page, 1000);
    if (now !== from) return now;
  }
  return now;
}

/**
 * Enter a one-time code AND submit it. Measured on the live MFA page 2026-08-20.
 *
 * Everything else that looks like it should work does not, and each reason cost a
 * round of guessing, so they are written down:
 *
 *   click the field  the floating <label> paints a positioner div over the
 *                    input's centre, so the hit-target check either times out or
 *                    the click lands on the label
 *   keyboard.type()  the digits never arrive - the field stays empty
 *   fill()           the value DOES land, in the DOM and on screen
 *   click "Continue" nothing: no navigation, no request, no error. An in-page
 *                    capture listener confirms no click event is dispatched at
 *                    all, and a plain <a href="/mfa-challenge"> on the same page
 *                    does not navigate either - which needs no JavaScript. So it
 *                    is not the widget, the framework, or the selector: pointer
 *                    input is not reaching the renderer on this page.
 *   form.submit()    posts, and the server answers HTTP 500
 *
 * What works: focus the field, put the digits in, press Enter. Enter reaches the
 * page when clicks do not, and it submits through the app's own handler rather
 * than around it.
 *
 * Do not "simplify" this back to click + type + click-submit. That is the version
 * that spent two sessions failing.
 */
async function enterOtp(page: Page, code: string): Promise<void> {
  const sel = await firstVisible(page, SEL.otp, 3000);
  if (!sel) return;
  const field = page.locator(sel + ':visible').first();
  const digits = code.trim();

  // focus(), not click(): focus addresses the element directly and cannot be
  // intercepted by whatever is painted over it.
  await field.focus({ timeout: 8000 }).catch(() => {});
  // fill() replaces; fill('') does NOT clear this field, so overwrite instead of
  // clearing first.
  await field.fill(digits, { timeout: 8000 }).catch(() => {});

  // Belt and braces: fill() writes the value, Input.insertText fires the input
  // events a controlled component listens to. Only used if the value did not take.
  if ((await field.inputValue().catch(() => '')) !== digits) {
    await field.focus().catch(() => {});
    await page.keyboard.insertText(digits);
  }

  await page.keyboard.press('Enter');
}

/**
 * Click the Cloudflare Turnstile checkbox.
 *
 * The widget lives in a CROSS-ORIGIN iframe, which page.locator() cannot enter,
 * so there is no selector for the checkbox and never will be. What is reachable
 * is the iframe ELEMENT's position in the page; the checkbox sits at its left,
 * vertically centred. A viewport-level mouse click at that point solves it -
 * measured, twice, on the real auth page.
 *
 * Returns false when no widget is present, so the caller can tell "no challenge"
 * from "challenge not solved".
 */
export async function solveTurnstile(page: Page): Promise<boolean> {
  const frame = page.locator('iframe[src*="challenges.cloudflare.com"]').first();
  const box = await frame.boundingBox({ timeout: 8000 }).catch(() => null);
  if (!box) return false;

  await page.mouse.move(box.x + 21, box.y + box.height / 2, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(6000);
  return true;
}

export interface Credentials {
  email?: string;
  password?: string;
  otp?: string;
  /**
   * The TOTP shared secret, so the code is derived here at the moment of submit.
   *
   * A one-time code cannot be stored - it is a function of the clock - and a code
   * handed over by a human is already several seconds old when it arrives. The
   * secret is the storable half, and with it the 30-second window stops being a
   * race and unattended re-login becomes possible at all.
   *
   * Accepts a bare base32 secret, an otpauth:// URI, or Google Authenticator's
   * otpauth-migration:// export link. See totp.ts.
   */
  totpSecret?: string;
}

/**
 * Walk the login until it is done or needs something we were not given.
 *
 * Bounded by step count rather than by time: every state transition here should
 * make progress, so a flow that loops is a flow that has hit a state this code
 * does not understand, and it should say so rather than spin until a timeout.
 */
export async function run(id: string, creds: Credentials, opts: { maxSteps?: number } = {}): Promise<LoginResult> {
  const maxSteps = opts.maxSteps ?? 12;
  const started = Date.now();
  const trail: string[] = [];
  // Consecutive "detected it, could not act on it" rounds. Bounded so a page that
  // genuinely will not accept input still terminates instead of spinning.
  let misses = 0;
  // Submissions of a one-time code. Bounded hard: each attempt burns a code.
  let otpTries = 0;

  return browser.withProfile(id, async () => {
    sessions.create(id);
    const { page } = await browser.acquire(id);

    if (!page.url().includes('chatgpt.com') && !page.url().includes('openai.com')) {
      await page.goto(sessions.TEMP_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    }

    const finish = (state: LoginResult['state'], step: Step, detail: string): LoginResult => ({
      id,
      state,
      step,
      detail,
      url: page.url(),
      ms: Date.now() - started,
      trail,
    });

    for (let i = 0; i < maxSteps; i++) {
      const step = await detect(page);
      trail.push(step);

      if (step === 'ready') return finish('ready', step, 'Signed in - composer is live and no login control is on the page.');

      if (step === 'challenged') {
        // A Turnstile checkbox is not a dead end, it is a click - see
        // solveTurnstile. Only give up if there is no widget to click, or if
        // clicking it left us still challenged.
        if (await solveTurnstile(page)) {
          await settle(page);
          if ((await detect(page)) !== 'challenged') continue;
          return finish('failed', step, 'The Turnstile checkbox was clicked and the challenge did not clear.');
        }
        return finish('failed', step, 'A bot check is in the way and no Turnstile widget was found to click.');
      }

      if (step === 'chooser') {
        // Pick the remembered account by its own email text - it is the only
        // button in the dialog carrying it. Otherwise fall through to "Log in to
        // another account", which drops the flow back onto the normal email form.
        const pick = creds.email
          ? await page
              .locator(`dialog[open] button:has-text(${JSON.stringify(creds.email)})`)
              .first()
              .click({ timeout: 8000 })
              .then(() => true)
              .catch(() => false)
          : false;
        if (!pick) {
          const other = await page
            .locator('dialog[open] button:text-is("Log in to another account")')
            .first()
            .click({ timeout: 8000 })
            .then(() => true)
            .catch(() => false);
          if (!other) {
            return finish('failed', step, 'An account chooser is up and neither the account nor "Log in to another account" could be clicked.');
          }
        }
        await settle(page);
        continue;
      }

      if (step === 'landing') {
        if (!(await clickLogin(page))) {
          return finish('failed', step, 'A sign-in control is on the page but nothing clickable matched it.');
        }
        await settle(page);
        continue;
      }

      if (step === 'email') {
        if (!creds.email) return finish('failed', step, 'The page is asking for an email and none was supplied.');
        if (!(await fillFirstVisible(page, SEL.email, creds.email))) {
          // Detected but gone by the time we reached for it: the page was mid
          // navigation. Look again rather than declaring failure - measured on
          // prod, this is what "a password field was detected but no visible one
          // could be filled" was, on a page that had already become the MFA page.
          if (++misses > 3) return finish('failed', step, 'An email field kept being detected but never stayed long enough to fill.');
          await settle(page);
          continue;
        }
        misses = 0;
        await submit(page);
        await waitForStepChange(page, step);
        continue;
      }

      if (step === 'password') {
        if (!creds.password) return finish('failed', step, 'The page is asking for a password and none was supplied.');
        if (!(await fillFirstVisible(page, SEL.password, creds.password))) {
          // Same race as the email step: SIGNALS saw the field on the page it was
          // leaving. Re-detect instead of failing.
          if (++misses > 3) return finish('failed', step, 'A password field kept being detected but never stayed long enough to fill.');
          await settle(page);
          continue;
        }
        misses = 0;
        await submit(page);
        await waitForStepChange(page, step);
        continue;
      }

      if (step === 'otp') {
        // Stopping here is the correct behaviour, not a failure: the code does not
        // exist yet when the call starts. The browser stays open holding this exact
        // page, so /otp resumes rather than starting over.
        // With the shared secret there is no waiting and no human: derive the code
        // now, at the moment it is needed, with a full window ahead of it.
        const code = creds.otp ?? (creds.totpSecret ? await freshCode(parseSecret(creds.totpSecret)[0]!.secret, 8) : undefined);
        if (!code) {
          return finish('needs_otp', step, 'A one-time code is required. Post it to /otp - this browser stays on the page. Better: store the TOTP secret so no one has to.');
        }
        // enterOtp submits with Enter. Do NOT add submit() here - the Continue
        // button on this page does not respond to clicks at all, and calling it
        // only adds a 6-second timeout per attempt.
        await enterOtp(page, code);
        creds = { ...creds, otp: undefined };

        // Wait for the page to actually become something else. Re-detecting
        // immediately reads the code field that is still on screen and fires a
        // second submit into the first one's request.
        const after = await waitForStepChange(page, 'otp');
        if (after === 'otp') {
          // Two attempts, no more. Each one burns a code, and a code that is
          // being rejected will be rejected again a second later - the only thing
          // repeating buys is a rate limit.
          if (++otpTries >= 2) {
            return finish('failed', 'otp', 'The one-time code was submitted twice and the page stayed on the code screen - the code is being rejected.');
          }
        }
        continue;
      }

      // Unknown after a full detect window means the page really is one this code
      // does not model — detect() already waited, so waiting again just doubles
      // the time before an answer.
      const title = await page.title().catch(() => '');
      return finish('failed', 'unknown', `Stuck on an unrecognised page: "${title}" at ${page.url()}.`);
    }

    return finish('failed', 'unknown', `Gave up after ${maxSteps} steps - the flow is looping. Trail: ${trail.join(' -> ')}`);
  });
}

/**
 * Resume a login that stopped for a code.
 *
 * Deliberately NOT run(id, { otp: code }). That restarted the whole state machine
 * with no email and no password, so when the page was anywhere other than the code
 * screen it died instantly on the email step with "The page is asking for an email
 * and none was supplied" — a message about missing credentials rather than about
 * the real problem, which is that nothing asked for a code. Measured: ms 4.
 *
 * This enters the code where the page actually is, and says so plainly otherwise.
 */
export async function otp(id: string, code: string): Promise<LoginResult> {
  const started = Date.now();
  return browser.withProfile(id, async () => {
    const { page } = await browser.acquire(id);
    const step = await detect(page, 10_000);
    const finish = (state: LoginResult['state'], detail: string): LoginResult => ({
      id,
      state,
      step,
      detail,
      url: page.url(),
      ms: Date.now() - started,
      trail: [step],
    });

    if (step !== 'otp') {
      return finish(
        'failed',
        `Nothing is asking for a code - the page is at the "${step}" step. Log in with email and password first.`,
      );
    }

    // enterOtp presses Enter itself; the Continue button on this page ignores
    // clicks entirely, so submit() here only costs a timeout.
    await enterOtp(page, code);
    await settle(page);

    const after = await detect(page, 25_000);
    if (after === 'ready') return finish('ready', 'Signed in.');
    if (after === 'otp') return finish('failed', 'Still on the code screen - the code was rejected or incomplete.');
    return finish('failed', `Code submitted, but the page moved to the "${after}" step instead of signing in.`);
  });
}

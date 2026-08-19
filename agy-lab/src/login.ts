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

/** Where the flow currently is. Each one names the next thing that must happen. */
export type Step = 'ready' | 'landing' | 'email' | 'password' | 'otp' | 'challenged' | 'unknown';

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
  let last: Signals = { otp: false, password: false, email: false, login: false, composer: false, title: '' };
  for (;;) {
    last = await page.evaluate(SIGNALS).catch(() => last);
    if (last.otp || last.password || last.email || last.login || last.composer) return last;
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
 * Type into a one-time-code field.
 *
 * Some builds use a single input, others six that each hold one digit and advance
 * on keypress. Typing through the keyboard rather than filling a value covers
 * both: the split version receives the digits it expects, and the single version
 * cannot tell the difference.
 */
async function enterOtp(page: Page, code: string): Promise<void> {
  const sel = await firstVisible(page, SEL.otp, 3000);
  if (!sel) return;
  await page.locator(sel).first().click({ timeout: 8000 }).catch(() => {});
  await page.keyboard.type(code.trim(), { delay: 90 });
}

export interface Credentials {
  email?: string;
  password?: string;
  otp?: string;
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
      if (step === 'challenged') return finish('failed', step, 'A bot check is in the way. Not a credential problem.');

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
          return finish('failed', step, 'An email field was detected but no visible one could be filled.');
        }
        await submit(page);
        await settle(page);
        continue;
      }

      if (step === 'password') {
        if (!creds.password) return finish('failed', step, 'The page is asking for a password and none was supplied.');
        if (!(await fillFirstVisible(page, SEL.password, creds.password))) {
          return finish('failed', step, 'A password field was detected but no visible one could be filled.');
        }
        await submit(page);
        await settle(page);
        continue;
      }

      if (step === 'otp') {
        // Stopping here is the correct behaviour, not a failure: the code does not
        // exist yet when the call starts. The browser stays open holding this exact
        // page, so /otp resumes rather than starting over.
        if (!creds.otp) {
          return finish('needs_otp', step, 'A one-time code is required. Post it to /otp - this browser stays on the page.');
        }
        await enterOtp(page, creds.otp);
        await submit(page);
        await settle(page);
        creds = { ...creds, otp: undefined };
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

    await enterOtp(page, code);
    await submit(page);
    await settle(page);

    const after = await detect(page, 25_000);
    if (after === 'ready') return finish('ready', 'Signed in.');
    if (after === 'otp') return finish('failed', 'Still on the code screen - the code was rejected or incomplete.');
    return finish('failed', `Code submitted, but the page moved to the "${after}" step instead of signing in.`);
  });
}

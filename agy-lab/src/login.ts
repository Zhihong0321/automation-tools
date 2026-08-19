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
const SEL = {
  login: ['[data-testid="login-button"]', 'a[href*="/auth/login"]', 'button:has-text("Log in")', 'a:has-text("Log in")'],
  email: ['input[name="email"]', 'input[type="email"]', 'input[name="username"]', '#email-input', '#username'],
  password: ['input[type="password"]', 'input[name="password"]', '#password'],
  otp: ['input[autocomplete="one-time-code"]', 'input[name="code"]', 'input[name="otp"]', 'input[inputmode="numeric"]'],
  submit: ['button[type="submit"]', 'button:has-text("Continue")', 'button:has-text("Log in")', 'button:has-text("Next")'],
  composer: ['#prompt-textarea'],
} as const;

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
const SIGNALS = () => {
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

async function detect(page: Page, waitMs = 25_000): Promise<Step> {
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

/**
 * Click the sign-in control.
 *
 * By accessible name rather than by `:has-text`, which matches substrings and so
 * can land on a wrapper that contains the button instead of the button.
 */
async function clickLogin(page: Page): Promise<boolean> {
  const candidates = [
    page.locator('[data-testid="login-button"]').first(),
    page.getByRole('button', { name: /^log ?in$/i }).first(),
    page.getByRole('link', { name: /^log ?in$/i }).first(),
    page.locator('a[href*="/auth/login"]').first(),
  ];
  for (const c of candidates) {
    try {
      if ((await c.count()) > 0 && (await c.isVisible())) {
        await c.click({ timeout: 12_000 });
        return true;
      }
    } catch {
      /* try the next shape */
    }
  }
  return false;
}

/** Click whatever submits this form. Enter is the fallback, and often the only one. */
async function submit(page: Page): Promise<void> {
  const sel = await firstVisible(page, SEL.submit, 800);
  if (sel) await page.locator(sel).first().click({ timeout: 10_000 }).catch(() => {});
  else await page.keyboard.press('Enter');
}

/** Let the page navigate or re-render before looking again. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1400);
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
        const sel = await firstVisible(page, SEL.email);
        if (!sel) return finish('failed', step, 'An email field was detected but no known selector matched it.');
        await page.locator(sel).first().fill(creds.email, { timeout: 15_000 });
        await submit(page);
        await settle(page);
        continue;
      }

      if (step === 'password') {
        if (!creds.password) return finish('failed', step, 'The page is asking for a password and none was supplied.');
        const sel = await firstVisible(page, SEL.password);
        if (!sel) return finish('failed', step, 'A password field was detected but no known selector matched it.');
        await page.locator(sel).first().fill(creds.password, { timeout: 15_000 });
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

/** Resume a login that stopped for a code. The browser is still on the OTP page. */
export async function otp(id: string, code: string): Promise<LoginResult> {
  return run(id, { otp: code });
}

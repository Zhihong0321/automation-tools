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

/** First selector in the list that is actually visible, or null. */
async function firstVisible(page: Page, selectors: readonly string[], timeoutMs = 1200): Promise<string | null> {
  for (const sel of selectors) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: timeoutMs })) return sel;
    } catch {
      /* not present, not visible, or a selector this front end does not use */
    }
  }
  return null;
}

async function detect(page: Page): Promise<Step> {
  // Order matters and is not arbitrary. OTP before password because some flows
  // keep a hidden password field on the OTP page; password before email for the
  // same reason; and `ready` last so a stray composer on a signed-out page cannot
  // short-circuit the whole thing.
  if (await firstVisible(page, SEL.otp)) return 'otp';
  if (await firstVisible(page, SEL.password)) return 'password';
  if (await firstVisible(page, SEL.email)) return 'email';

  const title = await page.title().catch(() => '');
  if (CHALLENGE.test(title) || CHALLENGE.test(page.url())) return 'challenged';

  if (await firstVisible(page, SEL.login)) return 'landing';
  if (await firstVisible(page, SEL.composer)) return 'ready';
  return 'unknown';
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
        const sel = await firstVisible(page, SEL.login, 3000);
        if (sel) await page.locator(sel).first().click({ timeout: 15_000 }).catch(() => {});
        await settle(page);
        continue;
      }

      if (step === 'email') {
        if (!creds.email) return finish('failed', step, 'The page is asking for an email and none was supplied.');
        const sel = (await firstVisible(page, SEL.email, 3000))!;
        await page.locator(sel).first().fill(creds.email, { timeout: 15_000 });
        await submit(page);
        await settle(page);
        continue;
      }

      if (step === 'password') {
        if (!creds.password) return finish('failed', step, 'The page is asking for a password and none was supplied.');
        const sel = (await firstVisible(page, SEL.password, 3000))!;
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

      // Unknown: give the page one more chance to finish rendering before giving
      // up, since this is also what a slow load looks like.
      await settle(page);
      if ((await detect(page)) === 'unknown') {
        const title = await page.title().catch(() => '');
        return finish('failed', 'unknown', `Stuck on an unrecognised page: "${title}" at ${page.url()}.`);
      }
    }

    return finish('failed', 'unknown', `Gave up after ${maxSteps} steps - the flow is looping. Trail: ${trail.join(' -> ')}`);
  });
}

/** Resume a login that stopped for a code. The browser is still on the OTP page. */
export async function otp(id: string, code: string): Promise<LoginResult> {
  return run(id, { otp: code });
}

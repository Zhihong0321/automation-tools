// Meta AI (meta.ai) as a third engine, driven through a signed-in Chrome profile.
//
// Same shape as the ChatGPT engine next door - one persistent profile per
// account, an ask() that types into the real UI and reads the answer back - but
// with one structural difference that is not a detail and cannot be worked
// around from inside this container:
//
//   THE LOGIN CANNOT HAPPEN HERE.
//
// Measured 2026-08-20 from the Railway container (egress 208.77.246.6, AS400940
// Railway, geolocating to Singapore):
//
//   meta.ai logged out              loads normally, full chat UI, no bot check
//   Log in -> Continue with Facebook -> email + password
//                                   ACCEPTED. No checkpoint, no 2FA -
//                                   facebook.com signs in and stays signed in
//   the OIDC hop back to Meta AI    "Meta AI isn't available in your region."
//
// The same account, the same sequence, run from the owner's home connection in
// Malaysia: signs in and chats. So the gate is on the ADDRESS THE LOGIN COMES
// FROM. It is not the account, not the credentials, and not the browser.
//
// And - this is what makes the engine possible at all - the gate is evaluated
// once, at login. A session minted at a residential IP was exported, imported
// here, and answered a prompt from this container with no region error. Cookies
// replay fine; only the login itself is refused.
//
// Hence: sign in on a residential connection, POST the storageState to
// /api/cgpt/<id>/import, and this file drives what that produced. The local half
// is scripts/meta-login.mjs in the eter-browser project.
import type { Page } from 'patchright';
import * as browser from './browser.ts';
import * as sessions from './sessions.ts';

/** A new chat. Sending rewrites the URL to /prompt/<id>, so this is also the reset. */
export const NEW_CHAT_URL = 'https://www.meta.ai/';

/**
 * Selectors, every one of them read off the live page rather than remembered.
 *
 * Meta AI ships stable data-testids - unlike ChatGPT, where the testid this
 * codebase inherited had been dead for months. These were enumerated from the
 * signed-in page: new-chat-button, conversation-item, user-menu-button,
 * assistant-message, composer-input, composer-add-attachment-button,
 * composer-mode-dropdown-button, composer-send-button.
 *
 * The one trap: [data-testid="composer-input"] is a ZERO-SIZED textarea mirror,
 * not the editor. What takes text is the contenteditable beside it. Filling the
 * testid reads back correct and types into nothing.
 */
const SEL = {
  /** The real editor. Measured: DIV[contenteditable=true][role=textbox], 728x27 at (404,284). */
  composer: 'div[contenteditable="true"][role="textbox"]',
  /** Present only when signed in. */
  account: '[data-testid="user-menu-button"]',
  /** Present only when signed out - and a signed-out visitor cannot chat here at all. */
  login: '[data-testid="login-button"]',
  answer: '[data-testid="assistant-message"]',
} as const;

const CHALLENGE = /just a moment|checking your browser|verify you are human|cf-chl|challenge-platform|attention required/i;
/** The region refusal. A login-time fact, and never a logout. */
const REGION = /is ?n.?t available in your region|not available in your region/i;

/**
 * Read the last assistant message.
 *
 * The controls Meta renders inside the bubble (Like / Dislike / Copy / Share) are
 * icon buttons, so unlike ChatGPT's "Edit" they do not currently prepend a word
 * to innerText. They are stripped anyway: an icon that gains a text label in some
 * future deploy would otherwise corrupt the first line of every answer, and that
 * failure is invisible until someone parses the output.
 *
 * The copy has to be IN the document to be read - innerText is layout-dependent
 * and collapses to textContent on a detached node, which is exactly where the
 * line breaks go missing.
 */
function readAnswer(): string {
  const nodes = document.querySelectorAll('[data-testid="assistant-message"]');
  const el = nodes[nodes.length - 1] as HTMLElement | undefined;
  if (!el) return '';
  try {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('button, [role="button"], svg').forEach((n) => n.remove());
    copy.style.position = 'fixed';
    copy.style.left = '-99999px';
    copy.style.top = '0';
    copy.style.width = (el.clientWidth || 800) + 'px';
    document.body.appendChild(copy);
    const text = copy.innerText;
    copy.remove();
    return text.trim() || el.innerText.trim();
  } catch {
    return el.innerText.trim();
  }
}

/**
 * Is this profile signed in to Meta AI?
 *
 * Simpler than the ChatGPT probe, for a measured reason: a signed-out
 * chatgpt.com hands an anonymous visitor a working composer, so "the composer is
 * live" proves nothing there. meta.ai does not - pressing Enter while signed out
 * opens a "Log in to Meta AI" modal and no message is ever sent. So the account
 * control and the login control are a genuine two-sided signal here.
 */
export async function probe(
  id: string,
  opts: { timeoutMs?: number; keepOpen?: boolean } = {},
): Promise<sessions.ProbeOutcome> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const started = Date.now();
  const done = (
    status: sessions.Health,
    detail: string,
    extra: Record<string, unknown> = {},
  ): sessions.ProbeOutcome => {
    const ms = Date.now() - started;
    sessions.recordProbe(id, status, detail, ms);
    return { id, status, detail, ms, at: new Date().toISOString(), ...extra };
  };

  return browser.withProfile(id, async () => {
    let opened = false;
    try {
      const { page } = await browser.acquire(id);
      opened = true;
      await page.goto(NEW_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      // Wait for the page to commit to an answer instead of sampling a React
      // shell that has fired DOMContentLoaded and rendered nothing - the mistake
      // that had the ChatGPT detector reporting "unrecognised page" about a page
      // the screenshot showed plainly.
      await page
        .waitForFunction(
          () =>
            Boolean(document.querySelector('[data-testid="user-menu-button"]')) ||
            Boolean(document.querySelector('[data-testid="login-button"]')),
          { timeout: timeoutMs },
        )
        .catch(() => {});

      const s = await page
        .evaluate(() => ({
          account: Boolean(document.querySelector('[data-testid="user-menu-button"]')),
          login: Boolean(document.querySelector('[data-testid="login-button"]')),
          composer: Boolean(document.querySelector('div[contenteditable="true"][role="textbox"]')),
          body: (document.body?.innerText ?? '').slice(0, 400),
        }))
        .catch(() => ({ account: false, login: false, composer: false, body: '' }));

      const url = page.url();
      const title = await page.title().catch(() => '');
      const extra = { url, title, signals: { account: s.account, login: s.login, composer: s.composer } };

      if (s.login) {
        return done(
          'logged_out',
          'Sign-in wall on meta.ai. The login CANNOT be driven from this container - the region gate refuses it. Sign in on a residential connection and POST the storageState to /api/cgpt/' +
            id +
            '/import.',
          extra,
        );
      }
      if (s.account) return done('ready', 'Signed in - the account menu is on meta.ai and no login control is.', extra);
      if (REGION.test(s.body)) {
        return done(
          'logged_out',
          'Meta AI refused the region. This address cannot complete a login; import a session minted elsewhere.',
          extra,
        );
      }
      if (CHALLENGE.test(title) || CHALLENGE.test(url) || CHALLENGE.test(s.body)) {
        return done('challenged', `Bot check in the way ("${title}"). The session may be fine.`, extra);
      }
      return done(
        'unknown',
        `Neither an account menu nor a login control within ${Math.round(timeoutMs / 1000)}s ("${title}").`,
        extra,
      );
    } catch (err: unknown) {
      const detail = (err as { message?: string }).message ?? String(err);
      if (/ProcessSingleton|SingletonLock|already (?:in use|running)|user data directory is already/i.test(detail)) {
        return done('busy', 'Profile is open in another Chrome, so the probe could not look. Not a logout.');
      }
      return done('unknown', firstLine(detail));
    } finally {
      if (opened && !opts.keepOpen) await browser.release(id);
    }
  });
}

export interface AskOptions {
  timeoutMs?: number;
  /** Open a new chat first. Default true; false continues the thread on screen. */
  fresh?: boolean;
  onDelta?: (chunk: string) => void;
}

/**
 * Send one prompt through the signed-in UI and read the answer back.
 *
 * Deliberately the same contract as the ChatGPT engine: a fresh chat per call,
 * refuse a signed-out session rather than return something plausible, and settle
 * on silence because the DOM carries no completion marker.
 *
 * The entry path is the one that was measured to work, and every part of it was a
 * candidate for being wrong:
 *   click the contenteditable   the testid'd textarea is 0x0 and takes nothing
 *   keyboard.insertText         fires beforeinput/input, which is what the editor
 *                               listens to. A value written straight onto a node
 *                               is the failure that cost this codebase two
 *                               sessions on ChatGPT's OTP field
 *   Enter                       sends; the URL becomes /prompt/<id>
 */
export async function ask(
  id: string,
  prompt: string,
  opts: number | AskOptions = {},
): Promise<Record<string, unknown>> {
  const o: AskOptions = typeof opts === 'number' ? { timeoutMs: opts } : opts;
  const timeoutMs = o.timeoutMs ?? 180_000;
  const started = Date.now();
  return browser.withProfile(id, async () => {
    const { page } = await browser.acquire(id);
    if (o.fresh !== false || !page.url().includes('meta.ai')) {
      await page.goto(NEW_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await page.waitForSelector(SEL.composer, { timeout: 60_000, state: 'visible' });

    // Signed out, meta.ai swallows the send into a login modal and no message is
    // ever delivered - so a wrapper that did not check would hang until the
    // timeout and then return an empty answer with no reason attached.
    const wall = await page
      .evaluate((sel: string) => Boolean(document.querySelector(sel)), SEL.login)
      .catch(() => false);
    if (wall) {
      throw Object.assign(
        new Error(
          `session "${id}" is signed out - meta.ai is showing a sign-in wall. The login cannot be driven from this container (region gate); import a session minted on a residential connection.`,
        ),
        { code: 'logged_out' },
      );
    }

    await page.click(SEL.composer);
    const entry = await enterPrompt(page, prompt);
    await page.keyboard.press('Enter');

    const deadline = Date.now() + timeoutMs;
    let last = '';
    let emitted = '';
    let quiet = 0;
    while (Date.now() < deadline && quiet < 3) {
      await page.waitForTimeout(1500);
      const text = await page.evaluate(readAnswer).catch(() => '');
      if (text && text === last) quiet++;
      else quiet = 0;
      // Only emit an append. A re-render that is not an extension of what the
      // client already has cannot be un-sent, so it waits for the reconcile below.
      if (o.onDelta && text && text.startsWith(emitted) && text.length > emitted.length) {
        o.onDelta(text.slice(emitted.length));
        emitted = text;
      }
      last = text;
    }
    if (o.onDelta && last !== emitted) o.onDelta(last.slice(commonPrefix(emitted, last)));
    return { id, prompt, answer: last, ms: Date.now() - started, settled: quiet >= 3, entry };
  });
}

/**
 * Put the prompt in the editor, and verify it landed.
 *
 * insertText first: it hands the whole string to the focused node in one call and
 * fires the input events a rich-text editor listens to. keyboard.type cannot be
 * the primary path because Enter sends - the first newline in a multi-line prompt
 * would submit half a question.
 *
 * Verified rather than trusted. "The field looks right" and "the app accepted it"
 * are different claims, and the gap between them is what made the ChatGPT MFA
 * login take a day.
 */
async function enterPrompt(page: Page, prompt: string): Promise<'insert' | 'type'> {
  const composerText = () =>
    page
      .evaluate((sel: string) => (document.querySelector(sel) as HTMLElement | null)?.innerText ?? '', SEL.composer)
      .catch(() => '');

  await page.keyboard.insertText(prompt);
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const head = norm(prompt).slice(0, 40);
  if (head && norm(await composerText()).includes(head)) return 'insert';

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  const lines = prompt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i) await page.keyboard.press('Shift+Enter');
    if (lines[i]) await page.keyboard.type(lines[i]!, { delay: 12 });
  }
  return 'type';
}

/** Length of the longest shared prefix - how much of a re-rendered answer the client already has. */
function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function firstLine(text: string, limit = 300): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
  return line.length > limit ? `${line.slice(0, limit)}...` : line.trim();
}

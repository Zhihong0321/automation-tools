// The ChatGPT session manager: many accounts, each a profile, each with a health
// state and a way to get a login into it.
//
// The four health states are the same vocabulary agy's probe uses, for the same
// reason: `ok | broken` collapses "could not tell" into "logged out", and with a
// browser there are far more ways to not be able to tell. A Cloudflare challenge,
// a profile another request is holding, and a genuinely signed-out account are
// three different problems with three different fixes, and only one of them is
// solved by signing in again.
import fs from 'node:fs';
import path from 'node:path';
import * as browser from './browser.ts';

export type Health = 'ready' | 'logged_out' | 'challenged' | 'busy' | 'never_used' | 'unknown';

/** The site a profile belongs to. One engine each; see `kind` on SessionRecord. */
export type Kind = 'chatgpt' | 'meta';

/**
 * These MUST track ../../gmap-recon/src/chatgpt.ts. Copied rather than imported
 * so a broken engine build cannot take this down — but when ChatGPT changes its
 * DOM, both change together.
 */
export const TEMP_CHAT_URL = 'https://chatgpt.com/?temporary-chat=true';
/** Bot-check interstitials. Emphatically not a logout. */
const CHALLENGE = /just a moment|checking your browser|verify you are human|cf-chl|challenge-platform|attention required/i;

const MANIFEST = path.join(browser.PROFILE_ROOT, 'manifest.json');

export interface SessionRecord {
  id: string;
  label: string;
  /**
   * Which site this profile is signed in to.
   *
   * A profile is a browser login and a browser login belongs to exactly one site,
   * so this is what stops a meta.ai profile being probed against chatgpt.com, and
   * what stops it appearing in the gateway as `chatgpt:<id>` - a model every
   * caller would then get a 503 from forever. Absent means "chatgpt": every
   * record written before this field existed is one.
   */
  kind?: Kind;
  createdAt: string;
  lastProbe: { status: Health; detail: string; at: string; ms: number } | null;
  notes?: string;
  /**
   * This account's TOTP shared secret, base32.
   *
   * Stored because the alternative is a human reading a phone at the exact moment
   * a cookie expires, and that is not automation. It sits beside the browser
   * profile on the volume, which already holds the session cookies for the same
   * account - so it adds no new class of secret to the box, it only makes an
   * unattended re-login possible instead of a page that waits for someone to wake
   * up. Never returned by list().
   */
  totpSecret?: string;
}

type Manifest = Record<string, SessionRecord>;

function readManifest(): Manifest {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as Manifest;
  } catch {
    // No manifest yet, or half-written by a kill. "Nothing known" is the right
    // answer either way; the profile directories on disk are the real record.
    return {};
  }
}

function writeManifest(m: Manifest): void {
  fs.mkdirSync(browser.PROFILE_ROOT, { recursive: true });
  const tmp = `${MANIFEST}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, MANIFEST);
}

/**
 * List sessions from the union of the manifest and what is on disk.
 *
 * Disk wins for existence. A profile directory with no manifest entry is a real
 * session whose bookkeeping was lost — hiding it would strand a working login
 * that nothing can then reach.
 */
export function list(): Array<SessionRecord & { dir: string; initialized: boolean; open: boolean }> {
  const manifest = readManifest();
  let onDisk: string[] = [];
  try {
    onDisk = fs
      .readdirSync(browser.PROFILE_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    /* no profiles yet */
  }

  const ids = [...new Set([...Object.keys(manifest), ...onDisk])].sort();
  return ids.map((id) => {
    const dir = path.join(browser.PROFILE_ROOT, id);
    return {
      id,
      label: manifest[id]?.label ?? id,
      createdAt: manifest[id]?.createdAt ?? '(unknown)',
      lastProbe: manifest[id]?.lastProbe ?? null,
      kind: manifest[id]?.kind ?? 'chatgpt',
      // Whether one is set, never the value. A list endpoint has no business
      // handing out a credential that mints login codes.
      totpSecret: manifest[id]?.totpSecret ? '(set)' : undefined,
      ...(manifest[id]?.notes ? { notes: manifest[id]!.notes } : {}),
      dir,
      // Chrome's own marker that it has run here at least once. Nothing has ever
      // signed in to a profile without one.
      initialized: fs.existsSync(path.join(dir, 'Default')) || fs.existsSync(path.join(dir, 'Local State')),
      open: browser.isHeld(id),
    };
  });
}

export function create(id: string, label?: string, kind?: Kind): SessionRecord {
  const dir = browser.profileDir(id); // validates the id
  fs.mkdirSync(dir, { recursive: true });
  const m = readManifest();
  m[id] = m[id] ?? { id, label: label ?? id, createdAt: new Date().toISOString(), lastProbe: null };
  if (label) m[id]!.label = label;
  // Only ever set, never cleared by a later bare create(). Every route calls
  // create(id) on the way past, and a profile that silently changed site would
  // then be driven against the wrong one.
  if (kind) m[id]!.kind = kind;
  writeManifest(m);
  return m[id]!;
}

/** Which site this profile is for. Records written before the field existed are ChatGPT. */
export function kindOf(id: string): Kind {
  return readManifest()[id]?.kind ?? 'chatgpt';
}

/** Store, or with null clear, the TOTP secret for a session. */
export function setTotpSecret(id: string, secret: string | null): void {
  const m = readManifest();
  m[id] = m[id] ?? { id, label: id, createdAt: new Date().toISOString(), lastProbe: null };
  if (secret) m[id]!.totpSecret = secret;
  else delete m[id]!.totpSecret;
  writeManifest(m);
}

/** The stored secret, or null. Read by the login flow; never by list(). */
export function getTotpSecret(id: string): string | null {
  return readManifest()[id]?.totpSecret ?? null;
}

export async function remove(id: string): Promise<void> {
  await browser.withProfile(id, () => browser.release(id));
  fs.rmSync(browser.profileDir(id), { recursive: true, force: true });
  const m = readManifest();
  delete m[id];
  writeManifest(m);
}

/** Exported so the Meta engine records its probes in the same manifest, in the same shape. */
export function recordProbe(id: string, status: Health, detail: string, ms: number): void {
  const m = readManifest();
  m[id] = m[id] ?? { id, label: id, createdAt: new Date().toISOString(), lastProbe: null };
  m[id]!.lastProbe = { status, detail, at: new Date().toISOString(), ms };
  writeManifest(m);
}

export interface ProbeOutcome {
  id: string;
  status: Health;
  detail: string;
  ms: number;
  at: string;
  url?: string;
  title?: string;
}

/**
 * Is this profile signed in?
 *
 * Waits until the page has committed to an answer, then reads every signal at
 * once and ranks them. See the comment inside for why racing selectors is the
 * wrong shape against the current site.
 *
 * `keepOpen` leaves the browser held afterwards, which is what the login flow
 * wants — probing and then immediately closing the window a human is looking at
 * would be its own kind of broken.
 */
export async function probe(id: string, opts: { timeoutMs?: number; keepOpen?: boolean } = {}): Promise<ProbeOutcome> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const started = Date.now();
  const done = (status: Health, detail: string, extra: Record<string, unknown> = {}): ProbeOutcome => {
    const ms = Date.now() - started;
    recordProbe(id, status, detail, ms);
    return { id, status, detail, ms, at: new Date().toISOString(), ...extra };
  };

  const dir = browser.profileDir(id);
  if (!fs.existsSync(dir)) return done('never_used', `No profile directory at ${dir}.`);

  return browser.withProfile(id, async () => {
    let opened = false;
    try {
      const { page } = await browser.acquire(id);
      opened = true;
      await page.goto(TEMP_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      // Wait for the page to commit to an answer, then read every signal at once.
      //
      // The obvious design — race a composer selector against a sign-in selector —
      // is WRONG against the current site, measured 2026-08-19 from a container:
      // the logged-OUT page now ships a fully working composer ("Ask anything"),
      // so "the composer is live" no longer means "signed in". Racing would report
      // a signed-out profile as ready, which is the worst failure this thing can
      // have: the pipeline would run against an anonymous session and quietly
      // produce garbage instead of stopping.
      await page
        .waitForFunction(
          () => {
            const el = document.querySelector('#prompt-textarea');
            const login = Array.from(document.querySelectorAll('button, a')).some((n) =>
              /^(log ?in|sign ?up)/i.test((n.textContent ?? '').trim()),
            );
            return Boolean(el) || login;
          },
          { timeout: timeoutMs },
        )
        .catch(() => {});

      const s = await page
        .evaluate(() => {
          const text = (n: Element) => (n.textContent ?? '').trim().toLowerCase();
          const clickable = Array.from(document.querySelectorAll('button, a'));
          return {
            login:
              Boolean(document.querySelector('[data-testid="login-button"], a[href*="/auth/login"]')) ||
              clickable.some((n) => ['log in', 'login', 'sign up', 'sign up for free'].includes(text(n))),
            composer: Boolean(document.querySelector('#prompt-textarea')),
            account: Boolean(
              document.querySelector('[data-testid="profile-button"], [data-testid="accounts-profile-button"]'),
            ),
            body: (document.body?.innerText ?? '').slice(0, 400),
          };
        })
        .catch(() => ({ login: false, composer: false, account: false, body: '' }));

      const url = page.url();
      const title = await page.title().catch(() => '');
      const extra = { url, title, signals: { login: s.login, composer: s.composer, account: s.account } };

      // A visible sign-in control outranks everything: the signed-out page has a
      // composer too, but a signed-in one never offers you a login button.
      if (s.login) return done('logged_out', `Sign-in wall at ${hostOf(url)} - "Log in" is on the page.`, extra);
      if (s.account || s.composer) {
        return done('ready', `Signed in - composer live and no login control on ${hostOf(url)}.`, extra);
      }

      // A challenge is the single most likely outcome from a datacenter IP, and
      // the single most misleading one to report as a logout.
      if (CHALLENGE.test(title) || CHALLENGE.test(url) || CHALLENGE.test(s.body)) {
        return done('challenged', `Bot check in the way ("${title}"). The session may be fine.`, extra);
      }
      return done('unknown', `No login control and no composer within ${Math.round(timeoutMs / 1000)}s at ${hostOf(url)} ("${title}").`, extra);
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

// ---------------------------------------------------------------------------
// Getting a login in: import from a machine that already has one.
// ---------------------------------------------------------------------------

/**
 * Apply a Playwright storageState to a profile.
 *
 * Cookies go in through the CDP-backed API. localStorage cannot: it is
 * origin-scoped and only reachable from a page already on that origin, so each
 * origin is visited once and its entries written in place. This is why the import
 * needs a live browser rather than being a file copy.
 *
 * What this CANNOT carry across is the fingerprint the session was created under.
 * A cookie minted at a residential IP, replayed from a datacenter one, is exactly
 * the pattern account-security systems look for — so the import succeeding is not
 * the same as the session surviving, and the probe afterwards is the real test.
 */
export interface StorageState {
  cookies?: Array<Record<string, unknown>>;
  origins?: Array<{ origin: string; localStorage?: Array<{ name: string; value: string }> }>;
}

export async function importState(id: string, state: StorageState): Promise<Record<string, unknown>> {
  create(id);
  return browser.withProfile(id, async () => {
    const { context, page } = await browser.acquire(id);
    const report: Record<string, unknown> = { id, cookies: 0, origins: [] as unknown[] };

    if (state.cookies?.length) {
      // Playwright rejects the whole batch on one malformed cookie, which turns a
      // 200-cookie import into an all-or-nothing gamble. Try the batch, then fall
      // back to one at a time so a single bad entry costs one cookie.
      try {
        await context.addCookies(state.cookies as never);
        report.cookies = state.cookies.length;
      } catch {
        let ok = 0;
        for (const c of state.cookies) {
          try {
            await context.addCookies([c] as never);
            ok++;
          } catch {
            /* skip the one that will not take */
          }
        }
        report.cookies = ok;
        report.cookieFallback = true;
      }
    }

    const originReports: unknown[] = [];
    for (const origin of state.origins ?? []) {
      if (!origin.localStorage?.length) continue;
      try {
        await page.goto(origin.origin, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        const wrote = await page.evaluate((items: Array<{ name: string; value: string }>) => {
          let n = 0;
          for (const { name, value } of items) {
            try {
              window.localStorage.setItem(name, value);
              n++;
            } catch {
              /* quota or a blocked origin */
            }
          }
          return n;
        }, origin.localStorage);
        originReports.push({ origin: origin.origin, localStorage: wrote });
      } catch (err) {
        originReports.push({ origin: origin.origin, error: firstLine((err as Error).message) });
      }
    }
    report.origins = originReports;
    return report;
  });
}

/** The inverse: lift a session out of this container to move or back it up. */
export async function exportState(id: string): Promise<StorageState> {
  return browser.withProfile(id, async () => {
    const { context } = await browser.acquire(id);
    return (await context.storageState()) as StorageState;
  });
}

// ---------------------------------------------------------------------------
// Using a session
// ---------------------------------------------------------------------------

/**
 * Read the last assistant message, minus the controls ChatGPT renders inside it.
 *
 * Measured on prod, 2026-08-20: the assistant message subtree contains a <button>
 * whose label ("Edit") is the FIRST text node in it, so a plain innerText prefixes
 * every answer with a word the model never said - and a caller parsing line
 * records gets a bogus first line. The button sits inside the same container as
 * the prose, so there is no selector that takes one and not the other; the text is
 * read from a copy with the controls removed instead.
 *
 * The copy has to be IN the document to be read. innerText is layout-dependent and
 * degrades to textContent on a detached node - which is exactly where the line
 * breaks are lost, and line breaks are the whole reason this reads innerText.
 */
function readAnswer(): string {
  const nodes = document.querySelectorAll('[data-message-author-role="assistant"]');
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
 * Send one prompt through the signed-in UI and read the answer back.
 *
 * This is the wrapper other tools reach through the gateway, so it answers to a
 * stricter standard than the "prove a session works" probe it grew out of:
 *
 * - **Fresh by default.** Each ask opens a new temporary chat. Reusing whatever
 *   page was already on screen makes call N+1 depend on call N's conversation,
 *   which is invisible from the API and impossible to reason about from a tool.
 * - **Refuses a signed-out session.** A logged-out chatgpt.com still ships a
 *   working composer, so typing into it succeeds and returns something — an
 *   anonymous answer, or a sign-up wall, indistinguishable from a real reply
 *   downstream. Better to fail the call than to feed a pipeline garbage.
 * - **`onDelta`** streams the answer as it grows, because the polling loop below
 *   already has the growing text and an SSE client is waiting for it.
 *
 * The answer is read as innerText rather than markdown or JSON because long
 * fenced blocks do not read back whole any other way.
 */
export interface AskOptions {
  timeoutMs?: number;
  /** Open a new temporary chat first. Default true; false continues the page's current thread. */
  fresh?: boolean;
  /** Called with each new piece of the answer as it streams in. */
  onDelta?: (chunk: string) => void;
}

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
    if (o.fresh !== false || !page.url().includes('chatgpt.com')) {
      await page.goto(TEMP_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await page.waitForSelector('#prompt-textarea', { timeout: 60_000, state: 'visible' });

    // The composer being live is not the signal. A visible sign-in control is.
    const wall = await page
      .evaluate(() => {
        const text = (n: Element) => (n.textContent ?? '').trim().toLowerCase();
        return Array.from(document.querySelectorAll('button, a')).some((n) =>
          ['log in', 'login', 'sign up', 'sign up for free'].includes(text(n)),
        );
      })
      .catch(() => false);
    if (wall) {
      throw Object.assign(
        new Error(`session "${id}" is signed out - chatgpt.com is showing a sign-in wall.`),
        { code: 'logged_out' },
      );
    }

    await page.click('#prompt-textarea');
    const entry = await enterPrompt(page, prompt);
    await page.keyboard.press('Enter');

    // Settle on silence rather than on a "done" marker: the DOM has no reliable
    // completion signal, but a streaming answer changes length every tick and a
    // finished one stops. Three quiet polls is the cheapest honest end condition.
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
 * Put the prompt in the composer.
 *
 * `keyboard.type` was here and cannot stay: Enter submits, so the first newline in
 * a multi-line prompt sends half a question — and at 12ms a character a prompt
 * with a document in it spends a minute being typed. `insertText` hands the whole
 * string to the focused node and fires beforeinput/input, which is what ProseMirror
 * listens to, in one call.
 *
 * It is verified rather than trusted, because "the field looks right" and "the app
 * accepted it" are different claims — the same distinction that made the MFA login
 * take a day. If the composer does not read back what was inserted, this clears it
 * and falls back to real keystrokes with Shift+Enter for the newlines.
 */
async function enterPrompt(page: import('patchright').Page, prompt: string): Promise<'insert' | 'type'> {
  const composerText = () =>
    page
      .evaluate(() => (document.querySelector('#prompt-textarea') as HTMLElement | null)?.innerText ?? '')
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

/** Length of the longest shared prefix — how much of a re-rendered answer the client already has. */
function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function firstLine(text: string, limit = 300): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
  return line.length > limit ? `${line.slice(0, limit)}...` : line.trim();
}

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
  createdAt: string;
  lastProbe: { status: Health; detail: string; at: string; ms: number } | null;
  notes?: string;
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
      ...(manifest[id]?.notes ? { notes: manifest[id]!.notes } : {}),
      dir,
      // Chrome's own marker that it has run here at least once. Nothing has ever
      // signed in to a profile without one.
      initialized: fs.existsSync(path.join(dir, 'Default')) || fs.existsSync(path.join(dir, 'Local State')),
      open: browser.isHeld(id),
    };
  });
}

export function create(id: string, label?: string): SessionRecord {
  const dir = browser.profileDir(id); // validates the id
  fs.mkdirSync(dir, { recursive: true });
  const m = readManifest();
  m[id] = m[id] ?? { id, label: label ?? id, createdAt: new Date().toISOString(), lastProbe: null };
  if (label) m[id]!.label = label;
  writeManifest(m);
  return m[id]!;
}

export async function remove(id: string): Promise<void> {
  await browser.withProfile(id, () => browser.release(id));
  fs.rmSync(browser.profileDir(id), { recursive: true, force: true });
  const m = readManifest();
  delete m[id];
  writeManifest(m);
}

function recordProbe(id: string, status: Health, detail: string, ms: number): void {
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
 * Send one prompt through the signed-in UI and read the answer back.
 *
 * Minimal on purpose — the real wrapper lives in gmap-recon/src/chatgpt.ts. This
 * exists to prove a session is usable end to end, not to replace it. The answer is
 * read as innerText rather than markdown or JSON because long fenced blocks do not
 * read back whole any other way.
 */
export async function ask(id: string, prompt: string, timeoutMs = 180_000): Promise<Record<string, unknown>> {
  const started = Date.now();
  return browser.withProfile(id, async () => {
    const { page } = await browser.acquire(id);
    if (!page.url().includes('chatgpt.com')) {
      await page.goto(TEMP_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await page.waitForSelector("#prompt-textarea", { timeout: 60_000, state: "visible" });
    await page.click('#prompt-textarea');
    await page.keyboard.type(prompt, { delay: 12 });
    await page.keyboard.press('Enter');

    // Settle on silence rather than on a "done" marker: the DOM has no reliable
    // completion signal, but a streaming answer changes length every tick and a
    // finished one stops. Three quiet polls is the cheapest honest end condition.
    const deadline = Date.now() + timeoutMs;
    let last = '';
    let quiet = 0;
    while (Date.now() < deadline && quiet < 3) {
      await page.waitForTimeout(1500);
      const text = await page
        .evaluate(() => {
          const nodes = document.querySelectorAll('[data-message-author-role="assistant"]');
          const el = nodes[nodes.length - 1] as HTMLElement | undefined;
          return el?.innerText ?? '';
        })
        .catch(() => '');
      if (text && text === last) quiet++;
      else quiet = 0;
      last = text;
    }
    return { id, prompt, answer: last, ms: Date.now() - started, settled: quiet >= 3 };
  });
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

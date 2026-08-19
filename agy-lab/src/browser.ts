// Browser sessions: one persistent Chrome profile per account, held open only
// while someone is using it.
//
// The hard constraint everything here is shaped around: ONE Chrome per
// user-data-dir. Chrome enforces it with a lock file, and a second launch against
// a live profile does not queue — it fails, or worse, half-succeeds and corrupts
// the profile. So every operation on a session goes through a per-id mutex, and a
// held context is reused rather than relaunched. This is the same lesson
// gmap-recon's session-monitor learned: a probe that leaks a browser locks the
// pipeline out of its own profile.
//
// Profiles live on the volume at $HOME/profiles/<id>, beside agy's credential, so
// one volume carries every login this container has.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'patchright';

export const HOME = process.env.HOME ?? '/data';
export const PROFILE_ROOT = path.join(HOME, 'profiles');

/**
 * Close a profile that nobody has touched for this long.
 *
 * Chrome is ~400MB resident per profile, and a held profile is a profile no other
 * request can open. Five minutes is long enough to click through a login without
 * the browser vanishing under you, short enough that a forgotten tab does not pin
 * the container's memory until the next deploy.
 */
const IDLE_MS = Number(process.env.BROWSER_IDLE_MS ?? 5 * 60_000);

/** The viewport the remote-control UI assumes; must match Xvfb's screen size. */
const VIEWPORT = { width: 1280, height: 800 };

/**
 * Launch flags.
 *
 * --no-sandbox is required because the container runs as root and Chrome refuses
 * to sandbox as root. That is a genuine weakening: a compromised page gets the
 * container. Accepted here because the alternative — a non-root user owning a
 * volume Railway mounts as root — trades one problem for a worse one, and because
 * the pages this browser visits are ones a human deliberately navigated to.
 *
 * --disable-dev-shm-usage because a container's /dev/shm is 64MB by default and
 * Chrome will silently crash tabs when it fills.
 */
const ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-blink-features=AutomationControlled',
  // Memory. A headed Chrome on a 4GB container is fine; two of them plus Xvfb
  // plus agy's language server is not, and the way that failure presents is the
  // whole container restarting — which looks like every endpoint breaking at
  // once rather than like a browser using too much.
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--renderer-process-limit=2',
  `--window-size=${VIEWPORT.width},${VIEWPORT.height + 100}`,
];

/**
 * How many profiles may be open at once.
 *
 * One by default. Chrome is ~400-700MB resident per profile and the container is
 * capped at 4GB shared with Xvfb, Node and agy — and there is no reason to hold
 * two, because a human drives one browser at a time and every automated operation
 * already serialises through the per-profile mutex. Opening a second evicts the
 * least recently used rather than refusing: refusing would strand someone whose
 * previous browser is idling and who has no obvious way to know that.
 */
const MAX_OPEN = Math.max(1, Number(process.env.MAX_OPEN_BROWSERS ?? 1));

export interface Held {
  id: string;
  context: BrowserContext;
  page: Page;
  launchedAt: number;
  lastUsed: number;
}

const held = new Map<string, Held>();
/** One promise chain per profile id. Serialises every operation on that profile. */
const chains = new Map<string, Promise<unknown>>();

/** Run fn with exclusive access to a profile. Failures do not poison the chain. */
export function withProfile<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    id,
    next.catch(() => {}),
  );
  return next;
}

export function profileDir(id: string): string {
  // Ids reach here from URLs. Anything that could climb out of PROFILE_ROOT is a
  // path traversal into the volume, so the id is restricted rather than escaped.
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(id)) throw new Error(`bad session id: ${id}`);
  return path.join(PROFILE_ROOT, id);
}

/**
 * Proxy, if configured.
 *
 * Unset by default and deliberately so. A Railway IP is a datacenter ASN and
 * ChatGPT's bot check treats those far more harshly than a home connection — but
 * how much harshly is a measurement, not a guess, and paying for residential
 * bandwidth before taking that measurement is paying for a maybe.
 * PROXY_URL accepts http://user:pass@host:port.
 */
function proxyOption(): { server: string; username?: string; password?: string } | undefined {
  const raw = process.env.PROXY_URL?.trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const server = `${u.protocol}//${u.host}`;
    return {
      server,
      ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
      ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    };
  } catch {
    return { server: raw };
  }
}

/**
 * Remove the lock a dead Chrome left behind.
 *
 * SingletonLock is a symlink naming the host and pid that owns the profile —
 * "72bd41b1f986-153". When a container is killed the file survives on the volume
 * and the next container has a different hostname and no such pid, so Chrome sees
 * a profile it believes is in use by someone it cannot ask, and refuses.
 *
 * Safe to clear unconditionally at this point ONLY because of the discipline
 * above it: callers hold the per-profile mutex, `held` says we have no live
 * context for this id, and MAX_OPEN caps what else can be running. Under those
 * three, any lock still on disk belongs to a process from a previous life.
 */
function clearStaleLocks(dir: string): void {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try {
      fs.rmSync(path.join(dir, name), { force: true });
    } catch {
      /* nothing there, or not ours to remove — the launch will say so */
    }
  }
}

export function isHeld(id: string): boolean {
  return held.has(id);
}

export function heldView(): Array<{ id: string; launchedAt: string; lastUsed: string; url: string }> {
  return [...held.values()].map((h) => ({
    id: h.id,
    launchedAt: new Date(h.launchedAt).toISOString(),
    lastUsed: new Date(h.lastUsed).toISOString(),
    url: safeUrl(h.page),
  }));
}

function safeUrl(page: Page): string {
  try {
    return page.url();
  } catch {
    return '(closed)';
  }
}

/** Open the profile, or hand back the one already open. Caller must hold the mutex. */
export async function acquire(id: string): Promise<Held> {
  const existing = held.get(id);
  if (existing && !existing.context.pages().every((p) => p.isClosed())) {
    existing.lastUsed = Date.now();
    return existing;
  }
  if (existing) await release(id); // stale: every page gone, context unusable

  // Evict before launching, never after: the point is to not have two Chromes
  // resident at the same instant, and closing afterwards would still let both
  // exist during the launch.
  while (held.size >= MAX_OPEN) {
    let oldest: Held | undefined;
    for (const h of held.values()) if (!oldest || h.lastUsed < oldest.lastUsed) oldest = h;
    if (!oldest) break;
    await release(oldest.id);
  }

  const dir = profileDir(id);
  fs.mkdirSync(dir, { recursive: true });
  clearStaleLocks(dir);

  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: false,
    args: ARGS,
    viewport: VIEWPORT,
    proxy: proxyOption(),
    timeout: 90_000,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const entry: Held = { id, context, page, launchedAt: Date.now(), lastUsed: Date.now() };
  held.set(id, entry);
  return entry;
}

export async function release(id: string): Promise<void> {
  const entry = held.get(id);
  if (!entry) return;
  held.delete(id);
  // Unconditional and swallowing: a context that fails to close is already gone,
  // and leaving it in the map would make the profile permanently unopenable.
  await entry.context.close().catch(() => {});
}

export async function releaseAll(): Promise<void> {
  await Promise.all([...held.keys()].map((id) => release(id)));
}

/** Touch on every use so the idle sweeper measures inactivity, not age. */
export function touch(id: string): void {
  const entry = held.get(id);
  if (entry) entry.lastUsed = Date.now();
}

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of held) {
    if (now - entry.lastUsed <= IDLE_MS) continue;
    // The .catch is not decoration. withProfile returns a promise nobody awaits
    // here, and an unhandled rejection is fatal to the process by default in
    // modern Node — so a browser that fails to close would take the whole
    // container down, which presents as every endpoint 502ing at once.
    void withProfile(id, () => release(id)).catch(() => {});
  }
}, 30_000);
sweeper.unref();

/** Resident memory per process, for the status page. Linux-only, best effort. */
export function memory(): Record<string, unknown> {
  const read = (p: string): number | null => {
    try {
      return Number(fs.readFileSync(p, 'utf8').trim());
    } catch {
      return null;
    }
  };
  const limit = read('/sys/fs/cgroup/memory.max');
  const current = read('/sys/fs/cgroup/memory.current');
  const mb = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.round(n / 1024 / 1024));
  return {
    containerUsedMb: mb(current),
    containerLimitMb: mb(limit),
    rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    openBrowsers: held.size,
    maxOpenBrowsers: MAX_OPEN,
  };
}

export { IDLE_MS, VIEWPORT };

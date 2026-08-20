// The Google Maps scan, as a worker job. Runs on the mini because it must run
// from a residential line — see docs/plan-macmini-worker.md.
//
// NO PLAYWRIGHT. This drives the Chrome already installed on the machine over
// raw CDP, using Node's global WebSocket. Zero dependencies, which for a process
// that must survive unattended for months is the point: nothing to keep updated,
// nothing that breaks on a transitive bump.
//
// TWO RULES CARRIED FROM THE PLAN, both about the same failure:
//
//   Google does not block, it DEGRADES. A throttled search returns fewer results
//   with no error and no captcha, and a town that was throttled then looks
//   identical to a town with few businesses.
//
//   1. An empty feed is NEVER `found: 0`. It is `blocked: true` with no count,
//      because during a soft block the two are indistinguishable and recording a
//      zero writes a lie into the dataset that nothing downstream can detect.
//   2. Yield is reported, never judged here. `found`, `capped` and the block
//      signals go back with the result so the caller can compare a town against
//      its own history — which is the only place a soft block is visible at all.
import { spawn } from 'node:child_process';

const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.GMAP_CDP_PORT ?? 9422);
/** The feed lazy-loads on scroll. Stop when the count stops moving, not at a fixed depth. */
const PLATEAU_ROUNDS = 4;
const MAX_SCROLLS = 60;
const SCROLL_PAUSE_MS = 1600;
const SETTLE_MS = 9000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchChrome(profile) {
  const args = [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    // The automation flag is the one signal that is free to remove and is checked
    // by everything. It is not a stealth suite and does not pretend to be.
    '--disable-blink-features=AutomationControlled',
    '--window-size=1440,900',
    'about:blank',
  ];
  return spawn(CHROME, args, { stdio: 'ignore' });
}

async function connect() {
  // Chrome needs a moment before the debugging port answers; poll rather than
  // sleep a guessed amount, so a slow machine does not fail and a fast one is
  // not punished.
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome never opened a debuggable page on port ' + PORT);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('could not attach to Chrome over CDP'));
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const cdp = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error('page script failed: ' + r.result.exceptionDetails.text);
    }
    return r.result?.result?.value;
  };
  return { ws, cdp, evaluate };
}

/**
 * Runs in the page. Reads one card per result from the feed.
 *
 * Google's class names are generated and change without notice, so structure and
 * ARIA carry the meaning here: the place link identifies the card, the rating is
 * an aria-label, and the rest is the card's own text split on the separator
 * Maps uses. Where a class IS used it is a fallback behind a structural path,
 * never the only route to a field.
 */
const EXTRACT = `(() => {
  const feed = document.querySelector('[role="feed"]');
  const body = document.body.innerText || '';
  const cards = feed ? [...feed.children].filter((c) => c.querySelector('a[href*="/maps/place/"]')) : [];

  const businesses = cards.map((card) => {
    const link = card.querySelector('a[href*="/maps/place/"]');
    const text = card.innerText || '';
    const lines = text.split('\\n').map((s) => s.trim()).filter(Boolean);

    const stars = card.querySelector('[role="img"][aria-label*="star"]');
    const starsLabel = stars ? (stars.getAttribute('aria-label') || '') : '';
    const ratingFromAria = /([\\d.]+)/.exec(starsLabel);
    // Signed out, Maps serves "4.7 stars" with no count at all, so this is null far
    // more often than it is wrong. See limitedView in the result: a null here when
    // limitedView is true is missing data, not a place with no reviews.
    const reviews = /\\((\\d[\\d,]*)\\)/.exec(text) || /(\\d[\\d,]*)\\s*review/i.exec(starsLabel + ' ' + text);

    // "Air conditioning contractor · 04-02, Blok B, Jalan Petaling 1"
    const catAddr = lines.find((l) => l.includes('\u00b7') && !/^(Open|Closed|Opens|Closes)/.test(l));
    // Spacing around the separator is irregular and some slots are empty — that
    // gap is where an accessibility badge sits when the place has one.
    const parts = catAddr ? catAddr.split(/\s*\u00b7\s*/).map((s) => s.trim()).filter(Boolean) : [];

    const phone = /(\\+?\\d[\\d\\s-]{6,}\\d)/.exec(text.replace(/\\(\\d[\\d,]*\\)/g, ''));
    const site = [...card.querySelectorAll('a[href]')].find(
      (a) => !/google\\.[a-z.]+\\/maps|^\\/maps/.test(a.href) && /^https?:/.test(a.href),
    );

    return {
      name: link?.getAttribute('aria-label') || lines[0] || null,
      rating: ratingFromAria ? Number(ratingFromAria[1]) : null,
      reviews: reviews ? Number(reviews[1].replace(/,/g, '')) : null,
      category: parts.length > 1 ? parts[0] : null,
      address: parts.length > 1 ? parts.slice(1).join(', ').replace(/^,\s*|,\s*$/g, '') : (parts[0] ?? null),
      phone: phone ? phone[1].trim() : null,
      website: site ? site.href : null,
      mapsUrl: link ? link.href : null,
    };
  });

  return {
    businesses,
    feedPresent: !!feed,
    // Every way this page says "you are not getting the real thing".
    signals: {
      captcha: /unusual traffic|not a robot|recaptcha/i.test(body),
      consent: /before you continue|consent\\.google/i.test(body + location.href),
      limitedView: /limited view of Google Maps/i.test(body),
      signedIn: !/\\bSign in\\b/.test(body),
    },
    title: document.title,
  };
})()`;

/**
 * @param {{keyword:string, place:string, max?:number}} payload
 * @returns {Promise<{businesses:Array, found:number|null, capped:boolean, blocked:boolean, ...}>}
 */
export async function scan(payload) {
  const keyword = (payload?.keyword ?? '').trim();
  const place = (payload?.place ?? '').trim();
  if (!keyword) throw new Error('gmap.scan needs a keyword');
  const max = Number(payload?.max) > 0 ? Number(payload.max) : 200;
  const query = place ? keyword + ' ' + place : keyword;

  const profile = '/tmp/gmap-worker-profile';
  const chrome = launchChrome(profile);
  const startedAt = Date.now();
  let ws = null;

  try {
    const conn = await connect();
    ws = conn.ws;
    await conn.cdp('Page.enable');
    await conn.cdp('Page.navigate', {
      url: 'https://www.google.com/maps/search/' + encodeURIComponent(query) + '?hl=en',
    });
    await sleep(SETTLE_MS);

    // Scroll to the plateau. The count going still is the only reliable end:
    // the feed has no total, and a fixed number of scrolls either stops early on
    // a big town or wastes minutes on a small one.
    let last = -1;
    let stable = 0;
    let scrolls = 0;
    for (; scrolls < MAX_SCROLLS && stable < PLATEAU_ROUNDS; scrolls++) {
      const n = await conn.evaluate(`(() => {
        const f = document.querySelector('[role="feed"]');
        if (f) f.scrollTop = f.scrollHeight;
        return document.querySelectorAll('a[href*="/maps/place/"]').length;
      })()`);
      if (n === last) stable++;
      else {
        stable = 0;
        last = n;
      }
      if (last >= max) break;
      await sleep(SCROLL_PAUSE_MS);
    }

    const page = await conn.evaluate(EXTRACT);
    const businesses = page.businesses.filter((b) => b.name).slice(0, max);
    const sig = page.signals;
    // An empty feed is the ambiguous case the whole design is about, so it is
    // never a count. Everything else that says "degraded" is reported alongside.
    const blocked = sig.captcha || sig.consent || !page.feedPresent || businesses.length === 0;

    return {
      query,
      keyword,
      place: place || null,
      businesses,
      found: blocked ? null : businesses.length,
      capped: businesses.length >= max,
      blocked,
      blockedReason: blocked
        ? (sig.captcha ? 'captcha' : sig.consent ? 'consent wall' : !page.feedPresent ? 'no results feed' : 'feed returned nothing — indistinguishable from a soft block, not recorded as 0')
        : null,
      // Not a block on its own — Maps serves this to signed-out sessions — but it
      // is the difference between two runs that otherwise look the same.
      limitedView: sig.limitedView,
      signedIn: sig.signedIn,
      scrolls,
      tookMs: Date.now() - startedAt,
      at: new Date().toISOString(),
    };
  } finally {
    try { ws?.close(); } catch { /* already gone */ }
    chrome.kill('SIGKILL');
  }
}

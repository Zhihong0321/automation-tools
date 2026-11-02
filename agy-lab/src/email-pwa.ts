// /email-marketing as an installable phone app (PWA): the manifest, the icons and a
// small service worker. The page stays the one in email-marketing-page.ts.
//
// The service worker keeps only the page itself, so the app opens with no signal.
// It never touches /api/: replies, leads and numbers are private and always live.
// Icons are drawn here as PNGs, so no image files sit in the repo.
import zlib from 'node:zlib';

const THEME = '#0f1115';
const ACCENT = [122, 162, 247] as const; // the page's --accent
const BG = [15, 17, 21] as const;

export const SW_PATH = '/email-marketing-sw.js';
export const MANIFEST_PATH = '/email-marketing/manifest.webmanifest';
const ICON = /^\/email-marketing\/icon-(180|192|512)\.png$/;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** Distance from point p to the segment a-b. */
function near(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** A blue envelope on the app's dark background, inside the safe area, so any mask keeps it whole. */
export function iconPng(size: number): Buffer {
  const rows: Buffer[] = [];
  const left = 0.24, right = 0.76, top = 0.33, bottom = 0.67, line = 0.022;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      let colour: readonly number[] = BG;
      if (u >= left && u <= right && v >= top && v <= bottom) {
        colour = ACCENT;
        // The flap: two strokes from the top corners down to the middle.
        if (near(u, v, left, top, 0.5, 0.55) < line || near(u, v, right, top, 0.5, 0.55) < line) colour = BG;
      }
      row.set([colour[0]!, colour[1]!, colour[2]!, 255], 1 + x * 4);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const manifest = () => ({
  name: 'Email hub',
  short_name: 'Email hub',
  description: 'Replies, today\'s sends and campaign totals.',
  id: '/email-marketing',
  start_url: '/email-marketing',
  scope: '/email-marketing',
  display: 'standalone',
  orientation: 'portrait',
  background_color: THEME,
  theme_color: THEME,
  icons: [
    { src: '/email-marketing/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/email-marketing/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
});

export const serviceWorker = () => `// Email hub app shell. Bump CACHE to drop the old copy.
const CACHE = 'email-hub-v1';
const PAGE = '/email-marketing';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add(PAGE)).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Only the page, network first. Everything else, and all of /api/, goes straight to the network.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || e.request.mode !== 'navigate' || url.origin !== location.origin || !url.pathname.startsWith(PAGE)) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(PAGE, copy)); }
    return res;
  }).catch(() => caches.match(PAGE).then((hit) => hit || Response.error())));
});
`;

export interface PwaFile { type: string; body: string | Buffer; cache: string }

/** The file for a PWA path, or null when the path is not one of them. */
export function file(pathname: string): PwaFile | null {
  if (pathname === MANIFEST_PATH) return { type: 'application/manifest+json; charset=utf-8', body: JSON.stringify(manifest()), cache: 'no-cache' };
  if (pathname === SW_PATH) return { type: 'text/javascript; charset=utf-8', body: serviceWorker(), cache: 'no-cache' };
  const icon = ICON.exec(pathname);
  if (icon) return { type: 'image/png', body: iconPng(Number(icon[1])), cache: 'public, max-age=86400' };
  return null;
}

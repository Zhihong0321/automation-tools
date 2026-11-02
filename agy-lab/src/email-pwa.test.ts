import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { file, iconPng, manifest, serviceWorker, MANIFEST_PATH, SW_PATH } from './email-pwa.ts';
import { page } from './email-marketing-page.ts';

test('the manifest makes the hub an installable standalone app', () => {
  const m = file(MANIFEST_PATH)!;
  assert.match(m.type, /manifest\+json/);
  const j = JSON.parse(String(m.body));
  assert.deepEqual([j.display, j.start_url, j.scope], ['standalone', '/email-marketing', '/email-marketing']);
  assert.ok(j.start_url.startsWith(j.scope));
  assert.deepEqual(j.icons.map((i: { sizes: string }) => i.sizes), ['192x192', '512x512']);
  for (const i of j.icons) assert.ok(file(i.src), i.src + ' is served');
});

test('icons are real PNGs of the size asked for', () => {
  for (const size of [180, 192, 512]) {
    const f = file(`/email-marketing/icon-${size}.png`)!;
    const png = f.body as Buffer;
    assert.equal(f.type, 'image/png');
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size]);
    // The pixels inflate to exactly size rows of (1 + 4 * size) bytes.
    const idatAt = png.indexOf('IDAT');
    const len = png.readUInt32BE(idatAt - 4);
    assert.equal(zlib.inflateSync(png.subarray(idatAt + 4, idatAt + 4 + len)).length, size * (1 + 4 * size));
  }
  assert.equal(file('/email-marketing/icon-64.png'), null);
  assert.ok(iconPng(192).length > 100);
});

test('the service worker keeps the page for offline and never touches /api/', () => {
  const sw = serviceWorker();
  assert.equal(file(SW_PATH)!.cache, 'no-cache');
  assert.match(sw, /mode !== 'navigate'/);
  assert.doesNotMatch(sw, /cache\.put\([^)]*\/api/);
  assert.doesNotMatch(sw, /\$\{/);
  assert.equal(file('/email-marketing/other.png'), null);
  assert.equal(manifest().name, 'Email hub');
});

test('the page links the manifest, the icons and registers the worker', () => {
  const html = page();
  assert.match(html, /rel="manifest" href="\/email-marketing\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\/email-marketing\/icon-180\.png"/);
  assert.match(html, /serviceWorker\.register\('\/email-marketing-sw\.js'/);
  assert.match(html, /id="install"/);
});

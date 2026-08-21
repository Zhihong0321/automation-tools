import test from 'node:test';
import assert from 'node:assert/strict';
import { page } from './portal.ts';

test('end-user portal combines discovery, deep research, and report library', () => {
  const html = page();
  assert.match(html, /width=device-width/);
  assert.match(html, /Find the companies worth knowing/);
  assert.match(html, /Research library/);
  assert.match(html, /\/api\/business-search/);
  assert.match(html, /\/api\/company-research/);
  assert.match(html, /\/api\/reports\?limit=/);
  assert.match(html, /Deep research/);
  assert.match(html, /sessionStorage/);
  assert.doesNotMatch(html, /eternalgy2026/i);
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test('portal uses a mobile bottom navigation and scoped access gate', () => {
  const html = page();
  assert.match(html, /class="mobile-nav"/);
  assert.match(html, /@media\(max-width:820px\)/);
  assert.match(html, /Workspace access key/);
  assert.match(html, /never added to a report link/);
});

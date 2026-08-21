import test from 'node:test';
import assert from 'node:assert/strict';
import { page } from './portal.ts';

test('end-user portal combines discovery, deep research, and report library', () => {
  const html = page();
  assert.match(html, /width=device-width/);
  assert.match(html, /Find the companies worth knowing/);
  assert.match(html, /Research library/);
  assert.match(html, />Reports<\/button>/);
  assert.match(html, /\/api\/business-search/);
  assert.match(html, /\/api\/company-research/);
  assert.match(html, /person_research/);
  assert.match(html, /VIP briefs/);
  assert.match(html, /\/api\/reports\?limit=/);
  assert.match(html, /Deep research →/);
  assert.match(html, /aria-label="Start deep research for /);
  assert.match(html, /Research underway/);
  assert.match(html, /Open research report for /);
  assert.match(html, /Open report any time to follow progress/);
  assert.match(html, /Enter a business, a location, or both/);
  assert.match(html, /if\(!keyword&&!place\)/);
  assert.doesNotMatch(html, /id="keyword" required/);
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

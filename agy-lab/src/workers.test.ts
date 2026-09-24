import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { page } from './workers.ts';
import { CLIENT_NAV, OPERATOR_NAV, navHtml } from './nav.ts';

// The dashboard is a shell over the broker's own snapshot. These tests pin the
// two things that would make it lie or leak: reading anything other than the one
// authenticated endpoint, and rendering a worker-controlled string unescaped.

test('the worker dashboard reads the live broker snapshot with a bearer token', () => {
  const html = page();
  assert.match(html, /fetch\('\/api\/jobs'/);
  assert.match(html, /authorization:'Bearer '\+token\(\)/);
  assert.match(html, /localStorage\.setItem\('labToken'/);
  // Polling is what makes "what is each worker doing right now" true rather than
  // a snapshot of whenever the page was opened.
  assert.match(html, /setInterval\(refresh,\s*5000\)/);
});

test('the worker dashboard ships no credential of its own', () => {
  const html = page();
  // The page is served without a token and must stay worth nothing to a scanner.
  assert.doesNotMatch(html, /Bearer\s+[A-Za-z0-9_\-.]{20,}/);
  assert.doesNotMatch(html, /eternalgy2026/i);
});

test('the worker dashboard renders liveness, current task and the pending queue', () => {
  const html = page();
  assert.match(html, /Worker lanes/);
  assert.match(html, /Current task/);
  assert.match(html, /Pending queue/);
  // A worker's own reported status is what separates "gone" from "in cooldown" --
  // collapsing them sends an operator to the wrong machine.
  assert.match(html, /\.online,.busy\{color:var\(--ok\)\}/);
  assert.match(html, /\.offline,.error\{color:var\(--bad\)\}/);
  assert.match(html, /\.cooldown,.idle\{color:var\(--warn\)\}/);
  assert.match(html, /status=w\.status\|\|'offline'/);
  assert.match(html, /No claimed job/);
  assert.match(html, /No workers have checked in/);
});

test('the control room visibly shows quota reached and a live reset countdown', async () => {
  const html = page();
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script);
  const until = new Date(Date.now() + 5_825_000).toISOString();
  const nodes = new Map<string, { textContent: string; innerHTML: string; className: string; disabled: boolean; value: string; onclick?: () => void }>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', className: '', disabled: false, value: '' });
    return nodes.get(id)!;
  };
  const countdownNode = { textContent: '', getAttribute: () => until };
  const intervals = new Map<number, () => void>();
  vm.runInNewContext(script, {
    document: { getElementById: node, querySelectorAll: () => [countdownNode] },
    localStorage: { getItem: () => 'test-token', setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ workers: [{
      name: 'macmini-agy1', ip: '203.0.113.7', status: 'cooldown',
      lastSeenAt: new Date().toISOString(), types: ['agy.ask'], taken: 4, done: 2, failed: 1,
      cooldownUntil: until, cooldownReason: 'Individual quota reached',
    }], jobs: [] }) }),
    setInterval: (callback: () => void, ms: number) => { intervals.set(ms, callback); return 1; },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(node('mCooldown').textContent, 1);
  assert.equal(node('mIdle').textContent, 0);
  assert.match(node('workers').innerHTML, /quota cooldown/);
  assert.match(node('workers').innerHTML, /Quota reached · waiting for refresh in/);
  assert.match(node('workers').innerHTML, /Waiting for quota refresh/);
  assert.match(node('workers').innerHTML, /1h 37m/);
  intervals.get(1000)?.();
  assert.match(countdownNode.textContent, /1h 37m/);
});

test('every worker and job field is escaped before it reaches the page', () => {
  const html = page();
  // A worker name, an IP and a job type all come over the wire from something
  // this process does not control, so each has to go through esc().
  assert.match(html, /\{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'\}/);
  for (const field of ['w.name', 'w.ip', 'w.lastSeenAt', 'w.taken', 'w.done', 'w.failed']) {
    assert.ok(html.includes(`esc(${field}`), `${field} must be escaped`);
  }
  // types is joined first and escaped as a whole, so it is not `esc(w.types`.
  assert.ok(html.includes(`esc((w.types||[]).join(', ')`), 'w.types must be escaped');
  for (const field of ['j.type', 'j.id', 'job.type', 'job.id', 'job.attempts']) {
    assert.ok(html.includes(`esc(${field}`), `${field} must be escaped`);
  }
  // Concatenating a field straight into a row is the shape the escaping above
  // replaces; if one appears, the row above it is no longer the only writer.
  assert.doesNotMatch(html, /\+w\.(name|ip|types|lastSeenAt|taken|done|failed)/);
  assert.doesNotMatch(html, /\+j\.(type|id|payload|startedAt)/);
  assert.doesNotMatch(html, /\+job\.(type|id|createdAt|attempts)/);
});

test('the worker dashboard is operator-only, not part of the shared report navigation', () => {
  assert.ok(OPERATOR_NAV.some((link) => link.href === '/workers'));
  assert.equal(CLIENT_NAV.some((link) => link.href === '/workers'), false);
  // And it knows it is the current page, so the nav does not mislead.
  assert.match(navHtml(OPERATOR_NAV, '/workers'), /href="\/workers"[^>]*aria-current="page"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
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

// The scan's one rule, tested without needing Google to misbehave on cue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './gmap.mjs';

const page = (over = {}) => ({
  feedPresent: true,
  signals: { captcha: false, consent: false, limitedView: false, signedIn: true, ...(over.signals ?? {}) },
  ...over,
});
const list = (n) => Array.from({ length: n }, (_, i) => ({ name: 'biz ' + i }));

test('an empty feed is blocked with a null count, never found: 0', () => {
  const r = classify(page(), [], 50);
  assert.equal(r.found, null, 'found must be null, not 0');
  assert.equal(r.blocked, true);
  assert.match(r.blockedReason, /soft block/);
});

test('a missing feed is blocked and named as such', () => {
  const r = classify(page({ feedPresent: false }), [], 50);
  assert.equal(r.found, null);
  assert.equal(r.blockedReason, 'no results feed');
});

test('captcha and consent are reported distinctly, results discarded', () => {
  assert.equal(classify(page({ signals: { captcha: true } }), list(9), 50).blockedReason, 'captcha');
  assert.equal(classify(page({ signals: { consent: true } }), list(9), 50).blockedReason, 'consent wall');
  // Results present but the page is compromised: the count is still withheld.
  assert.equal(classify(page({ signals: { captcha: true } }), list(9), 50).found, null);
});

test('a real result set counts, and caps only at the limit', () => {
  const ok = classify(page(), list(12), 50);
  assert.deepEqual([ok.found, ok.blocked, ok.capped], [12, false, false]);
  assert.equal(classify(page(), list(50), 50).capped, true);
});

test('a blocked scan is never also capped', () => {
  assert.equal(classify(page({ feedPresent: false }), [], 0).capped, false);
});

test('limitedView is carried through, and is not itself a block', () => {
  const r = classify(page({ signals: { limitedView: true, signedIn: false } }), list(30), 50);
  assert.equal(r.limitedView, true);
  assert.equal(r.blocked, false);
  assert.equal(r.found, 30);
});

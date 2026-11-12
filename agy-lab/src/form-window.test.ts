import test from 'node:test';
import assert from 'node:assert/strict';
import { formWindowOpen, FORM_WINDOW_START_MIN, FORM_WINDOW_END_MIN } from './form-autopilot.ts';

// Kuala Lumpur is UTC+8 all year, so 09:00 KL is 01:00 UTC.
const kl = (iso: string) => new Date(iso);

test('the form window is 09:00 to 17:30 Kuala Lumpur time', () => {
  assert.equal(FORM_WINDOW_START_MIN, 9 * 60);
  assert.equal(FORM_WINDOW_END_MIN, 17 * 60 + 30);
  assert.equal(formWindowOpen(kl('2026-11-12T00:59:00Z')), false, '08:59 KL is closed');
  assert.equal(formWindowOpen(kl('2026-11-12T01:00:00Z')), true, '09:00 KL is open');
  assert.equal(formWindowOpen(kl('2026-11-12T09:29:00Z')), true, '17:29 KL is open');
  assert.equal(formWindowOpen(kl('2026-11-12T09:30:00Z')), false, '17:30 KL is closed');
  assert.equal(formWindowOpen(kl('2026-11-12T15:19:00Z')), false, '23:19 KL is closed');
});

test('the form window is open on weekends too (no weekday rule for forms)', () => {
  assert.equal(formWindowOpen(kl('2026-11-14T03:00:00Z')), true, 'Saturday 11:00 KL is open');
  assert.equal(formWindowOpen(kl('2026-11-15T03:00:00Z')), true, 'Sunday 11:00 KL is open');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { RAMP, PARTNERS, dailyTarget, dueNow, dayFraction, isPartner, parseDraft, personName } from './warmup.ts';

test('every partner address is a .wm address on ee-mail, and none is a real business address', () => {
  for (const p of PARTNERS) assert.ok(isPartner(p), p);
  assert.equal(new Set(PARTNERS).size, PARTNERS.length);
  assert.ok(!isPartner('payroll@eternalgy.me'));
  assert.ok(!isPartner('daniel.ong.wm@gmail.com'));
});

test('names come from the address', () => {
  assert.equal(personName('michelle.tan@eternalgy.asia'), 'Michelle Tan');
  assert.equal(personName('daniel.ong.wm@eternalgy.me'), 'Daniel Ong');
});

test('the daily number ramps up to the cap and never above', () => {
  assert.equal(dailyTarget(0), RAMP.start);
  assert.equal(dailyTarget(1), RAMP.start + RAMP.perDay);
  assert.equal(dailyTarget(500), RAMP.cap);
});

test('the day is spread over all 24 hours with no window', () => {
  assert.equal(dueNow(10, 0), 0);
  assert.equal(dueNow(10, 0.5), 5);
  assert.equal(dueNow(10, 1), 10);
  assert.equal(dueNow(10, 2), 10);
  const f = dayFraction(new Date());
  assert.ok(f >= 0 && f <= 1);
});

test('a draft is read from JSON, fenced JSON, or plain text, and never throws', () => {
  assert.deepEqual(parseDraft('{"subject":"Hi","body":"Hello there"}'), { subject: 'Hi', body: 'Hello there' });
  assert.deepEqual(parseDraft('```json\n{"subject":"Hi","body":"Hello"}\n```'), { subject: 'Hi', body: 'Hello' });
  assert.deepEqual(parseDraft('Just text, thanks.'), { subject: null, body: 'Just text, thanks.' });
  assert.deepEqual(parseDraft('{broken json'), { subject: null, body: '{broken json' });
  assert.deepEqual(parseDraft(''), { subject: null, body: '' });
});

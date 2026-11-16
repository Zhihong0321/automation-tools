import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTNERS, isPartner, parseDraft, personName } from './warmup.ts';

test('every partner is a .wm address on eternalgy.me, the one ee-mail domain that can send', () => {
  for (const p of PARTNERS) assert.ok(isPartner(p), p);
  assert.equal(new Set(PARTNERS).size, PARTNERS.length);
  assert.ok(!isPartner('payroll@eternalgy.me'));
  assert.ok(!isPartner('daniel.ong.wm@eternalgy.com'));
});

test('names come from the address', () => {
  assert.equal(personName('michelle.tan@eternalgy.asia'), 'Michelle Tan');
  assert.equal(personName('daniel.ong.wm@eternalgy.me'), 'Daniel Ong');
});

test('a draft is read from JSON, fenced JSON or plain text, and never throws', () => {
  assert.deepEqual(parseDraft('{"subject":"Hi","body":"Hello there"}'), { subject: 'Hi', body: 'Hello there' });
  assert.deepEqual(parseDraft('```json\n{"subject":"Hi","body":"Hello"}\n```'), { subject: 'Hi', body: 'Hello' });
  assert.deepEqual(parseDraft('Just text, thanks.'), { subject: null, body: 'Just text, thanks.' });
  assert.deepEqual(parseDraft('{broken json'), { subject: null, body: '{broken json' });
  assert.deepEqual(parseDraft(''), { subject: null, body: '' });
});

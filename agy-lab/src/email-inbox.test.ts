import test from 'node:test';
import assert from 'node:assert/strict';
import { mailbox } from './core/index.ts';
import { coveredBy, merge, normId, sameSite } from './email-inbox.ts';

test('a contact-form answer is matched by the website: same host, or one inside the other', () => {
  assert.equal(sameSite('komasi.com', 'www.komasi.com'), true);
  assert.equal(sameSite('mail.acme.com.my', 'acme.com.my'), true);
  assert.equal(sameSite('acme.com.my', 'shop.acme.com.my'), true);
  assert.equal(sameSite('notacme.com.my', 'acme.com.my'), false);
  assert.equal(sameSite('acme.com', ''), false);
});

test('mailbox logins: one per line, Google app password pasted in groups, hosts optional', () => {
  const list = mailbox.parseLogins([
    '# the Smartlead sender',
    'Eternalgy@atap.solar abcd efgh ijkl mnop',
    '',
    'nurul@eternalgy.me my long pass imap=imap.hostinger.com smtp=smtp.hostinger.com:587',
    'not-an-address secret',
    'lonely@example.com',
  ].join('\n'));
  assert.deepEqual(list, [
    { email: 'eternalgy@atap.solar', pass: 'abcdefghijklmnop', imap: null, smtp: null },
    { email: 'nurul@eternalgy.me', pass: 'my long pass', imap: { host: 'imap.hostinger.com', port: 993 }, smtp: { host: 'smtp.hostinger.com', port: 587 } },
  ]);
});

test('mailbox servers: Gmail addresses need no lookup, named hosts win', async () => {
  const s = await mailbox.servers({ email: 'a@gmail.com', pass: 'x', imap: null, smtp: null });
  assert.deepEqual(s, { imap: { host: 'imap.gmail.com', port: 993 }, smtp: { host: 'smtp.gmail.com', port: 465 } });
  const own = await mailbox.servers({ email: 'a@x.test', pass: 'x', imap: { host: 'i.x.test', port: 143 }, smtp: { host: 's.x.test', port: 25 } });
  assert.deepEqual(own, { imap: { host: 'i.x.test', port: 143 }, smtp: { host: 's.x.test', port: 25 } });
});

test('a mail Smartlead reported around the same time is its reply, not a direct one', () => {
  const at = Date.parse('2026-11-02T10:00:00Z');
  assert.equal(coveredBy(at, [Date.parse('2026-11-02T10:04:00Z')]), true, 'webhook a few minutes after the mail');
  assert.equal(coveredBy(at, [Date.parse('2026-11-02T10:50:00Z')]), true, 'slow Smartlead reply check');
  assert.equal(coveredBy(at, [Date.parse('2026-11-02T09:00:00Z')]), false, 'an earlier reply in the thread');
  assert.equal(coveredBy(at, []), false, 'Smartlead never saw it');
});

test('merge: direct mail joins the Smartlead thread once, oldest first', () => {
  const sl = [
    { inbound: false, message_id: '<a@sl>', time: '2026-11-01T09:00:00Z', body: 'our pitch' },
    { inbound: true, message_id: '<B@mail.gmail.com>', time: '2026-11-01T10:00:00Z', body: 'reply in thread' },
  ];
  const direct = [
    { inbound: true, message_id: 'b@mail.gmail.com', time: '2026-11-01T10:00:30Z', body: 'same reply, seen in the mailbox' },
    { inbound: true, message_id: '<c@x>', time: '2026-11-01T10:05:00Z', body: 'no id match, but within ten minutes of their reply' },
    { inbound: true, message_id: '<d@x>', time: '2026-11-02T08:00:00Z', body: 'a new email to us next day' },
    { inbound: false, message_id: '<e@hub>', time: '2026-11-02T09:00:00Z', body: 'our SMTP answer' },
  ];
  assert.deepEqual(merge(sl, direct).map((m) => m.body), ['our pitch', 'reply in thread', 'a new email to us next day', 'our SMTP answer']);
  assert.equal(normId(' <X@Y> '), 'x@y');
});

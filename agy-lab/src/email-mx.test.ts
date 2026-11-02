import test from 'node:test';
import assert from 'node:assert/strict';
import { domainOf, hostLabel, resolveHost, filterHost, countHosts, UNKNOWN, NO_MX, UNCHECKED, type Resolve } from './email-mx.ts';
import { page } from './email-marketing-page.ts';

const answer = (...exchange: string[]): Resolve => async () => exchange.map((e, i) => ({ exchange: e, priority: i + 1 }));
const fails = (code: string): Resolve => async () => { throw Object.assign(new Error(code), { code }); };

test('the domain is whatever follows the last @, lower-cased', () => {
  assert.equal(domainOf('Sales@Acme.COM.my'), 'acme.com.my');
});

test('Google, Microsoft and other majors are named; any other host is Unknown', async () => {
  assert.equal(hostLabel((await resolveHost('a.com', answer('aspmx.l.google.com')))!), 'Google');
  assert.equal(hostLabel((await resolveHost('b.com', answer('b-com.mail.protection.outlook.com')))!), 'Microsoft');
  assert.equal(hostLabel((await resolveHost('c.com', answer('mx.zoho.com')))!), 'Zoho');
  assert.equal(hostLabel((await resolveHost('d.com', answer('mail.d.com')))!), UNKNOWN);
  // A security gateway in front of the real mailbox is not a major provider.
  assert.equal(hostLabel((await resolveHost('e.com', answer('us-smtp-inbound-1.mimecast.com')))!), UNKNOWN);
});

test('a domain that does not exist or has no MX is "No mail server", not a failure', async () => {
  assert.equal(hostLabel((await resolveHost('gone.example', fails('ENOTFOUND')))!), NO_MX);
  assert.equal(hostLabel((await resolveHost('nomx.example', fails('ENODATA')))!), NO_MX);
});

test('a DNS hiccup is asked twice, then stores nothing', async () => {
  let calls = 0;
  const flaky: Resolve = async () => { calls++; throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }); };
  assert.equal(await resolveHost('slow.example', flaky), null);
  assert.equal(calls, 2);
  let n = 0;
  const once: Resolve = async () => { if (n++ === 0) throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }); return [{ exchange: 'aspmx.l.google.com', priority: 1 }]; };
  assert.equal(hostLabel((await resolveHost('later.example', once))!), 'Google');
});

test('the lead list filters and counts by mail host', () => {
  const rows = [
    { email: 'a@x.com', mail_host: 'Google' }, { email: 'b@x.com', mail_host: 'Google' }, { email: 'a@x.com', mail_host: 'Google' },
    { email: 'c@y.com', mail_host: 'Microsoft' }, { email: 'd@z.com', mail_host: UNKNOWN }, { email: 'e@w.com', mail_host: null },
  ];
  assert.deepEqual(countHosts(rows), { Google: 2, Microsoft: 1, [UNKNOWN]: 1, [UNCHECKED]: 1 });
  assert.equal(filterHost(rows, 'all').length, 6);
  assert.equal(filterHost(rows, undefined).length, 6);
  assert.deepEqual(filterHost(rows, 'google').map((r) => r.email), ['a@x.com', 'b@x.com', 'a@x.com']);
  assert.deepEqual(filterHost(rows, UNCHECKED).map((r) => r.email), ['e@w.com']);
});

test('the leads page carries the mail host filter and column', () => {
  const html = page();
  assert.match(html, /id="leadHost"/);
  assert.match(html, /<th>Mail host<\/th>/);
  assert.doesNotMatch(html, /\$\{/);
});

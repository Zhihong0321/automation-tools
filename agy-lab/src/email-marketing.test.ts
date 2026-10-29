import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, mailName, toSmartlead, textToHtml, htmlToText, inboxItem, threadMessage } from './email-marketing.ts';
import { page } from './email-marketing-page.ts';
import type { EmailRow } from './email-list.ts';

const row = (over: Partial<EmailRow> = {}): EmailRow => ({
  email: 'sales@acme.com.my', company_id: '42', company_name: 'Acme Sdn Bhd', category: 'Factory',
  person_name: null, person_role: null, sources: ['website'], source_url: null, lead_status: null, assigned_to: null, ...over,
});

test('a lead needs a company name and a real mailbox', () => {
  assert.equal(eligible(row()), true);
  assert.equal(eligible(row({ company_name: '  ' })), false);
  assert.equal(eligible(row({ email: 'logo@2x.png' })), false);
  assert.equal(eligible(row({ email: 'no-at-sign.com' })), false);
});

test('a person name splits into first and last; the hub id rides along', () => {
  const lead = toSmartlead(row({ person_name: 'Tan Wei Ming', person_role: 'Director' }));
  assert.equal(lead.first_name, 'Tan');
  assert.equal(lead.last_name, 'Wei Ming');
  assert.deepEqual(lead.custom_fields, { hub_company_id: '42', category: 'Factory', role: 'Director' });
  assert.equal(toSmartlead(row()).first_name, undefined);
});

test('a Maps title loses its emoji and tagline before it goes into an email', () => {
  assert.equal(mailName('️ ️ AK Freight Sdn Bhd | logistics Service Provider | Malaysia'), 'AK Freight Sdn Bhd');
  assert.equal(mailName('Syarikat Lim & Sons - Solar Installer'), 'Syarikat Lim & Sons');
  assert.equal(mailName('Coca-Cola Bottlers (M) Sdn Bhd'), 'Coca-Cola Bottlers (M) Sdn Bhd');
  assert.equal(toSmartlead(row({ company_name: '🌞 Sun Power | Johor' })).company_name, 'Sun Power');
});

test('plain text becomes paragraphs and comes back the same', () => {
  const text = 'Hi {{company_name}} team,\n\nLine one\nline two <ok>';
  const html = textToHtml(text);
  assert.equal(html, '<p>Hi {{company_name}} team,</p><p>Line one<br>line two &lt;ok&gt;</p>');
  assert.equal(htmlToText(html), text);
});

test('inbox rows and thread messages read either field naming', () => {
  const a = inboxItem({ lead_email: 'x@y.com', email_campaign_id: 7, email_lead_id: 9, last_reply_time: 't', is_read: false });
  assert.deepEqual([a.email, a.campaign_id, a.lead_id, a.unread], ['x@y.com', 7, 9, true]);
  const b = inboxItem({ lead: { email: 'x@y.com', id: 9 }, campaign: { id: 7, name: 'C' }, last_message: { body: '<p>hello</p>' } });
  assert.deepEqual([b.email, b.campaign_id, b.lead_id, b.preview], ['x@y.com', 7, 9, 'hello']);
  const m = threadMessage({ type: 'REPLY', stats_id: 's', message_id: '<m>', time: 't', email_body: '<p>yes</p>' });
  assert.deepEqual([m.inbound, m.stats_id, m.body], [true, 's', 'yes']);
  assert.equal(threadMessage({ type: 'SENT' }).inbound, false);
});

test('the page links out and calls only its own API', () => {
  const html = page();
  assert.match(html, /aria-current="page">Email marketing</);
  assert.doesNotMatch(html, /\$\{/);
  assert.doesNotMatch(html, /api_key=|server\.smartlead\.ai/i);
});

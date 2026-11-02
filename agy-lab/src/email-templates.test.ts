import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { check, fillSender, render, cleanSteps, readSender, DEFAULT_SENDER, type Sender, type Step } from './email-templates.ts';
import { page } from './email-marketing-page.ts';

const sender: Sender = { sender_name: 'Tan Wei Ming', sender_title: 'Director', sender_phone: '+60 11-2100 0099', sender_footer: 'Eternalgy Sdn Bhd. Reply "stop" to opt out.' };
const step = (over: Partial<Step> = {}): Step => ({ subject: '{{company_name}}: electricity bill', body: 'Hi {{company_name}} team,\n\nHello.\n\n{{sender_name}}, {{sender_title}}\n{{sender_footer}}', delay_days: 0, ...over });
const errors = (steps: Step[], s = sender) => check(steps, s).filter((p) => p.level === 'error').map((p) => p.text);

test('sender fields are filled from the profile; lead fields are left for Smartlead', () => {
  assert.equal(fillSender('Hi {{company_name}}, {{sender_name}} ({{ Sender_Title }})', sender), 'Hi {{company_name}}, Tan Wei Ming (Director)');
});

test('a preview fills the lead fields too, and an unknown field stays visible', () => {
  assert.equal(render('Hi {{first_name}}{{company_name}} {{company}}', sender, { company_name: 'Acme' }), 'Hi Acme {{company}}');
});

test('a clean template has no errors', () => {
  assert.deepEqual(errors([step()]), []);
});

test('a field nobody fills is an error ({{company}} is not {{company_name}})', () => {
  const e = errors([step({ body: 'Hi {{company}} team' })]);
  assert.equal(e.length, 1);
  assert.match(e[0]!, /\{\{company\}\} is not filled by anything/);
});

test('a sender field the profile leaves empty is an error', () => {
  const e = errors([step()], { ...sender, sender_title: '' });
  assert.deepEqual(e, ['{{sender_title}} is used but the sender profile has no value for it. Fill it in under Sender.']);
  assert.deepEqual(errors([step({ body: 'Hi {{company_name}} team. Reply "stop" to opt out.' })], DEFAULT_SENDER), []);
});

test('a note to yourself left in the text is an error', () => {
  const e = errors([step({ body: 'Hi {{company_name}} team,\n\nGreen financing through Maybank [CONFIRM wording]\n\n[Sender name] Reply "stop".' })]);
  assert.equal(e.length, 2);
  assert.ok(e.some((t) => t.includes('[CONFIRM wording]')));
  assert.ok(e.some((t) => t.includes('[Sender name]')));
});

test('{{first_name}} warns because most leads have no person name; no opt-out warns too', () => {
  const warns = check([step({ body: 'Hi {{first_name}}, hello' })], sender).filter((p) => p.level === 'warn').map((p) => p.text);
  assert.equal(warns.length, 2);
  assert.match(warns[0]!, /first_name.*blank/);
  assert.match(warns[1]!, /opt out/);
});

test('steps and the sender are cleaned from whatever the page sends', () => {
  assert.deepEqual(cleanSteps([{ subject: 1, body: null, delay_days: '3.4' }, { delay_days: -2 }]), [
    { subject: '1', body: '', delay_days: 3 }, { subject: '', body: '', delay_days: 0 }]);
  assert.deepEqual(cleanSteps('nope'), []);
  assert.equal(readSender({ sender_name: '  Ann ', other: 'x' }).sender_name, 'Ann');
  assert.equal(readSender({}).sender_phone, '');
});

test('the page has a Templates tab, and its script is valid JavaScript', () => {
  const html = page();
  assert.match(html, /data-view="templates"/);
  assert.match(html, /id="tplPick"/);
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new vm.Script(script));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readSettings, DEFAULTS, SENT } from './form-autopilot.ts';
import { isTarget, isTargetCompany, TARGET_CATEGORY } from './email-autopilot.ts';

test('the contact-form autopilot ships off, 10 a day, and keeps per_day between 1 and 100', () => {
  assert.deepEqual(readSettings({}), DEFAULTS);
  assert.equal(DEFAULTS.enabled, false);
  assert.equal(readSettings({ enabled: 'yes' }).enabled, false);
  assert.equal(readSettings({ per_day: 0 }).per_day, 10);
  assert.equal(readSettings({ per_day: 500 }).per_day, 100);
  assert.equal(readSettings({ enabled: true, per_day: 7.4 }).per_day, 7);
});

test('a form lead is the email target without the email: category and a real company name', () => {
  assert.equal(isTargetCompany({ category: 'Plastic fabrication company', company_name: 'Sin Hup Plastic Sdn Bhd' }), true);
  assert.equal(isTargetCompany({ category: 'Cafe', company_name: 'Kopi Kita' }), false);
  assert.equal(isTargetCompany({ category: 'Manufacturer', company_name: 'Jalan Perindustrian 3, 81400' }), false);
  // A solar installer is a competitor, whatever its category says.
  assert.equal(isTargetCompany({ category: 'Electrical contractor', company_name: 'solar fusion sdn bhd' }), false);
  assert.equal(isTargetCompany({ category: 'Solar energy equipment supplier', company_name: 'Bright Energy Sdn Bhd' }), false);
  // isTarget is still isTargetCompany plus a company email.
  assert.equal(isTarget({ email: 'boss@gmail.com', category: 'Manufacturer', company_name: 'Acme Metal Works' }), false);
  assert.equal(isTarget({ email: 'sales@acme.my', category: 'Manufacturer', company_name: 'Acme Metal Works' }), true);
});

test('the category pattern reaches Postgres with \\y word edges, never \\b (a backspace there)', () => {
  const pg = TARGET_CATEGORY.source.replace(/\\b/g, '\\y');
  assert.ok(!pg.includes('\\b'));
  assert.ok(pg.includes('\\ymill\\y'));
});

test('only an outcome that pressed send counts toward the day', () => {
  assert.deepEqual(SENT, ['sent', 'submitted_unconfirmed']);
});

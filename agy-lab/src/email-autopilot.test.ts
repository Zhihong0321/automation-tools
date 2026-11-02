import test from 'node:test';
import assert from 'node:assert/strict';
import { pickBatch, plan, todaysTarget, inWindow, klNow, readSettings, mixOf, DEFAULTS, type PoolRow, type CampaignState, type Settings } from './email-autopilot.ts';
import { NO_MX } from './email-mx.ts';

let id = 0;
const lead = (host: string | null, over: Partial<PoolRow> = {}): PoolRow => {
  id++;
  return { email: `info${id}@c${id}.com`, company_id: String(id), mail_host: host, person_name: null, lead_status: 'unassigned', ...over };
};
const many = (host: string | null, n: number) => Array.from({ length: n }, () => lead(host));
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, enabled: true, campaign_id: 7, started_on: '2026-11-03', ...over });
const camp = (over: Partial<CampaignState> = {}): CampaignState => ({ name: 'Solar', status: 'ACTIVE', max_new_per_day: 0, not_started: 0, sent: 0, bounced: 0, ...over });

test('a day is spread over mail hosts like the list is, with none above half', () => {
  const pool = [...many('Google', 430), ...many('Unknown', 330), ...many('Microsoft', 150), ...many('Yahoo', 90)];
  const mix = mixOf(pickBatch(pool, 30, 0.5));
  assert.equal(Object.values(mix).reduce((a, b) => a + b, 0), 30);
  assert.ok(mix.Google! >= 11 && mix.Google! <= 15, 'Google ' + mix.Google);
  assert.ok(mix.Unknown! >= 8 && mix.Unknown! <= 11, 'Unknown ' + mix.Unknown);
  assert.ok(mix.Microsoft! >= 3 && mix.Microsoft! <= 6, 'Microsoft ' + mix.Microsoft);
  assert.ok(mix.Yahoo! >= 1, 'Yahoo ' + mix.Yahoo);
});

test('a host that is nearly the whole list is held to the share, so the day comes up short, not lopsided', () => {
  const picked = pickBatch([...many('Google', 100), ...many('Unknown', 2)], 10, 0.5);
  assert.equal(mixOf(picked).Google, 5);
  assert.equal(mixOf(picked).Unknown, 2);
});

test('no mail server, an unchecked host and do-not-call leads are never picked', () => {
  const pool = [...many(NO_MX, 5), ...many(null, 5), lead('Google', { lead_status: 'do_not_call' }), lead('Google')];
  const picked = pickBatch(pool, 10, 1);
  assert.equal(picked.length, 1);
  assert.equal(picked[0]!.lead_status, 'unassigned');
});

test('one email per company, a named person first', () => {
  const generic = lead('Google', { company_id: '900', email: 'info@acme.com' });
  const person = lead('Google', { company_id: '900', email: 'tan@acme.com', person_name: 'Tan' });
  assert.deepEqual(pickBatch([generic, person], 5, 1).map((r) => r.email), ['tan@acme.com']);
  // The same address under two companies goes once.
  const a = lead('Google', { company_id: '1', email: 'shared@x.com' });
  const b = lead('Google', { company_id: '2', email: 'shared@x.com' });
  assert.equal(pickBatch([a, b], 5, 1).length, 1);
});

test('the ramp rises evenly from the start number to the target', () => {
  const s = settings({ new_per_day: 15, ramp_start: 5, ramp_days: 10, started_on: '2026-11-03' });
  assert.equal(todaysTarget(s, '2026-11-03'), 5);
  assert.equal(todaysTarget(s, '2026-11-08'), 10);
  assert.equal(todaysTarget(s, '2026-11-13'), 15);
  assert.equal(todaysTarget(s, '2027-01-01'), 15);
  assert.equal(todaysTarget(settings({ ramp_days: 0, new_per_day: 12 }), '2026-11-03'), 12);
});

test('the daily batch goes in on weekday mornings, Kuala Lumpur time', () => {
  assert.equal(inWindow(new Date('2026-11-03T01:00:00Z')), true);  // Tue 09:00 KL
  assert.equal(inWindow(new Date('2026-11-02T23:30:00Z')), false); // Tue 07:30 KL
  assert.equal(inWindow(new Date('2026-11-03T08:00:00Z')), false); // Tue 16:00 KL
  assert.equal(inWindow(new Date('2026-11-07T02:00:00Z')), false); // Sat
  assert.deepEqual(klNow(new Date('2026-11-02T17:00:00Z')), { day: '2026-11-03', hour: 1, weekday: 'Tue' });
});

test('the plan stops when the campaign is not ready, bounces, or still has leads waiting', () => {
  const pool = many('Google', 50);
  const run = (campaign: CampaignState | null, s = settings()) => plan({ settings: s, today: '2026-11-03', campaign, pool, contacted: new Set() });
  assert.match(run(null).skip!, /not found/);
  assert.match(run(camp({ status: 'PAUSED' })).skip!, /campaign is paused/);
  assert.match(run(camp({ sent: 100, bounced: 5 })).skip!, /Paused: 5\.0% of 100/);
  assert.equal(run(camp({ sent: 10, bounced: 5 })).skip, null); // too few sent to judge
  assert.match(run(camp({ not_started: 10 })).skip!, /10 leads are still waiting/);
  assert.match(run(camp(), settings({ campaign_id: null })).skip!, /Choose the campaign/);
});

test('the plan adds only what the campaign can send in a day, minus what waits', () => {
  const pool = many('Google', 60).concat(many('Unknown', 60));
  const go = (c: CampaignState) => plan({ settings: settings({ new_per_day: 30, ramp_days: 0 }), today: '2026-11-03', campaign: c, pool, contacted: new Set() });
  assert.equal(go(camp()).rows.length, 30);
  assert.equal(go(camp({ max_new_per_day: 15 })).rows.length, 15);
  assert.equal(go(camp({ max_new_per_day: 15, not_started: 4 })).rows.length, 11);
});

test('a company already in a campaign is never picked again', () => {
  const pool = [lead('Google', { company_id: '5' }), lead('Google', { company_id: '6' })];
  const p = plan({ settings: settings(), today: '2026-11-03', campaign: camp(), pool, contacted: new Set(['5']) });
  assert.deepEqual(p.rows.map((r) => r.company_id), ['6']);
  const none = plan({ settings: settings(), today: '2026-11-03', campaign: camp(), pool, contacted: new Set(['5', '6']) });
  assert.match(none.skip!, /No lead is ready/);
});

test('settings are clamped to sane values and default to off', () => {
  assert.equal(readSettings({}).enabled, false);
  const s = readSettings({ enabled: true, new_per_day: 9999, ramp_start: 0, ramp_days: 999, max_provider_share: 5, campaign_id: '12' });
  assert.deepEqual([s.new_per_day, s.ramp_start, s.ramp_days, s.max_provider_share, s.campaign_id], [200, 5, 60, 1, 12]);
  assert.equal(readSettings({ new_per_day: 3, ramp_start: 9 }).ramp_start, 3);
});

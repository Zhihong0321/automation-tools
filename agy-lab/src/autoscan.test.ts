import test from 'node:test';
import assert from 'node:assert/strict';
import { config, holdReason, remaining } from './autoscan.ts';
import { ALL_TERRITORIES, allTamans, withDiscovered } from './territories.ts';

const open = { paused: false, workerLive: true, used: 0, budget: 25_000, inFlight: 0, concurrent: 1, left: 10 };

test('config defaults: running, 25k budget, one at a time, Johor before Selangor', () => {
  assert.deepEqual(config({}), { paused: false, budget: 25_000, concurrent: 1, states: ['johor', 'selangor'] });
  assert.equal(config({ AUTO_SCAN_PAUSED: '1' }).paused, true);
  assert.equal(config({ MAPS_MONTHLY_BUDGET: '280000', AUTO_SCAN_CONCURRENT: '2' }).budget, 280_000);
});

test('the queue holds for a pause, no worker, the budget, a running scan, or nothing left', () => {
  assert.equal(holdReason(open), null);
  assert.match(holdReason({ ...open, paused: true })!, /paused/);
  assert.match(holdReason({ ...open, workerLive: false })!, /no Maps worker/);
  // One more scan's worth would cross the budget: stop before, not after.
  assert.match(holdReason({ ...open, used: 24_700 })!, /budget/);
  assert.equal(holdReason({ ...open, used: 24_000 }), null);
  assert.match(holdReason({ ...open, inFlight: 1 })!, /running/);
  assert.match(holdReason({ ...open, left: 0 })!, /every listed taman/);
});

test('every listed taman is walked in list order, and scanned ones are skipped', () => {
  const tamans = allTamans([], ['johor']);
  const johor = ALL_TERRITORIES.johor!;
  const count = johor.districts.reduce((n, d) => n + d.towns.reduce((m, t) => m + t.tamans.length, 0), 0);
  assert.equal(tamans.length, count);
  assert.equal(tamans[0]!.queryPlace, johor.districts[0]!.towns[0]!.tamans[0]!.queryPlace);
  const done = new Set([tamans[0]!.queryPlace.toLowerCase()]);
  assert.equal(remaining(tamans, done)[0]!.queryPlace, tamans[1]!.queryPlace);
});

test('verified discovered tamans join their district; unverified and already-listed ones do not', () => {
  const johor = ALL_TERRITORIES.johor!;
  const district = johor.districts[0]!;
  const listed = district.towns[0]!.tamans[0]!;
  const districts = withDiscovered(johor, [
    { state: 'Johor', district: district.name, name: 'Taman Baru Contoh', query_place: `Taman Baru Contoh, ${district.name}, Johor`, verified: true },
    { state: 'Johor', district: district.name, name: 'Taman Belum Pasti', query_place: `Taman Belum Pasti, ${district.name}, Johor`, verified: false },
    { state: 'Johor', district: district.name, name: listed.name, query_place: listed.queryPlace, verified: true },
  ]);
  const added = districts[0]!.towns.find((t) => t.name === 'Newly found tamans');
  assert.deepEqual(added?.tamans.map((t) => t.name), ['Taman Baru Contoh']);
  // The shared list itself is untouched.
  assert.equal(johor.districts[0]!.towns.some((t) => t.name === 'Newly found tamans'), false);
  assert.equal(allTamans([], ['johor']).length + 1, allTamans([
    { state: 'Johor', district: district.name, name: 'Taman Baru Contoh', query_place: `Taman Baru Contoh, ${district.name}, Johor`, verified: true },
  ], ['johor']).length);
});

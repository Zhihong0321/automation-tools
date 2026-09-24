import test from 'node:test';
import assert from 'node:assert/strict';
import { isSalesAgent, planPersonRows, type AtapUser } from './atap-import.ts';

const user = (access_level: string[], name = 'Test User'): AtapUser => ({
  id: 1,
  bubble_id: 'user_test',
  email: 'test@example.com',
  access_level,
  linked_agent_profile: null,
  name,
  contact: '0123456789',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

test('access levels seen in the live roster classify correctly', () => {
  assert.ok(isSalesAgent(user(['outsource sales agent (osa)', 'team-kluang'])));
  assert.ok(isSalesAgent(user(['team-jb', 'sales'])));
  assert.ok(isSalesAgent(user(['team-klang', 'sales consultant'])));
  assert.ok(isSalesAgent(user(['sales team manager'])));
  assert.ok(isSalesAgent(user(['sales outsource manager (oum)'])));
  assert.ok(isSalesAgent(user(['senior sales consultant'])));
  assert.ok(isSalesAgent(user(['outsource unit manager (oum)'])));
});

test('non-sales access levels are skipped', () => {
  assert.ok(!isSalesAgent(user(['admin'])));
  assert.ok(!isSalesAgent(user(['finance', 'hr'])));
  assert.ok(!isSalesAgent(user(['engineering', 'seda'])));
  assert.ok(!isSalesAgent(user(['delete this'])));
  assert.ok(!isSalesAgent(user([])));
});

test('sales agents blocked from the app are skipped, even with a sales role', () => {
  assert.ok(!isSalesAgent(user(['sales', 'blocked'])));
});

test('a sales role is still recognised alongside unrelated tags', () => {
  assert.ok(isSalesAgent(user(['finance', 'sales', 'report'])));
});

test('the same person in two source records resolves to one telemarketer row', () => {
  // Real case from the roster: an older account plus a newer duplicate row, and
  // the same person registered under two spellings. One row per person, and the
  // surviving record is the one carrying the most access tags.
  const rich = { ...user(['sales', 'team-jb', 'outsource sales agent (osa)'], 'Fong Mei Teng'), id: 133, bubble_id: 'user_old' };
  const thin = { ...user(['sales'], 'FONG MEI TENG'), id: 100, bubble_id: 'user_new' };
  const plan = planPersonRows([rich, thin]);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.rows[0]!.bubble_id, 'user_old');
  assert.equal(plan.rows[0]!.name, 'Fong Mei Teng');
});

test('the older account wins when two source records carry equal tags', () => {
  const older = { ...user(['sales'], 'Koh Yeong Cherng'), id: 100, bubble_id: 'user_100' };
  const newer = { ...user(['sales'], 'KOH  YEONG CHERNG'), id: 7218, bubble_id: 'user_7218' };
  const plan = planPersonRows([newer, older]);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0]!.bubble_id, 'user_100');
});

test('distinct people are never collapsed together', () => {
  const plan = planPersonRows([
    user(['sales'], 'Alice Tan'),
    user(['sales'], 'Bob Tan'),
    user(['sales'], 'Cindy Tan'),
  ]);
  assert.equal(plan.rows.length, 3);
  assert.equal(plan.duplicates, 0);
});

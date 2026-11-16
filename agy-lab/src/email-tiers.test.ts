import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, parseTiers, tierCounts } from './email-tiers.ts';

const t = (person_name: string | null, person_role: string | null) => tierOf({ person_name, person_role });

test('tier 1: a named CEO, owner, founder, managing director or chairman', () => {
  for (const role of ['CEO', 'Chief Executive Officer', 'Founder & CEO', 'Co-Founder', 'Owner', 'Director / Owner', 'Proprietor',
    'Managing Director', 'MD', 'President', 'Chairman', 'Pengarah Urusan', 'Pemilik', '老板', '董事长', '创办人']) {
    assert.equal(t('Tan Ah Kow', role), 1, role);
  }
});

test('tier 2: a named manager, director, head, PIC or GM', () => {
  for (const role of ['Manager', 'Sales Manager', 'Assistant Manager', 'General Manager', 'GM', 'Marketing Director', 'Executive Director',
    'Head of Purchasing', 'HOP', 'HOD', 'PIC', 'Person in charge', 'Operations Head', 'Pengurus', 'Pengarah', '经理', '总监', '负责人']) {
    assert.equal(t('Siti Aminah', role), 2, role);
  }
});

test('a managing or senior partner is tier 1; C-suite below the CEO is tier 2; a plain contact stays tier 3', () => {
  assert.equal(t('Lee', 'Managing Partner'), 1);
  assert.equal(t('Lee', 'Senior Partner / Founder'), 1);
  assert.equal(t('Lee', 'Pengerusi'), 1);
  assert.equal(t('Lee', 'COO'), 2);
  assert.equal(t('Lee', 'Chief Financial Officer'), 2);
  assert.equal(t('Lee', 'Key Contact'), 3);
  assert.equal(t('Lee', 'Partner'), 3);
  assert.equal(t('Lee', 'Chief Executive Officer'), 1);
});

test('a deputy of the top role is tier 2, never tier 1', () => {
  assert.equal(t('Lim', 'Vice President'), 2);
  assert.equal(t('Lim', 'Deputy CEO'), 2);
  assert.equal(t('Lim', 'Assistant Managing Director'), 2);
});

test('tier 3: a named person with no position, or one that is not clearly a boss or manager', () => {
  assert.equal(t('Lim Mei Ling', null), 3);
  assert.equal(t('Lim Mei Ling', ''), 3);
  assert.equal(t('Lim Mei Ling', 'Sales Executive'), 3);
  assert.equal(t('Lim Mei Ling', 'Engineer'), 3);
});

test('a boss\'s secretary or a former boss is not tier 1', () => {
  assert.equal(t('Lim', 'Personal Assistant to the CEO'), 3);
  assert.equal(t('Lim', 'Secretary to Managing Director'), 3);
  assert.equal(t('Lim', 'Former CEO'), 3);
  assert.equal(t('Lim', 'Ex-Director'), 3);
});

test('tier 4: no person behind the email, whatever else the row says', () => {
  assert.equal(t(null, null), 4);
  assert.equal(t('', 'CEO'), 4);
  assert.equal(t('   ', 'Manager'), 4);
});

test('a bad field never throws: it is read as empty', () => {
  assert.equal(tierOf({}), 4);
  assert.equal(tierOf({ person_name: 42 as any, person_role: { x: 1 } as any }), 3);
  assert.equal(tierOf({ person_name: 'Lim', person_role: undefined }), 3);
});

test('parseTiers reads one tier, a list, a range, or all', () => {
  assert.deepEqual([...parseTiers('1')!], [1]);
  assert.deepEqual([...parseTiers('1,2')!].sort(), [1, 2]);
  assert.deepEqual([...parseTiers('1-3')!].sort(), [1, 2, 3]);
  assert.equal(parseTiers('all'), null);
  assert.equal(parseTiers(''), null);
  assert.equal(parseTiers(null), null);
  assert.equal(parseTiers('nonsense'), null);
});

test('tierCounts counts each tier', () => {
  assert.deepEqual(tierCounts([{ tier: 1 }, { tier: 4 }, { tier: 4 }]), { 1: 1, 2: 0, 3: 0, 4: 2 });
});

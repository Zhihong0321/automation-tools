import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaCooldownMs } from './quota.mjs';

test('parses the individual quota reset reported by agy', () => {
  assert.equal(quotaCooldownMs('Error: Individual quota reached. Resets in 1h37m47s.'), 5_872_000);
  assert.equal(quotaCooldownMs('Individual quota reached. Resets in 2 days 3 hours 4 minutes 5 seconds.'),
    183_850_000);
  assert.equal(quotaCooldownMs('Individual quota reached'), 3_605_000);
  assert.equal(quotaCooldownMs('ordinary timeout'), null);
});

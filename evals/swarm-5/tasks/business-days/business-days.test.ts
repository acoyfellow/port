import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addBusinessDays } from '../../src/dates.ts';

test('business days: forward and backward over weekends', () => {
  assert.equal(addBusinessDays('2026-10-23', 1), '2026-10-26');
  assert.equal(addBusinessDays('2026-10-23', 5), '2026-10-30');
  assert.equal(addBusinessDays('2026-10-24', 1), '2026-10-26');
  assert.equal(addBusinessDays('2026-10-26', -1), '2026-10-23');
  assert.equal(addBusinessDays('2026-10-25', -1), '2026-10-23');
  assert.equal(addBusinessDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addBusinessDays('2028-02-28', 1), '2028-02-29');
});

test('business days: zero, holidays', () => {
  assert.equal(addBusinessDays('2026-10-23', 0), '2026-10-23');
  assert.equal(addBusinessDays('2026-10-24', 0), '2026-10-26');
  assert.equal(addBusinessDays('2026-12-24', 1, ['2026-12-25']), '2026-12-28');
  assert.equal(addBusinessDays('2026-12-23', 2, ['2026-12-24', '2026-12-25']), '2026-12-29');
  assert.equal(addBusinessDays('2026-12-28', -1, ['2026-12-25']), '2026-12-24');
});

test('business days: bad input', () => {
  assert.throws(() => addBusinessDays('2026-02-30', 1), RangeError);
  assert.throws(() => addBusinessDays('26-10-23', 1), RangeError);
  assert.throws(() => addBusinessDays('2026-10-23', 1.5), RangeError);
});

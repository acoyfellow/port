import assert from 'node:assert/strict';
import { test } from 'node:test';
import { money } from '../../src/core/money.ts';
import { splitBill } from '../../src/split.ts';

const cents = (xs: { cents: number }[]) => xs.map((x) => x.cents);

test('split: equal and weighted shares add up exactly', () => {
  assert.deepEqual(cents(splitBill(money(1000), [1, 1, 1], 0)), [334, 333, 333]);
  assert.deepEqual(cents(splitBill(money(1000), [1, 2], 0)), [333, 667]);
  assert.deepEqual(cents(splitBill(money(10000), [1, 1, 1], 15)), [3834, 3833, 3833]);
  assert.deepEqual(cents(splitBill(money(1), [1, 1, 1], 0)), [1, 0, 0]);
});

test('split: zero weights, ties to earlier, currency kept', () => {
  assert.deepEqual(cents(splitBill(money(100), [0, 1, 1], 0)), [0, 50, 50]);
  assert.deepEqual(cents(splitBill(money(5), [1, 1, 1, 1], 0)), [2, 1, 1, 1]);
  assert.deepEqual(cents(splitBill(money(7), [3, 1, 3], 0)), [3, 1, 3]);
  assert.equal(splitBill(money(500, 'EUR'), [1, 1], 10)[0]!.currency, 'EUR');
  assert.deepEqual(cents(splitBill(money(0), [1, 2], 20)), [0, 0]);
});

test('split: invalid input throws a RangeError', () => {
  assert.throws(() => splitBill(money(100), [], 0), RangeError);
  assert.throws(() => splitBill(money(100), [0, 0], 0), RangeError);
  assert.throws(() => splitBill(money(100), [1, -1], 0), RangeError);
  assert.throws(() => splitBill(money(100), [1, Number.NaN], 0), RangeError);
  assert.throws(() => splitBill(money(-100), [1], 0), RangeError);
});

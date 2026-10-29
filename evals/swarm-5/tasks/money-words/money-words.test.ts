import assert from 'node:assert/strict';
import { test } from 'node:test';
import { money } from '../../src/core/money.ts';
import { toWords } from '../../src/words.ts';

test('words: amounts', () => {
  assert.equal(toWords(money(0)), 'zero dollars');
  assert.equal(toWords(money(1)), 'zero dollars and one cent');
  assert.equal(toWords(money(100)), 'one dollar');
  assert.equal(toWords(money(2101)), 'twenty-one dollars and one cent');
  assert.equal(toWords(money(11500)), 'one hundred fifteen dollars');
  assert.equal(toWords(money(100000099)), 'one million dollars and ninety-nine cents');
  assert.equal(
    toWords(money(123456789)),
    'one million two hundred thirty-four thousand five hundred sixty-seven dollars and eighty-nine cents',
  );
  assert.equal(toWords(money(4000000)), 'forty thousand dollars');
  assert.equal(toWords(money(-250)), 'minus two dollars and fifty cents');
});

test('words: limits', () => {
  assert.equal(
    toWords(money(99999999999)),
    'nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine dollars and ninety-nine cents',
  );
  assert.throws(() => toWords(money(100000000000)), RangeError);
  assert.throws(() => toWords(money(100, 'EUR')), RangeError);
});

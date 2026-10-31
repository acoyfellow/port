import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeRanges } from '../../src/ranges.ts';

test('ranges: overlap, touch, sort', () => {
  assert.deepEqual(mergeRanges([]), []);
  assert.deepEqual(mergeRanges([['2024-01-05', '2024-01-10'], ['2024-01-01', '2024-01-03']]), [['2024-01-01', '2024-01-03'], ['2024-01-05', '2024-01-10']]);
  assert.deepEqual(mergeRanges([['2024-01-01', '2024-01-04'], ['2024-01-05', '2024-01-06']]), [['2024-01-01', '2024-01-06']]);
  assert.deepEqual(mergeRanges([['2024-01-01', '2024-01-10'], ['2024-01-03', '2024-01-04']]), [['2024-01-01', '2024-01-10']]);
  assert.deepEqual(mergeRanges([['2024-03-01', '2024-03-01']]), [['2024-03-01', '2024-03-01']]);
});

test('ranges: month, year and leap boundaries', () => {
  assert.deepEqual(mergeRanges([['2024-02-28', '2024-02-29'], ['2024-03-01', '2024-03-02']]), [['2024-02-28', '2024-03-02']]);
  assert.deepEqual(mergeRanges([['2023-02-27', '2023-02-28'], ['2023-03-01', '2023-03-02']]), [['2023-02-27', '2023-03-02']]);
  assert.deepEqual(mergeRanges([['2023-12-30', '2023-12-31'], ['2024-01-01', '2024-01-01']]), [['2023-12-30', '2024-01-01']]);
  assert.deepEqual(mergeRanges([['2024-04-29', '2024-04-30'], ['2024-05-02', '2024-05-03']]), [['2024-04-29', '2024-04-30'], ['2024-05-02', '2024-05-03']]);
});

test('ranges: input untouched, invalid dates throw', () => {
  const input: [string, string][] = [['2024-01-05', '2024-01-06'], ['2024-01-01', '2024-01-02']];
  const copy = JSON.parse(JSON.stringify(input));
  mergeRanges(input);
  assert.deepEqual(input, copy);
  assert.throws(() => mergeRanges([['2024-01-05', '2024-01-01']]), RangeError);
  assert.throws(() => mergeRanges([['2023-02-29', '2023-03-01']]), RangeError);
  assert.throws(() => mergeRanges([['2024-13-01', '2024-13-02']]), RangeError);
  assert.throws(() => mergeRanges([['2024-1-05', '2024-01-06']]), RangeError);
  assert.throws(() => mergeRanges([['2024-04-31', '2024-05-01']]), RangeError);
});

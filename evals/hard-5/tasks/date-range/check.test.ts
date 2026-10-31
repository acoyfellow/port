import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeRanges } from '../../src/ranges.ts';
test('touching across June/July', () => assert.deepEqual(mergeRanges([['2024-06-29', '2024-06-30'], ['2024-07-01', '2024-07-01']]), [['2024-06-29', '2024-07-01']]));
test('gap of one day stays apart', () => assert.deepEqual(mergeRanges([['2024-06-01', '2024-06-02'], ['2024-06-04', '2024-06-05']]), [['2024-06-01', '2024-06-02'], ['2024-06-04', '2024-06-05']]));
test('three overlapping out of order', () => assert.deepEqual(mergeRanges([['2024-02-10', '2024-02-12'], ['2024-02-01', '2024-02-11'], ['2024-02-13', '2024-02-14']]), [['2024-02-01', '2024-02-14']]));
test('2100-02-29 is not a date', () => assert.throws(() => mergeRanges([['2100-02-29', '2100-03-01']]), RangeError));
test('2000-02-29 is a date', () => assert.deepEqual(mergeRanges([['2000-02-29', '2000-02-29']]), [['2000-02-29', '2000-02-29']]));
test('June 31 is not a date', () => assert.throws(() => mergeRanges([['2024-06-31', '2024-07-01']]), RangeError));

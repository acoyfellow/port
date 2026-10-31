import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchSku } from '../../src/glob.ts';

test('glob: star, question mark, whole-string match', () => {
  assert.equal(matchSku('TEA-*', 'TEA-GREEN'), true);
  assert.equal(matchSku('TEA-*', 'TEA-'), true);
  assert.equal(matchSku('TEA-*', 'XTEA-GREEN'), false);
  assert.equal(matchSku('T?A', 'TEA'), true);
  assert.equal(matchSku('T?A', 'TA'), false);
  assert.equal(matchSku('*-*-*', 'A-B-C'), true);
  assert.equal(matchSku('*a*a*a*b', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaac'), false);
  assert.equal(matchSku('', ''), true);
  assert.equal(matchSku('', 'A'), false);
});

test('glob: sets, ranges, negation', () => {
  assert.equal(matchSku('SIZE-[SML]', 'SIZE-M'), true);
  assert.equal(matchSku('SIZE-[SML]', 'SIZE-X'), false);
  assert.equal(matchSku('V[0-9]', 'V7'), true);
  assert.equal(matchSku('V[!0-9]', 'V7'), false);
  assert.equal(matchSku('V[!0-9]', 'VX'), true);
  assert.equal(matchSku('[]]', ']'), true);
  assert.equal(matchSku('A[-]B', 'A-B'), true);
});

test('glob: escapes and unclosed bracket', () => {
  assert.equal(matchSku('A\\*B', 'A*B'), true);
  assert.equal(matchSku('A\\*B', 'AxB'), false);
  assert.equal(matchSku('A[B', 'A[B'), true);
  assert.throws(() => matchSku('AB\\', 'AB'), SyntaxError);
});

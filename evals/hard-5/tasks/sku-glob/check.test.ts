import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchSku } from '../../src/glob.ts';
test('star matches empty in the middle', () => assert.equal(matchSku('A*B', 'AB'), true));
test('question mark needs one char', () => assert.equal(matchSku('A?', 'A'), false));
test('set with dash last is literal', () => assert.equal(matchSku('X[ab-]', 'X-'), true));
test('negated set with ] first', () => assert.equal(matchSku('[!]]', 'a'), true));
test('escaped bracket', () => assert.equal(matchSku('\\[A\\]', '[A]'), true));
test('many stars stay fast', () => { const t = Date.now(); assert.equal(matchSku('*a*a*a*a*a*a*a*a*b', 'a'.repeat(40)), false); assert.ok(Date.now() - t < 200); });

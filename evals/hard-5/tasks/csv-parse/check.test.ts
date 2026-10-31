import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv } from '../../src/csv.ts';
test('quoted CRLF inside a field', () => assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]));
test('trailing CRLF does not add a record', () => assert.deepEqual(parseCsv('a,b\r\n'), [['a', 'b']]));
test('empty quoted then plain', () => assert.deepEqual(parseCsv('"",x\n'), [['', 'x']]));
test('only a newline is one empty record', () => assert.deepEqual(parseCsv('\n'), [['']]));
test('text after closing quote throws', () => assert.throws(() => parseCsv('"a" ,b'), SyntaxError));
test('quote in the middle of a plain field throws', () => assert.throws(() => parseCsv('ab"c'), SyntaxError));

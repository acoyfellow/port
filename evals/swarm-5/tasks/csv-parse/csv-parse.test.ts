import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv } from '../../src/csv.ts';

test('csv: plain, quoted, escaped quotes, commas and newlines in quotes', () => {
  assert.deepEqual(parseCsv('a,b,c'), [['a', 'b', 'c']]);
  assert.deepEqual(parseCsv('a,"b,c",d'), [['a', 'b,c', 'd']]);
  assert.deepEqual(parseCsv('"say ""hi""",x'), [['say "hi"', 'x']]);
  assert.deepEqual(parseCsv('"line1\nline2",z\nq,w'), [
    ['line1\nline2', 'z'],
    ['q', 'w'],
  ]);
  assert.deepEqual(parseCsv('""'), [['']]);
});

test('csv: empty fields, CRLF, trailing newline', () => {
  assert.deepEqual(parseCsv('a,,c\r\n,,\r\n'), [
    ['a', '', 'c'],
    ['', '', ''],
  ]);
  assert.deepEqual(parseCsv('x\n'), [['x']]);
  assert.deepEqual(parseCsv('x\n\ny'), [['x'], [''], ['y']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('csv: malformed input throws a SyntaxError', () => {
  assert.throws(() => parseCsv('"open'), SyntaxError);
  assert.throws(() => parseCsv('a"b,c'), SyntaxError);
  assert.throws(() => parseCsv('"a"b,c'), SyntaxError);
});

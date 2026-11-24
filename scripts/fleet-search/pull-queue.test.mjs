import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createPullQueue } from './pull-queue.mjs';

test('no source comments in pull-queue.mjs', () => {
  const src = readFileSync(new URL('./pull-queue.mjs', import.meta.url), 'utf8');
  const lineComment = `${String.fromCharCode(47, 47)}`;
  const blockComment = `${String.fromCharCode(47, 42)}`;
  assert.equal(src.includes(lineComment) || src.includes(blockComment), false);
});

test('validates inputs', () => {
  assert.throws(() => createPullQueue({ items: [{ id: 'a' }, { id: 'a' }] }));
  assert.throws(() => createPullQueue({ items: [], maxAttempts: 0 }));
});

test('claims highest weight first with original-order tie break', () => {
  const q = createPullQueue({
    items: [
      { id: 'slow-1', weight: 10, payload: 1 },
      { id: 'fast', weight: 2, payload: 2 },
      { id: 'slow-2', weight: 10, payload: 3 },
    ],
  });
  const first = q.claim('v1', 100);
  const second = q.claim('v2', 101);
  const third = q.claim('v3', 102);
  const none = q.claim('v4', 103);
  assert.equal(first.id, 'slow-1');
  assert.equal(first.attempt, 1);
  assert.equal(second.id, 'slow-2');
  assert.equal(third.id, 'fast');
  assert.equal(none, null);
  assert.deepEqual(q.stats(), { pending: 0, running: 3, done: 0, failed: 0, cancelled: 0, totalAttempts: 3 });
});

test('enforces vessel ownership, retries up to maxAttempts, and reclaims expired leases', () => {
  const q = createPullQueue({ items: [{ id: 't1', weight: 5 }], maxAttempts: 3 });
  const a1 = q.claim('v1', 1000);
  assert.equal(a1.attempt, 1);
  assert.throws(() => q.complete('t1', 'v2', { passed: true }, 1050));
  assert.throws(() => q.fail('t1', 'v2', 'boom', 1050));
  const reclaimed = q.reclaimExpired(2000, 1000);
  assert.deepEqual(reclaimed, ['t1']);
  assert.equal(q.stats().pending, 1);

  const a2 = q.claim('v2', 2010);
  assert.equal(a2.attempt, 2);
  q.fail('t1', 'v2', 'flake', 2100);
  assert.equal(q.stats().pending, 1);

  const a3 = q.claim('v3', 2200);
  assert.equal(a3.attempt, 3);
  q.fail('t1', 'v3', 'hard-fail', 2300);
  assert.equal(q.stats().failed, 1);
  assert.equal(q.claim('v4', 2400), null);
  assert.equal(q.item('t1').failures.length, 3);
});

test('stopOnFirstPass cancels pending items on first passing completion', () => {
  const q = createPullQueue({
    items: [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1 },
      { id: 'c', weight: 1 },
    ],
    stopOnFirstPass: true,
  });
  q.claim('v1', 10);
  q.claim('v2', 11);
  q.complete('a', 'v1', { passed: false }, 20);
  assert.equal(q.stats().pending, 1);
  q.complete('b', 'v2', { passed: true }, 30);
  assert.deepEqual(q.stats(), { pending: 0, running: 0, done: 2, failed: 0, cancelled: 1, totalAttempts: 2 });
  assert.equal(q.claim('v3', 40), null);
});

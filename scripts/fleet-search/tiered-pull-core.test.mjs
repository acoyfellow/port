import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  classifyCommand,
  createTieredPullCoordinator,
} from '../../shapes/tiered-pull-fleet/src/tiered-pull-core.ts';

test('no comments and no type casts', () => {
  const src = readFileSync(
    new URL('../../shapes/tiered-pull-fleet/src/tiered-pull-core.ts', import.meta.url),
    'utf8',
  );
  const line = String.fromCharCode(47, 47);
  const block = String.fromCharCode(47, 42);
  assert.equal(src.includes(line) || src.includes(block), false);
  assert.equal(/\bas\s+[A-Za-z{]/.test(src), false);
});

test('bounds concurrency to 3, pulls highest weight next, keeps isolate seats at 0 containerSeconds', () => {
  const c = createTieredPullCoordinator({ concurrency: 3, maxBudgetUsd: 5, worstCasePerSeatUsd: 0.25 });
  const r1 = c.submit({ agent: 'a1', weight: 1, payload: 'p1', nowMs: 10 });
  const r2 = c.submit({ agent: 'a2', weight: 10, payload: 'p2', nowMs: 11 });
  const r3 = c.submit({ agent: 'a3', weight: 5, payload: 'p3', nowMs: 12 });
  const r4 = c.submit({ agent: 'a4', weight: 2, payload: 'p4', nowMs: 13 });
  const r5 = c.submit({ agent: 'a5', weight: 9, payload: 'p5', nowMs: 14 });
  assert.equal(r1.ok && r1.status === 'assigned' && r1.assignment.slot, 'slot-1');
  assert.equal(r2.ok && r2.status === 'assigned' && r2.assignment.slot, 'slot-2');
  assert.equal(r3.ok && r3.status === 'assigned' && r3.assignment.slot, 'slot-3');
  assert.equal(r4.ok && r4.status, 'queued');
  assert.equal(r5.ok && r5.status, 'queued');

  assert.equal(c.recordCommand('a1', 'node --test').tier, 'isolate');
  assert.equal(c.recordCommand('a2', 'python3 -c "print(42)"').tier, 'container');
  c.recordContainerLease('a2', 2500);

  const d1 = c.complete('a1', 0.01, 100);
  assert.equal(d1.ok && d1.next.agent, 'a5');
  assert.equal(d1.ok && d1.next.slot, 'slot-1');
  assert.deepEqual(c.complete('a1', 0.01, 101), { ok: false, reason: 'not-running' });

  const m = c.metrics();
  assert.equal(m.admitted, 5);
  assert.equal(m.completed, 1);
  assert.equal(m.queued, 1);
  assert.equal(m.activeSlots, 3);
  assert.equal(m.isolateCommands, 1);
  assert.equal(m.containerCommands, 1);
  assert.equal(m.escalatedSeats, 1);
  assert.equal(m.containerSeconds, 2.5);
  assert.ok(Math.abs(m.settledUsd - 0.01) < 1e-9);
});

test('enforces budget admission and frees unused reservation on settlement', () => {
  const c = createTieredPullCoordinator({ concurrency: 2, maxBudgetUsd: 0.6, worstCasePerSeatUsd: 0.25 });
  assert.equal(c.submit({ agent: 's1', payload: 1, nowMs: 0 }).ok, true);
  assert.equal(c.submit({ agent: 's2', payload: 2, nowMs: 1 }).ok, true);
  assert.deepEqual(c.submit({ agent: 's3', payload: 3, nowMs: 2 }), { ok: false, reason: 'budget-limit' });
  assert.equal(c.metrics().refused, 1);
  c.complete('s1', 0.02, 50);
  assert.equal(c.submit({ agent: 's3', payload: 3, nowMs: 51 }).ok, true);
});

test('classifyCommand rejects chained commands from isolate tier', () => {
  assert.equal(classifyCommand('node --test test/a.test.ts').tier, 'isolate');
  assert.equal(classifyCommand('node --test && ls').tier, 'container');
  assert.equal(classifyCommand('python3 app.py').tier, 'container');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createCoordinator } from '../../shapes/pull-fleet/src/coordinator-core.ts';

test('no comments and no type casts', () => {
  const src = readFileSync(
    new URL('../../shapes/pull-fleet/src/coordinator-core.ts', import.meta.url),
    'utf8',
  );
  const lineComment = `${String.fromCharCode(47, 47)}`;
  const blockComment = `${String.fromCharCode(47, 42)}`;
  assert.equal(src.includes(lineComment) || src.includes(blockComment), false);
  assert.equal(/\bas\s+[A-Za-z{]/.test(src), false);
});

test('assigns up to poolSize, queues rest, pulls highest weight onto freed warm vessel', () => {
  const coord = createCoordinator({ poolSize: 3, maxBudgetUsd: 5, worstCasePerSeatUsd: 0.25 });
  const r1 = coord.submit({ agent: 'a1', weight: 1, payload: 'p1', nowMs: 100 });
  const r2 = coord.submit({ agent: 'a2', weight: 10, payload: 'p2', nowMs: 101 });
  const r3 = coord.submit({ agent: 'a3', weight: 5, payload: 'p3', nowMs: 102 });
  const r4 = coord.submit({ agent: 'a4', weight: 2, payload: 'p4', nowMs: 103 });
  const r5 = coord.submit({ agent: 'a5', weight: 8, payload: 'p5', nowMs: 104 });
  const r6 = coord.submit({ agent: 'a6', weight: 8, payload: 'p6', nowMs: 105 });

  assert.equal(r1.ok && r1.status === 'assigned' && r1.assignment.vessel, 'vessel-1');
  assert.equal(r2.ok && r2.status === 'assigned' && r2.assignment.vessel, 'vessel-2');
  assert.equal(r3.ok && r3.status === 'assigned' && r3.assignment.vessel, 'vessel-3');
  assert.equal(r4.ok && r4.status, 'queued');
  assert.equal(r5.ok && r5.status, 'queued');
  assert.equal(r6.ok && r6.status, 'queued');
  assert.deepEqual(coord.assignmentOf('a5'), { state: 'queued', vessel: null });

  const done2 = coord.complete('a2', 0.05, 4000, 4101);
  assert.equal(done2.ok, true);
  assert.equal(done2.next.agent, 'a5');
  assert.equal(done2.next.vessel, 'vessel-2');
  assert.deepEqual(coord.assignmentOf('a2'), { state: 'completed', vessel: null });
  assert.deepEqual(coord.assignmentOf('a5'), { state: 'running', vessel: 'vessel-2' });

  const replay = coord.complete('a2', 0.05, 4000, 4200);
  assert.deepEqual(replay, { ok: false, reason: 'not-running' });

  const done1 = coord.complete('a1', 0.04, 6000, 6100);
  assert.equal(done1.ok && done1.next.agent, 'a6');
  assert.equal(done1.ok && done1.next.vessel, 'vessel-1');

  const m = coord.metrics();
  assert.equal(m.admitted, 6);
  assert.equal(m.completed, 2);
  assert.equal(m.queued, 1);
  assert.equal(m.activeVessels, 3);
  assert.equal(m.containerSeconds, 10);
  assert.ok(Math.abs(m.settledUsd - 0.09) < 1e-9);
  assert.ok(Math.abs(m.reservedUsd - 1.0) < 1e-9);
});

test('enforces budget admission and frees unused reservation on settlement', () => {
  const coord = createCoordinator({ poolSize: 2, maxBudgetUsd: 0.6, worstCasePerSeatUsd: 0.25 });
  assert.equal(coord.submit({ agent: 's1', payload: 1, nowMs: 0 }).ok, true);
  assert.equal(coord.submit({ agent: 's2', payload: 2, nowMs: 1 }).ok, true);
  assert.deepEqual(coord.submit({ agent: 's3', payload: 3, nowMs: 2 }), {
    ok: false,
    reason: 'budget-limit',
  });
  assert.deepEqual(coord.submit({ agent: 's1', payload: 1, nowMs: 3 }), {
    ok: false,
    reason: 'duplicate-agent',
  });
  assert.equal(coord.metrics().refused, 1);

  coord.complete('s1', 0.05, 1000, 1000);
  const s3 = coord.submit({ agent: 's3', payload: 3, nowMs: 1001 });
  assert.equal(s3.ok, true);
  assert.equal(s3.ok && s3.status === 'assigned' && s3.assignment.vessel, 'vessel-1');
});

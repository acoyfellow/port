import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTieredPullReport } from './tiered-pull-schema.mjs';

const run = (seats) => ({
  slug: 'tiered-pull-fleet',
  seats,
  usesContainer: false,
  makespanMs: seats === 1 ? 60_000 : 220_000,
  containerSeconds: 0,
  aiUsd: seats * 0.01,
  projectedInfraUsd: seats * 0.0002,
  trials: Array.from({ length: seats }, (_, i) => ({
    task: `t-${i}`,
    passed: true,
    elapsedMs: 55_000,
  })),
  sweep: { leftovers: 0, errors: 0 },
});

const validReport = () => ({
  version: 1,
  spend: {
    version: 1,
    orchestrator: {
      usd: 0,
      warmUsd: 0,
      coldUsd: 0,
      turns: 5,
      coldTurns: 0,
      unpricedTurns: 5,
      unknownSpend: true,
    },
    builders: { usd: 0.02, seats: 1, unpricedSeats: 0, unknownSpend: false },
    judges: { usd: 0.0001, calls: 1, items: 2, unpricedCalls: 0, unknownSpend: false },
    benchmark: {
      usd: 0.15,
      aiUsd: 0.14,
      projectedInfraUsd: 0.01,
      runs: 2,
      unpricedRuns: 0,
      unknownSpend: false,
    },
  },
  escalation: {
    passed: true,
    escalatedSeats: 1,
    containerSeconds: 3.4,
    sweep: { leftovers: 0, errors: 0 },
  },
  baselinePullFleet10: { passed: 9, attempted: 10, containerSeconds: 718.13, makespanMs: 482889 },
  runs: [run(1), run(10)],
});

test('tiered-pull report validator fails closed on missing escalation, caps, or dirty sweeps', () => {
  const ok = validateTieredPullReport(validReport());
  assert.equal(ok.escalationVerified, true);
  assert.equal(ok.containerSecondsDeltaVsPullFleet10, -718.13);

  const noEsc = validReport();
  noEsc.escalation.escalatedSeats = 0;
  assert.throws(() => validateTieredPullReport(noEsc), /did not route to container/);

  const overBench = validReport();
  overBench.spend.benchmark.usd = 11;
  assert.throws(() => validateTieredPullReport(overBench), /Benchmark spend cap/);

  const overBuilder = validReport();
  overBuilder.spend.builders.usd = 6;
  assert.throws(() => validateTieredPullReport(overBuilder), /Builder spend cap/);

  const dirty = validReport();
  dirty.runs[1].sweep.leftovers = 1;
  assert.throws(() => validateTieredPullReport(dirty), /Unclean sweep/);
});

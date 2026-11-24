import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveDockerHost } from './docker-host.mjs';
import { fleetFrontier, validateFleetReport } from './schema.mjs';

const validRun = (slug, seats = 1, extra = {}) => ({
  slug,
  seats,
  usesContainer: slug !== 'isolate-agents',
  makespanMs: 25_000,
  containerSeconds: slug === 'isolate-agents' ? 0 : 25,
  aiUsd: 0.08,
  projectedInfraUsd: slug === 'isolate-agents' ? 0.001 : 0.004,
  trials: [{ task: 'business-days', passed: true, elapsedMs: 24_000 }],
  sweep: { leftovers: 0, errors: 0 },
  ...extra,
});

const validReport = () => ({
  version: 1,
  spend: {
    version: 1,
    orchestrator: {
      usd: 1.5,
      warmUsd: 1.5,
      coldUsd: 0,
      turns: 4,
      coldTurns: 0,
      unpricedTurns: 0,
      unknownSpend: false,
    },
    builders: { usd: 0.5, seats: 2, unpricedSeats: 0, unknownSpend: false },
    judges: { usd: 0, calls: 1, items: 4, unpricedCalls: 1, unknownSpend: true },
    benchmark: {
      usd: 1.2,
      aiUsd: 1.1,
      projectedInfraUsd: 0.1,
      runs: 4,
      unpricedRuns: 0,
      unknownSpend: false,
    },
  },
  calibration: { models: ['kimi', 'glm'], winner: 'kimi' },
  judgeValidation: { plantedCases: 4, clefAccuracy: 1, clairicAccuracy: 1 },
  runs: [
    validRun('container-per-thread', 1),
    validRun('shared-container', 1),
    validRun('isolate-agents', 1),
    validRun('pull-fleet', 1, { makespanMs: 18_000, containerSeconds: 18 }),
    validRun('pull-fleet', 10, { makespanMs: 30_000, containerSeconds: 150 }),
  ],
});

test('docker host resolves existing Colima socket and rejects missing explicit socket', () => {
  assert.equal(
    resolveDockerHost({}, (path) => path.endsWith('/.colima/default/docker.sock'), '/u'),
    'unix:///u/.colima/default/docker.sock',
  );
  assert.throws(
    () => resolveDockerHost({ DOCKER_HOST: 'unix:///missing.sock' }, () => false, '/u'),
    /does not exist/,
  );
  assert.throws(() => resolveDockerHost({}, () => false, '/u'), /No Docker socket/);
});

test('fleet report validator fails closed on planted bad receipts', () => {
  const ok = validateFleetReport(validReport());
  assert.deepEqual(ok.novel, ['pull-fleet']);
  assert.equal(ok.frontier10.length, 1);

  assert.throws(() => validateFleetReport(null), /Unsupported/);
  const noNovel = validReport();
  noNovel.runs = noNovel.runs.filter((run) => run.slug !== 'pull-fleet');
  assert.throws(() => validateFleetReport(noNovel), /novel fleet/);

  const dirtySweep = validReport();
  dirtySweep.runs[0].sweep.leftovers = 1;
  assert.throws(() => validateFleetReport(dirtySweep), /Unclean sweep/);

  const zeroBox = validReport();
  zeroBox.runs[0].containerSeconds = 0;
  assert.throws(() => validateFleetReport(zeroBox), /positive containerSeconds/);

  const hiddenUnpriced = validReport();
  hiddenUnpriced.spend.judges.unknownSpend = false;
  assert.throws(() => validateFleetReport(hiddenUnpriced), /Unpriced judge/);

  const failedDeploy = validReport();
  failedDeploy.runs[0].trials[0].deployFailed = true;
  assert.throws(() => validateFleetReport(failedDeploy), /Failed deploy/);
});

test('fleet frontier keeps only non-dominated 100%-passing configs', () => {
  const fastCheap = validRun('pull-fleet', 10, { makespanMs: 20_000, aiUsd: 0.05, projectedInfraUsd: 0.01 });
  const slowExpensive = validRun('container-per-thread', 10, {
    makespanMs: 40_000,
    aiUsd: 0.09,
    projectedInfraUsd: 0.02,
  });
  const failing = validRun('isolate-agents', 10, {
    makespanMs: 5_000,
    aiUsd: 0.01,
    projectedInfraUsd: 0,
    trials: [{ task: 'business-days', passed: false, elapsedMs: 5_000 }],
  });
  const front = fleetFrontier([fastCheap, slowExpensive, failing], 10);
  assert.deepEqual(
    front.map((row) => row.slug),
    ['pull-fleet'],
  );
});

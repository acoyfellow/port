import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frontier, reserve, settle, summarize, validateReceipt } from './core.mjs';

const receipt = () => ({
  version: 1,
  benchmarkDigest: 'bench',
  configurationDigest: 'baseline',
  model: 'fixed',
  trials: [
    {
      id: 'a',
      elapsedMs: 10,
      accepted: true,
      evidenceDigest: 'grade',
      cost: { ai: 1, compute: 0.1, storage: 0, requests: 0, idle: 0 },
    },
  ],
  cleanup: { remaining: 0, inventoryDigest: 'inventory' },
});

test('mismatched tasks and duplicate trials cannot become a winner', () => {
  const first = receipt();
  const other = receipt();
  other.trials[0].id = 'different-task';
  assert.throws(() => frontier([first, other]), /workload coverage/);
  first.trials.push({ ...first.trials[0] });
  assert.throws(() => validateReceipt(first), /Duplicate trial/);
});

test('missing evidence fails closed', () => {
  for (const value of [undefined, {}, { ...receipt(), trials: [] }, { ...receipt(), cleanup: undefined }])
    assert.throws(() => validateReceipt(value));
  const incomplete = receipt();
  delete incomplete.trials[0].cost.compute;
  assert.throws(() => validateReceipt(incomplete));
});

test('admission reserves spend and concurrency before launch', () => {
  const first = reserve({ jobs: {} }, 'a', 10);
  const second = reserve(first, 'b', 10);
  assert.throws(() => reserve(second, 'c', 1));
  assert.throws(() => reserve(first, 'a', 1));
  assert.throws(() => reserve(first, 'c', 11));
  assert.throws(() => settle(first, 'a', 11));
  assert.equal(settle(first, 'a', 2).jobs.a.actualUsd, 2);
});

test('serialized ledger preserves reservations across restart', () => {
  const resumed = JSON.parse(JSON.stringify(reserve({ jobs: {} }, 'a', 19)));
  assert.throws(() => reserve(resumed, 'b', 2));
  assert.throws(() => reserve(resumed, 'a', 1));
});

test('failures count in expense and cannot enter frontier', () => {
  const value = receipt();
  value.trials.push({ ...value.trials[0], id: 'b', accepted: false });
  assert.equal(summarize(value).usdPerAccepted, 2.2);
  assert.deepEqual(frontier([value]), []);
});

test('frontier excludes dominated and incomparable experiments', () => {
  const baseline = receipt();
  const slow = receipt();
  slow.configurationDigest = 'slow';
  slow.trials[0].elapsedMs = 20;
  assert.equal(frontier([baseline, slow]).length, 1);
  slow.model = 'different';
  assert.throws(() => frontier([baseline, slow]));
});

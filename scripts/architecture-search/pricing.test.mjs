import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectCost } from './pricing.mjs';

const rates = {
  version: 1,
  source: 'fixture',
  observedAt: '2026-11-11',
  meters: Object.fromEntries(
    ['ai', 'compute', 'storage', 'requests', 'idle'].map((category) => [
      category,
      { category, usdPerUnit: 0.1 },
    ]),
  ),
};
const usage = { ai: 2, compute: 1, storage: 0, requests: 0, idle: 0 };

test('projects measured usage without treating missing usage as free', () => {
  const result = projectCost(usage, rates);
  assert.equal(result.basis, 'projected-from-measured-usage');
  assert.equal(result.cost.ai, 0.2);
  assert.throws(() => projectCost({ ai: 2 }, rates), /Missing usage/);
  assert.throws(() => projectCost({ ...usage, unpriced: 1 }, rates), /Unpriced usage/);
  assert.throws(() => projectCost(usage, { ...rates, source: '' }));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyIsolateCommand,
  createTieredPullCoordinator,
} from '../../shapes/tiered-pull-fleet/src/tiered-pull-core.ts';

test('classifyIsolateCommand keeps just-bash chains in isolate and escalates external binaries', () => {
  assert.equal(classifyIsolateCommand('cd /workspace && node --test').tier, 'isolate');
  assert.equal(classifyIsolateCommand('ls -la src | head -5').tier, 'isolate');
  assert.equal(classifyIsolateCommand('rg -n add src/').tier, 'isolate');
  assert.equal(
    classifyIsolateCommand("sh -c 'cd /workspace && node --test test/dates.test.ts'").tier,
    'isolate',
  );
  assert.equal(classifyIsolateCommand('python3 -c "print(6 * 7)"').tier, 'container');
  assert.equal(classifyIsolateCommand('node --test && git status').tier, 'container');
  assert.equal(classifyIsolateCommand('node -e "console.log(1)"').tier, 'container');
  assert.equal(classifyIsolateCommand('echo $(uname)').tier, 'container');
});

test('recordIsolateCommand tracks zero containerSeconds for isolate-only commands', () => {
  const c = createTieredPullCoordinator({ concurrency: 3, maxBudgetUsd: 5, worstCasePerSeatUsd: 0.25 });
  c.submit({ agent: 'a1', payload: {}, nowMs: 1 });
  assert.equal(c.recordIsolateCommand('a1', 'cd /workspace && node --test').tier, 'isolate');
  assert.equal(c.recordIsolateCommand('a1', 'rg -n export src/ | head -5').tier, 'isolate');
  assert.equal(c.recordIsolateCommand('a1', 'python3 -c "print(42)"').tier, 'container');
  const m = c.metrics();
  assert.equal(m.isolateCommands, 2);
  assert.equal(m.containerCommands, 1);
  assert.equal(m.escalatedSeats, 1);
  assert.equal(m.containerSeconds, 0);
});

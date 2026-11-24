import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { execute } from './executor.mjs';

const base = join(import.meta.dirname, '../../.tmp');

test('a second driver cannot open an owned campaign', async () => {
  const directory = await mkdtemp(join(base, '/search-lock-'));
  try {
    await writeFile(join(directory, 'executor.lock'), 'existing owner');
    await assert.rejects(execute({ directory, experiments: [], adapter: {} }), /EEXIST/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('two concurrent executions, failed task cleanup, completed resume', async () => {
  const directory = await mkdtemp(join(base, '/search-test-'));
  let active = 0;
  let maximum = 0;
  let runs = 0;
  const cleaned = [];
  const adapter = {
    run: async ({ id }) => {
      runs++;
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      if (id === 'b') throw new Error('Task failed');
      return { accepted: true };
    },
    cleanup: async (id) => {
      cleaned.push(id);
      return { remaining: 0 };
    },
    cost: async () => 0.1,
  };
  try {
    const options = { directory, adapter, experiments: ['a', 'b', 'c'].map((id) => ({ id, maximumUsd: 1 })) };
    const ledger = await execute(options);
    assert.equal(maximum, 2);
    assert.equal(ledger.jobs.b.outcome, 'failed');
    assert.deepEqual(cleaned.sort(), ['a', 'b', 'c']);
    await execute(options);
    assert.equal(runs, 3);
    await assert.rejects(execute({ ...options, limitUsd: 19 }), /Campaign plan changed/);
    assert.equal(runs, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('unknown cleanup retains reservation and blocks unsafe restart', async () => {
  const directory = await mkdtemp(join(base, '/search-test-'));
  const adapter = {
    run: async () => ({}),
    cleanup: async () => ({ remaining: 1 }),
    recover: async () => null,
  };
  try {
    const options = { directory, adapter, experiments: [{ id: 'a', maximumUsd: 10 }] };
    await assert.rejects(execute(options), /Cleanup failed/);
    await assert.rejects(execute(options), /Cannot safely recover/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

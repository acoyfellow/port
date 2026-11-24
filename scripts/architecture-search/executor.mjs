import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reserve, settle } from './budget-ledger.mjs';

const executeLocked = async ({ directory, experiments, adapter, limitUsd = 20, concurrency = 2 }) => {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2)
    throw new Error('Concurrency must be one or two');
  if (!(limitUsd > 0 && limitUsd <= 20)) throw new Error('Budget must not exceed $20');
  if (experiments.some((experiment) => !/^[a-z0-9][a-z0-9-]*$/.test(experiment.id)))
    throw new Error('Unsafe experiment ID');
  if (new Set(experiments.map((experiment) => experiment.id)).size !== experiments.length)
    throw new Error('Duplicate experiment IDs');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'ledger.json');
  const planDigest = createHash('sha256')
    .update(JSON.stringify({ experiments, limitUsd, concurrency }))
    .digest('hex');
  let ledger;
  try {
    ledger = JSON.parse(await readFile(path, 'utf8'));
    if (ledger.planDigest !== planDigest) throw new Error('Campaign plan changed or unpinned legacy ledger');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    ledger = { planDigest, jobs: {} };
  }
  const save = async () => {
    await writeFile(`${path}.next`, JSON.stringify(ledger, null, 2));
    await rename(`${path}.next`, path);
  };
  for (const [id, job] of Object.entries(ledger.jobs)) {
    if (job.state !== 'running') continue;
    const recovered = await adapter.recover(id);
    if (!recovered || recovered.remaining !== 0 || !Number.isFinite(recovered.actualUsd))
      throw new Error(`Cannot safely recover ${id}`);
    ledger = settle(ledger, id, recovered.actualUsd, limitUsd, concurrency);
    ledger.jobs[id].outcome = 'interrupted';
    ledger.jobs[id].accountingBasis = recovered.basis ?? 'measured';
    await save();
  }
  const pending = experiments.filter((experiment) => !ledger.jobs[experiment.id]);
  for (let offset = 0; offset < pending.length; offset += concurrency) {
    const batch = pending.slice(offset, offset + concurrency);
    for (const experiment of batch)
      ledger = reserve(ledger, experiment.id, experiment.maximumUsd, limitUsd, concurrency);
    await save();
    const outcomes = await Promise.allSettled(
      batch.map(async (experiment) => {
        let result;
        let failure;
        try {
          result = await adapter.run(experiment);
        } catch (error) {
          failure = error;
        }
        const cleanup = await adapter.cleanup(experiment.id);
        if (cleanup.remaining !== 0) throw new Error(`Cleanup failed: ${experiment.id}`);
        const actualUsd = await adapter.cost(experiment.id);
        return { experiment, result, failure: failure?.message, actualUsd, cleanup };
      }),
    );
    for (let index = 0; index < outcomes.length; index++) {
      const outcome = outcomes[index];
      if (outcome.status === 'rejected') continue;
      const value = outcome.value;
      ledger = settle(ledger, value.experiment.id, value.actualUsd, limitUsd, concurrency);
      ledger.jobs[value.experiment.id].outcome = value.failure ? 'failed' : 'completed';
      await writeFile(join(directory, `${value.experiment.id}.json`), JSON.stringify(value, null, 2));
    }
    await save();
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    if (rejected) throw rejected.reason;
  }
  return ledger;
};

export const execute = async (options) => {
  await mkdir(options.directory, { recursive: true });
  const lockPath = join(options.directory, 'executor.lock');
  const lock = await open(lockPath, 'wx');
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await executeLocked(options);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
};

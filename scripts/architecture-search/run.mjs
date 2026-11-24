import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execute } from './executor.mjs';

try {
  const [planPath] = process.argv.slice(2);
  if (!planPath) throw new Error('Usage: node scripts/architecture-search/run.mjs PLAN.json');
  const plan = JSON.parse(await readFile(resolve(planPath), 'utf8'));
  if (plan.version !== 1 || typeof plan.adapter !== 'string' || typeof plan.directory !== 'string')
    throw new Error('Invalid campaign plan');
  let priorUsd = 0;
  const priorLedgers = plan.priorLedgers ?? (plan.priorLedger ? [plan.priorLedger] : []);
  if (new Set(priorLedgers.map((path) => resolve(path))).size !== priorLedgers.length)
    throw new Error('Duplicate prior ledger');
  for (const priorPath of priorLedgers) {
    const prior = JSON.parse(await readFile(resolve(priorPath), 'utf8'));
    if (
      !prior.jobs ||
      Object.values(prior.jobs).some(
        (job) => job.state !== 'done' || !Number.isFinite(job.actualUsd) || job.actualUsd < 0,
      )
    )
      throw new Error('Prior campaign accounting incomplete');
    priorUsd += Object.values(prior.jobs).reduce((sum, job) => sum + job.actualUsd, 0);
  }
  const { createAdapter } = await import(pathToFileURL(resolve(plan.adapter)).href);
  const adapter = createAdapter(resolve(plan.directory));
  const ledger = await execute({
    directory: resolve(plan.directory),
    experiments: plan.experiments,
    adapter,
    concurrency: plan.concurrency,
    limitUsd: plan.limitUsd - priorUsd,
  });
  console.log(JSON.stringify(ledger, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import { readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../../.tmp/architecture-search-live/', import.meta.url);
const configurations = ['search-lite-retry', 'search-basic', 'search-standard'];
const report = {
  version: 1,
  kind: 'calibration-only',
  accounting: 'conservative capacity projection, not measured total infrastructure cost',
  rankingEligible: false,
  reasons: [
    'One task per configuration cannot establish latency percentiles or reliability',
    'Infrastructure overhead is an allowance, not attributed usage',
    'CPU utilization is not measured',
  ],
  configurations: [],
};
for (const id of configurations) {
  try {
    const evaluation = JSON.parse(await readFile(new URL(`${id}.eval.json`, directory), 'utf8'));
    const projection = JSON.parse(await readFile(new URL(`${id}.projection.json`, directory), 'utf8'));
    const sweep = JSON.parse(await readFile(new URL(`${id}-sweep.log`, directory), 'utf8'));
    if (Object.keys(sweep.leftovers).length !== 0 || Object.keys(sweep.errors).length !== 0)
      throw new Error('Unclean inventory');
    if (evaluation.rows.length !== 1) throw new Error('Unexpected task coverage');
    const row = evaluation.rows[0];
    report.configurations.push({
      id,
      state: 'complete',
      model: row.model,
      task: row.task,
      accepted: row.passed,
      hiddenPassed: row.hiddenPassed,
      hiddenTotal: row.hiddenTotal,
      agentSeconds: row.seconds,
      campaignElapsedMs: projection.elapsedMs,
      projectedCost: projection.cost,
      limitations: projection.limitations,
      leftovers: 0,
    });
  } catch (error) {
    report.configurations.push({ id, state: 'incomplete', reason: error.message });
  }
}
await writeFile(new URL('calibration-report.json', directory), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.configurations.some((configuration) => configuration.state !== 'complete')) process.exitCode = 1;

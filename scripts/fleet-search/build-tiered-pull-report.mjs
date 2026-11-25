import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFleetReport } from './build-report.mjs';
import {
  readBenchmarkSpend,
  readBuildersSpend,
  readJudgesSpend,
  readOrchestratorSpend,
  validateSpendLedger,
} from './spend.mjs';
import { TIERED_PULL_CAPS, validateTieredPullReport } from './tiered-pull-schema.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tmp = join(root, '.tmp', 'tiered-pull');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const findReceipts = (dir, match) => {
  if (!existsSync(dir)) return [];
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (match(entry.name)) found.push(full);
    }
  };
  walk(dir);
  return found.sort();
};

export const buildTieredPullReport = async () => {
  const anchor = readJson(join(tmp, 'spend-anchor.json'));
  const orchestrator = await readOrchestratorSpend(anchor.sessionFile, anchor.startByte);
  const builderFiles = findReceipts(join(tmp, 'build', 'runs'), (name) => name === 'receipt.json');
  const rawBuilders = readBuildersSpend(builderFiles);
  const builders = {
    ...rawBuilders,
    runs: rawBuilders.runs.map((run) => ({ ...run, file: relative(root, run.file) })),
  };
  const judgeFiles = findReceipts(join(tmp, 'judges'), (name) => name.endsWith('.json'));
  const benchFiles = [
    join(tmp, 'benchmarks', 'tiered-pull-fleet-1.json'),
    join(tmp, 'benchmarks', 'tiered-pull-fleet-10.json'),
  ];
  const escalationFile = join(tmp, 'escalation.json');
  const priorBenchFiles = findReceipts(join(tmp, 'v1'), (name) => name.endsWith('.json'));
  const spend = validateSpendLedger(
    {
      version: 1,
      at: new Date().toISOString(),
      caps: TIERED_PULL_CAPS,
      orchestrator,
      builders,
      judges: readJudgesSpend(judgeFiles),
      benchmark: readBenchmarkSpend([...priorBenchFiles, ...benchFiles, escalationFile]),
    },
    TIERED_PULL_CAPS,
  );

  const runs = benchFiles.map(readJson);
  const escalation = readJson(escalationFile);
  const fleetReport = readJson(join(root, 'proof', 'fleet-search', 'report.json'));
  const pull10 = fleetReport.runs.find((run) => run.slug === 'pull-fleet' && run.seats === 10);
  if (pull10 === undefined) throw new Error('Missing pull-fleet 10-seat baseline in fleet-search report');

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    model: runs[0]?.model ?? 'unknown',
    spend,
    escalation,
    baselinePullFleet10: {
      passed: pull10.trials.filter((t) => t.passed).length,
      attempted: pull10.trials.length,
      containerSeconds: pull10.containerSeconds,
      makespanMs: pull10.makespanMs,
      aiUsd: pull10.aiUsd,
      projectedInfraUsd: pull10.projectedInfraUsd,
    },
    runs,
  };

  const summary = validateTieredPullReport(report);
  writeFileSync(join(root, 'proof', 'tiered-pull', 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  const fleetBenchDir = join(root, '.tmp', 'fleet-search', 'benchmarks');
  for (const run of runs) {
    writeFileSync(join(fleetBenchDir, `${run.slug}-${run.seats}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }
  await buildFleetReport();
  return summary;
};

if (process.argv[1]?.endsWith('build-tiered-pull-report.mjs')) {
  const summary = await buildTieredPullReport();
  console.log(JSON.stringify(summary, null, 2));
}

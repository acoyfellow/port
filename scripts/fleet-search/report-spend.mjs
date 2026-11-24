import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readBenchmarkSpend,
  readBuildersSpend,
  readJudgesSpend,
  readOrchestratorSpend,
  validateSpendLedger,
} from './spend.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tmp = join(root, '.tmp', 'fleet-search');

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

export const collectSpend = async () => {
  const anchor = JSON.parse(readFileSync(join(tmp, 'spend-anchor.json'), 'utf8'));
  const orchestrator = await readOrchestratorSpend(anchor.sessionFile, anchor.startByte);
  const builderFiles = [
    ...findReceipts(join(tmp, 'calibration', 'runs'), (name) => name === 'receipt.json'),
    ...findReceipts(join(tmp, 'pull-fleet-build', 'runs'), (name) => name === 'receipt.json'),
    ...findReceipts(join(tmp, 'tiered-fleet-build', 'runs'), (name) => name === 'receipt.json'),
  ];
  const judgeFiles = findReceipts(join(tmp, 'judges'), (name) => name.endsWith('.json'));
  const benchFiles = findReceipts(join(tmp, 'benchmarks'), (name) => name.endsWith('.json'));
  const rawBuilders = readBuildersSpend(builderFiles);
  const builders = {
    ...rawBuilders,
    runs: rawBuilders.runs.map((run) => ({ ...run, file: relative(root, run.file) })),
  };
  const ledger = {
    version: 1,
    at: new Date().toISOString(),
    caps: anchor.caps,
    orchestrator,
    builders,
    judges: readJudgesSpend(judgeFiles),
    benchmark: readBenchmarkSpend(benchFiles),
  };
  return validateSpendLedger(ledger, anchor.caps);
};

if (process.argv[1]?.endsWith('report-spend.mjs')) {
  const ledger = await collectSpend();
  console.log(
    JSON.stringify(
      {
        orchestrator: {
          usd: Number(ledger.orchestrator.usd.toFixed(4)),
          turns: ledger.orchestrator.turns,
          unpricedTurns: ledger.orchestrator.unpricedTurns,
          unknownSpend: ledger.orchestrator.unknownSpend,
          outputTokens: ledger.orchestrator.outputTokens,
        },
        builders: {
          usd: Number(ledger.builders.usd.toFixed(4)),
          seats: ledger.builders.seats,
          unknownSpend: ledger.builders.unknownSpend,
        },
        judges: {
          usd: Number(ledger.judges.usd.toFixed(6)),
          calls: ledger.judges.calls,
          items: ledger.judges.items,
          unknownSpend: ledger.judges.unknownSpend,
        },
        benchmark: {
          usd: Number(ledger.benchmark.usd.toFixed(4)),
          aiUsd: Number(ledger.benchmark.aiUsd.toFixed(4)),
          projectedInfraUsd: Number(ledger.benchmark.projectedInfraUsd.toFixed(6)),
          runs: ledger.benchmark.runs,
        },
      },
      null,
      2,
    ),
  );
}

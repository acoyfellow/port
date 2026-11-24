import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSpend } from './report-spend.mjs';
import { fleetFrontier, fleetTradeoffFrontier, summarizeFleetRun, validateFleetReport } from './schema.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tmp = join(root, '.tmp', 'fleet-search');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export const buildFleetReport = async (triage = null) => {
  const benchDir = join(tmp, 'benchmarks');
  const benchFiles = existsSync(benchDir)
    ? readdirSync(benchDir)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => join(benchDir, name))
    : [];
  const runs = benchFiles.map(readJson);
  const calibration = readJson(join(tmp, 'calibration', 'result.json'));
  const judgeVal = readJson(join(tmp, 'judges', 'planted-validation.json'));
  const triageFile = join(tmp, 'judges', 'live-triage-all.json');
  const resolvedTriage = triage ?? (existsSync(triageFile) ? readJson(triageFile) : null);
  const spend = await collectSpend();

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    model: runs[0]?.model ?? 'unknown',
    spend,
    calibration,
    judgeValidation: {
      plantedCases: judgeVal.plantedCases,
      clefAccuracy: judgeVal.clef.accuracy,
      clefUsd: judgeVal.clef.usd,
      clefFlashAccuracy: judgeVal.clefFlash.accuracy,
      clefFlashUsd: judgeVal.clefFlash.usd,
    },
    triage: resolvedTriage,
    runs,
    summaries: runs.map(summarizeFleetRun),
    frontiers: {
      seats1: fleetFrontier(runs, 1),
      seats10Strict: fleetFrontier(runs, 10),
      seats10Tradeoff: fleetTradeoffFrontier(runs, 10),
    },
  };

  const validated = validateFleetReport(report);
  const outJson = join(root, 'proof', 'fleet-search', 'report.json');
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);

  const rows = report.summaries
    .slice()
    .sort((a, b) => a.seats - b.seats || b.passRate - a.passRate || a.makespanMs - b.makespanMs)
    .map(
      (r) =>
        `| ${r.slug} | ${r.seats} | ${r.passed}/${r.attempted} | ${(r.makespanMs / 1000).toFixed(1)} s | ${(r.p50Ms / 1000).toFixed(1)} s | ${(r.p95Ms / 1000).toFixed(1)} s | ${r.containerSeconds.toFixed(1)} s | $${r.aiUsd.toFixed(4)} | $${r.projectedInfraUsd.toFixed(5)} |`,
    );

  const md = [
    '# Fleet Architecture Search — Measured Results',
    '',
    `Model: \`${report.model}\` on Cloudflare Customer 0.`,
    '',
    '| Shape | Seats | Passed | Makespan | p50 | p95 | Container-s | AI USD | Projected Infra USD |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows,
    '',
    '## 4-Line Spend Ledger',
    '',
    `- **Orchestrator:** $${spend.orchestrator.usd.toFixed(4)} reported + ${spend.orchestrator.unpricedTurns} unpriced turns (${spend.orchestrator.outputTokens} out tokens; \`unknownSpend=${spend.orchestrator.unknownSpend}\`)`,
    `- **Builders (assay relay):** $${spend.builders.usd.toFixed(4)} across ${spend.builders.seats} seats`,
    `- **Judges (odds/clef & clef-flash):** $${spend.judges.usd.toFixed(6)} across ${spend.judges.items} items`,
    `- **Benchmark (Customer 0):** $${spend.benchmark.usd.toFixed(4)} ($${spend.benchmark.aiUsd.toFixed(4)} AI + $${spend.benchmark.projectedInfraUsd.toFixed(5)} projected infra)`,
    '',
    '## Pareto Frontiers (100% pass)',
    '',
    `- **1 seat (100% pass):** ${validated.frontier1.map((r) => r.slug).join(', ') || 'none'}`,
    `- **10 seats (100% pass):** ${validated.frontier10.map((r) => r.slug).join(', ') || 'none'}`,
    `- **10 seats (pass-rate × cost × makespan tradeoff):** ${validated.tradeoffFrontier10.map((r) => `${r.slug} (${r.passed}/${r.attempted}, $${r.projectedTotalUsdPerAccepted.toFixed(4)}/ok, ${(r.makespanMs / 1000).toFixed(0)}s)`).join(', ') || 'none'}`,
    '',
  ].join('\n');
  writeFileSync(join(root, 'proof', 'fleet-search', 'FRONTIER.md'), md);
  return { report, validated };
};

if (process.argv[1]?.endsWith('build-report.mjs')) {
  const { validated } = await buildFleetReport();
  console.log(JSON.stringify(validated, null, 2));
}

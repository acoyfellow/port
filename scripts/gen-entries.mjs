import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const entriesDir = join(root, 'shared', 'entries');
const shapesDir = join(root, 'shapes');
const order = [
  'isolate-agents',
  'durable-session',
  'chat-with-sandbox',
  'agent-room',
  'container-per-thread',
  'person-with-computer',
  'shared-container',
  'sealed-box',
  'self-editing-app',
  'git-gatekeeper',
  'gadget-workspace',
  'egress-filter',
  'snapshot-rollback',
  'scheduled-agent',
  'flight-recorder',
  'safe-sql',
  'workflow-plan',
  'vector-memory',
  'write-list',
  'beam-fleet',
  'beam-space',
  'nix-git',
  'pull-fleet',
  'tiered-fleet',
  'tiered-pull-fleet',
];
const rank = (slug) => order.indexOf(slug) + 1 || 99;

const isDraftShape = (slug) => {
  const source = readFileSync(join(shapesDir, slug, 'shape.ts'), 'utf8');
  return /stage:\s*'idea'/.test(source);
};

const allShapeSlugs = readdirSync(shapesDir).filter((name) => existsSync(join(shapesDir, name, 'shape.ts')));
const shapeSlugs = allShapeSlugs.filter((slug) => !isDraftShape(slug));
const draftSlugs = allShapeSlugs.filter((slug) => isDraftShape(slug)).sort();
const entrySlugs = [];

const buildOf = (slug) => {
  const file = join(root, 'proof', 'pi', `${slug}.json`);
  if (!existsSync(file)) return undefined;
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  if (receipt.agent !== 'pi-durable' || receipt.passed !== true || receipt.infrastructureOk !== true)
    return undefined;
  return {
    task: receipt.task,
    infrastructure: receipt.infrastructure,
    usd: receipt.usd,
    tokens: receipt.tokens,
    seconds: receipt.seconds,
    resumed: receipt.resumed === true,
    on: receipt.at.slice(0, 10),
  };
};

const evalReport = JSON.parse(readFileSync(join(root, 'proof', 'eval-all.json'), 'utf8'));

const evalOf = (slug) => {
  const summary = evalReport.summary[slug];
  if (summary === undefined || !(summary.ran > 0) || typeof summary.passed !== 'number') return undefined;
  const rows = evalReport.rows.filter((row) => row.slug === slug);
  const counted = rows.filter((row) => row.usd > 0);
  const capped = rows.filter((row) => row.capped === true || row.usd === 0).length;
  return {
    passed: summary.passed,
    of: summary.of,
    usdPerTask: Number(
      (counted.reduce((sum, row) => sum + row.usd, 0) / Math.max(1, counted.length)).toFixed(4),
    ),
    capped,
    medianSeconds: summary.medianSeconds,
    note: summary.note ?? '',
    on: evalReport.at.slice(0, 10),
  };
};

const addedOn = (slug) => {
  const dates = execFileSync(
    'git',
    ['log', '--diff-filter=A', '--format=%as', '--', `shapes/${slug}/shape.ts`],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  return dates.at(-1) ?? new Date().toISOString().slice(0, 10);
};

const fleetReportPath = join(root, 'proof', 'fleet-search', 'report.json');
const tieredPullReportPath = join(root, 'proof', 'tiered-pull', 'report.json');
const fleetReport = existsSync(fleetReportPath)
  ? JSON.parse(readFileSync(fleetReportPath, 'utf8'))
  : undefined;
const tieredPullReport = existsSync(tieredPullReportPath)
  ? JSON.parse(readFileSync(tieredPullReportPath, 'utf8'))
  : undefined;

const toFleetBenchRun = (run) => {
  const passed = run.trials.filter((trial) => trial.passed === true).length;
  const attempted = run.trials.length;
  const timings = run.trials.map((trial) => trial.elapsedMs).sort((a, b) => a - b);
  const p50Ms = timings[Math.floor((timings.length - 1) * 0.5)] ?? 0;
  const p95Ms = timings[Math.ceil(timings.length * 0.95) - 1] ?? 0;
  const totalUsd = run.aiUsd + run.projectedInfraUsd;
  return {
    seats: run.seats,
    passed,
    attempted,
    makespanSeconds: Number((run.makespanMs / 1000).toFixed(1)),
    p50Seconds: Number((p50Ms / 1000).toFixed(1)),
    p95Seconds: Number((p95Ms / 1000).toFixed(1)),
    containerSeconds: Number(run.containerSeconds.toFixed(1)),
    containerSecondsPerOk: passed > 0 ? Number((run.containerSeconds / passed).toFixed(1)) : null,
    aiUsd: Number(run.aiUsd.toFixed(4)),
    projectedInfraUsd: Number(run.projectedInfraUsd.toFixed(5)),
    totalUsdPerOk: passed > 0 ? Number((totalUsd / passed).toFixed(4)) : null,
    sweptClean: run.sweep?.leftovers === 0 && run.sweep?.errors === 0,
    ...(typeof run.fleetMetrics?.isolateCommands === 'number'
      ? {
          isolateCommands: run.fleetMetrics.isolateCommands,
          totalCommands: run.fleetMetrics.totalCommands,
        }
      : {}),
  };
};

const pareto10Slugs = new Set((fleetReport?.frontiers?.seats10Tradeoff ?? []).map((row) => row.slug));

const fleetBenchOf = (slug) => {
  if (fleetReport === undefined) return undefined;
  const mine = fleetReport.runs.filter((run) => run.slug === slug);
  if (mine.length === 0) return undefined;
  const one = mine.find((run) => run.seats === 1);
  const ten = mine.find((run) => run.seats === 10);
  return {
    model: fleetReport.model,
    on: fleetReport.generatedAt.slice(0, 10),
    ...(one === undefined ? {} : { oneSeat: toFleetBenchRun(one) }),
    ...(ten === undefined ? {} : { tenSeats: toFleetBenchRun(ten) }),
    onPareto10: pareto10Slugs.has(slug),
  };
};

const draftInfoOf = (slug) => {
  const source = readFileSync(join(shapesDir, slug, 'shape.ts'), 'utf8');
  const name = /name:\s*'([^']+)'/.exec(source)?.[1] ?? slug;
  const oneLine = /oneLine:\s*\n?\s*'([^']+)'/.exec(source)?.[1] ?? '';
  return {
    slug,
    name,
    oneLine,
    hasAlchemy: existsSync(join(shapesDir, slug, 'alchemy.run.ts')),
    hasSmoke: existsSync(join(shapesDir, slug, 'smoke.ts')),
    hasReceipt: existsSync(join(root, 'proof', 'pi', `${slug}.json`)),
  };
};

const ident = (slug) => slug.replaceAll('-', '_');
const all = [
  ...shapeSlugs.map((slug) => ({ slug, from: `../../shapes/${slug}/shape`, name: 'SHAPE' })),
  ...entrySlugs.map((slug) => ({ slug, from: `./${slug}`, name: 'ENTRY' })),
].sort((a, b) => rank(a.slug) - rank(b.slug));

const imports = all.map(({ slug, from, name }) => `import { ${name} as ${ident(slug)} } from '${from}';`);
const builds = Object.fromEntries(
  shapeSlugs.map((slug) => [slug, buildOf(slug)]).filter(([, build]) => build !== undefined),
);
const added = Object.fromEntries(shapeSlugs.map((slug) => [slug, addedOn(slug)]));
const evals = Object.fromEntries(
  shapeSlugs.map((slug) => [slug, evalOf(slug)]).filter(([, result]) => result !== undefined),
);
const fleetBenches = Object.fromEntries(
  shapeSlugs.map((slug) => [slug, fleetBenchOf(slug)]).filter(([, result]) => result !== undefined),
);
const items = all.map(
  ({ slug }) =>
    `{ ...${ident(slug)}${added[slug] === undefined ? '' : `, added: ${JSON.stringify(added[slug])}`}${builds[slug] === undefined ? '' : `, build: BUILDS[${JSON.stringify(slug)}]`}${evals[slug] === undefined ? '' : `, evalAll: EVALS[${JSON.stringify(slug)}]`}${fleetBenches[slug] === undefined ? '' : `, fleetBench: FLEET_BENCHES[${JSON.stringify(slug)}]`} }`,
);

writeFileSync(
  join(entriesDir, 'index.ts'),
  `import type { Entry, EvalAll, FleetBenchEntry, ShapeBuild } from '../entry.ts';\n${imports.join('\n')}\n\nconst BUILDS: Readonly<Record<string, ShapeBuild>> = ${JSON.stringify(builds, null, 2)};\n\nconst EVALS: Readonly<Record<string, EvalAll>> = ${JSON.stringify(evals, null, 2)};\n\nconst FLEET_BENCHES: Readonly<Record<string, FleetBenchEntry>> = ${JSON.stringify(fleetBenches, null, 2)};\n\nexport const ENTRIES: readonly Entry[] = [\n  ${items.join(',\n  ')},\n];\n`,
);

const fleetSnapshot = {
  generatedAt: fleetReport?.generatedAt ?? '',
  model: fleetReport?.model ?? '',
  runs: (fleetReport?.runs ?? []).map((run) => ({ slug: run.slug, ...toFleetBenchRun(run) })),
  pareto10: (fleetReport?.frontiers?.seats10Tradeoff ?? []).map((row) => ({
    slug: row.slug,
    passed: row.passed,
    attempted: row.attempted,
    makespanSeconds: Number((row.makespanMs / 1000).toFixed(1)),
    containerSeconds: Number(row.containerSeconds.toFixed(1)),
    totalUsdPerOk: Number(row.projectedTotalUsdPerAccepted.toFixed(4)),
  })),
  escalation: tieredPullReport?.escalation
    ? {
        passed: tieredPullReport.escalation.passed,
        answer: tieredPullReport.escalation.answer,
        escalatedSeats: tieredPullReport.escalation.escalatedSeats,
        containerSeconds: tieredPullReport.escalation.containerSeconds,
        aiUsd: tieredPullReport.escalation.aiUsd,
        sweptClean:
          tieredPullReport.escalation.sweep?.leftovers === 0 &&
          tieredPullReport.escalation.sweep?.errors === 0,
      }
    : null,
  calibration: fleetReport?.calibration
    ? {
        winner: fleetReport.calibration.winner,
        models: fleetReport.calibration.models.map((m) => ({
          id: m.id,
          passed: m.passed,
          turns: m.turns ?? null,
          seconds: m.ms ? Number((m.ms / 1000).toFixed(1)) : null,
          usd: m.usd,
          reason: m.reason ?? '',
        })),
      }
    : null,
  judgeValidation: fleetReport?.judgeValidation ?? null,
  spend: fleetReport?.spend
    ? {
        orchestratorUsd: Number(fleetReport.spend.orchestrator.usd.toFixed(4)),
        orchestratorUnpricedTurns: fleetReport.spend.orchestrator.unpricedTurns,
        orchestratorOutTokens: fleetReport.spend.orchestrator.outputTokens,
        orchestratorUnknown: fleetReport.spend.orchestrator.unknownSpend,
        buildersUsd: Number(fleetReport.spend.builders.usd.toFixed(4)),
        buildersSeats: fleetReport.spend.builders.seats,
        judgesUsd: Number(fleetReport.spend.judges.usd.toFixed(6)),
        judgesItems: fleetReport.spend.judges.items,
        benchmarkUsd: Number(fleetReport.spend.benchmark.usd.toFixed(4)),
        benchmarkAiUsd: Number(fleetReport.spend.benchmark.aiUsd.toFixed(4)),
        benchmarkInfraUsd: Number(fleetReport.spend.benchmark.projectedInfraUsd.toFixed(5)),
        benchmarkRuns: fleetReport.spend.benchmark.runs,
      }
    : null,
  tieredPullSpend: tieredPullReport?.spend
    ? {
        buildersUsd: Number(tieredPullReport.spend.builders.usd.toFixed(4)),
        judgesUsd: Number(tieredPullReport.spend.judges.usd.toFixed(6)),
        benchmarkUsd: Number(tieredPullReport.spend.benchmark.usd.toFixed(4)),
        benchmarkRuns: tieredPullReport.spend.benchmark.runs,
        orchestratorUnknown: tieredPullReport.spend.orchestrator.unknownSpend,
      }
    : null,
  drafts: draftSlugs.map(draftInfoOf),
};

writeFileSync(
  join(entriesDir, 'fleet-bench.ts'),
  `export const FLEET_BENCH = ${JSON.stringify(fleetSnapshot, null, 2)} as const;\n`,
);
console.log(
  `entries: ${all.map(({ slug }) => slug).join(', ')}; builds: ${Object.keys(builds).length}; drafts: ${draftSlugs.length}`,
);

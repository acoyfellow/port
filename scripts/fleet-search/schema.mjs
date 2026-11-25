import { validateSpendLedger } from './spend.mjs';

export const BASELINE_SLUGS = ['container-per-thread', 'shared-container', 'isolate-agents'];

export const validateFleetRun = (run) => {
  if (!run || typeof run !== 'object') throw new Error('Invalid fleet run');
  if (typeof run.slug !== 'string' || run.slug === '') throw new Error('Missing fleet slug');
  if (!Number.isSafeInteger(run.seats) || run.seats < 1) throw new Error(`Invalid seats for ${run.slug}`);
  if (!Number.isFinite(run.makespanMs) || run.makespanMs <= 0)
    throw new Error(`Missing makespan for ${run.slug}`);
  if (!Number.isFinite(run.containerSeconds) || run.containerSeconds < 0)
    throw new Error(`Missing containerSeconds for ${run.slug}`);
  if (run.usesContainer === true && run.containerSeconds <= 0)
    throw new Error(`Container shape ${run.slug} must report positive containerSeconds`);
  if (!Number.isFinite(run.aiUsd) || run.aiUsd < 0) throw new Error(`Missing aiUsd for ${run.slug}`);
  if (!Number.isFinite(run.projectedInfraUsd) || run.projectedInfraUsd < 0)
    throw new Error(`Missing projectedInfraUsd for ${run.slug}`);
  if (!Array.isArray(run.trials) || run.trials.length === 0)
    throw new Error(`Missing trials for ${run.slug}`);
  for (const trial of run.trials) {
    if (typeof trial.task !== 'string' || typeof trial.passed !== 'boolean')
      throw new Error(`Incomplete trial in ${run.slug}`);
    if (!Number.isFinite(trial.elapsedMs) || trial.elapsedMs <= 0)
      throw new Error(`Invalid trial timing in ${run.slug}`);
    if (trial.deployFailed === true) throw new Error(`Failed deploy recorded as run in ${run.slug}`);
  }
  if (run.sweep === null || run.sweep === undefined) throw new Error(`Unclean sweep for ${run.slug}`);
  if (run.sweep.leftovers !== 0 || run.sweep.errors !== 0) throw new Error(`Unclean sweep for ${run.slug}`);
  return run;
};

export const summarizeFleetRun = (run) => {
  const valid = validateFleetRun(run);
  const passed = valid.trials.filter((trial) => trial.passed).length;
  const totalUsd = valid.aiUsd + valid.projectedInfraUsd;
  const timings = valid.trials.map((trial) => trial.elapsedMs).sort((a, b) => a - b);
  const p50Ms = timings[Math.floor((timings.length - 1) * 0.5)];
  const p95Ms = timings[Math.ceil(timings.length * 0.95) - 1];
  return {
    slug: valid.slug,
    seats: valid.seats,
    passed,
    attempted: valid.trials.length,
    passRate: passed / valid.trials.length,
    makespanMs: valid.makespanMs,
    p50Ms,
    p95Ms,
    containerSeconds: valid.containerSeconds,
    containerSecondsPerAccepted: passed === 0 ? Infinity : valid.containerSeconds / passed,
    aiUsd: valid.aiUsd,
    projectedInfraUsd: valid.projectedInfraUsd,
    projectedTotalUsdPerAccepted: passed === 0 ? Infinity : totalUsd / passed,
  };
};

export const fleetFrontier = (runs, seats) => {
  const rows = runs
    .map(summarizeFleetRun)
    .filter((row) => row.seats === seats && row.passed === row.attempted);
  return rows.filter(
    (row) =>
      !rows.some(
        (other) =>
          other.projectedTotalUsdPerAccepted <= row.projectedTotalUsdPerAccepted &&
          other.makespanMs <= row.makespanMs &&
          (other.projectedTotalUsdPerAccepted < row.projectedTotalUsdPerAccepted ||
            other.makespanMs < row.makespanMs),
      ),
  );
};

export const fleetTradeoffFrontier = (runs, seats) => {
  const rows = runs.map(summarizeFleetRun).filter((row) => row.seats === seats && row.passed > 0);
  return rows.filter(
    (row) =>
      !rows.some(
        (other) =>
          other.passRate >= row.passRate &&
          other.projectedTotalUsdPerAccepted <= row.projectedTotalUsdPerAccepted &&
          other.makespanMs <= row.makespanMs &&
          (other.passRate > row.passRate ||
            other.projectedTotalUsdPerAccepted < row.projectedTotalUsdPerAccepted ||
            other.makespanMs < row.makespanMs),
      ),
  );
};

export const validateFleetReport = (report) => {
  if (report === null || report === undefined) throw new Error('Unsupported fleet report');
  if (report.version !== 1) throw new Error('Unsupported fleet report');
  validateSpendLedger(report.spend);
  if (
    !report.calibration ||
    !Array.isArray(report.calibration.models) ||
    report.calibration.models.length < 2
  )
    throw new Error('Missing builder model calibration');
  if (!report.judgeValidation || report.judgeValidation.plantedCases < 4)
    throw new Error('Missing Clef/Clairic planted-case validation');
  if (!Array.isArray(report.runs) || report.runs.length === 0) throw new Error('No fleet runs recorded');
  for (const run of report.runs) validateFleetRun(run);
  const slugs = new Set(report.runs.map((run) => run.slug));
  for (const required of BASELINE_SLUGS) {
    if (!slugs.has(required)) throw new Error(`Missing baseline shape: ${required}`);
  }
  const novel = [...slugs].filter((slug) => !BASELINE_SLUGS.includes(slug));
  if (novel.length < 1) throw new Error('Need at least one novel fleet architecture');
  return {
    baseline: BASELINE_SLUGS,
    novel,
    frontier1: fleetFrontier(report.runs, 1),
    frontier10: fleetFrontier(report.runs, 10),
    tradeoffFrontier10: fleetTradeoffFrontier(report.runs, 10),
  };
};

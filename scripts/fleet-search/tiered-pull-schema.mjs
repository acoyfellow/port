import { summarizeFleetRun, validateFleetRun } from './schema.mjs';
import { validateSpendLedger } from './spend.mjs';

export const TIERED_PULL_CAPS = {
  orchestratorUsd: 15,
  buildersUsd: 5,
  benchmarkUsd: 10,
};

export const validateEscalation = (escalation) => {
  if (escalation === null || escalation === undefined) throw new Error('Missing subprocess escalation check');
  if (escalation.passed !== true) throw new Error('Subprocess escalation did not pass');
  if (!Number.isSafeInteger(escalation.escalatedSeats) || escalation.escalatedSeats < 1)
    throw new Error('Escalation did not route to container');
  if (!Number.isFinite(escalation.containerSeconds) || escalation.containerSeconds <= 0)
    throw new Error('Escalation must report positive containerSeconds');
  if (escalation.sweep === null || escalation.sweep === undefined)
    throw new Error('Missing escalation sweep');
  if (escalation.sweep.leftovers !== 0 || escalation.sweep.errors !== 0)
    throw new Error('Unclean escalation sweep');
  return escalation;
};

export const validateTieredPullReport = (report) => {
  if (report === null || report === undefined) throw new Error('Unsupported tiered-pull report');
  if (report.version !== 1) throw new Error('Unsupported tiered-pull report version');
  validateSpendLedger(report.spend, TIERED_PULL_CAPS);
  validateEscalation(report.escalation);
  if (!Array.isArray(report.runs) || report.runs.length < 2)
    throw new Error('Need 1-seat and 10-seat tiered-pull-fleet runs');
  for (const run of report.runs) validateFleetRun(run);
  const run1 = report.runs.find((run) => run.slug === 'tiered-pull-fleet' && run.seats === 1);
  const run10 = report.runs.find((run) => run.slug === 'tiered-pull-fleet' && run.seats === 10);
  if (run1 === undefined) throw new Error('Missing tiered-pull-fleet 1-seat run');
  if (run10 === undefined) throw new Error('Missing tiered-pull-fleet 10-seat run');
  const s1 = summarizeFleetRun(run1);
  const s10 = summarizeFleetRun(run10);
  if (report.baselinePullFleet10 === null || report.baselinePullFleet10 === undefined)
    throw new Error('Missing pull-fleet 10-seat comparison baseline');
  const base10 = report.baselinePullFleet10;
  if (!Number.isFinite(base10.containerSeconds) || base10.containerSeconds <= 0)
    throw new Error('Invalid pull-fleet 10-seat baseline');
  return {
    slug: 'tiered-pull-fleet',
    seats1: {
      passed: `${s1.passed}/${s1.attempted}`,
      makespanMs: s1.makespanMs,
      containerSeconds: s1.containerSeconds,
    },
    seats10: {
      passed: `${s10.passed}/${s10.attempted}`,
      makespanMs: s10.makespanMs,
      containerSeconds: s10.containerSeconds,
      aiUsd: s10.aiUsd,
      projectedInfraUsd: s10.projectedInfraUsd,
    },
    containerSecondsDeltaVsPullFleet10: Number((s10.containerSeconds - base10.containerSeconds).toFixed(2)),
    escalationVerified: true,
  };
};

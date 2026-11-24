import { reserve as decideReserve, settle as decideSettle, toMicrodollars } from './budget/src/ledger.ts';

const MESSAGES = {
  InvalidReservation: 'Invalid reservation',
  DuplicateExperiment: 'Duplicate experiment',
  ConcurrencyLimit: 'Concurrency limit',
  BudgetLimit: 'Budget limit',
  NotRunning: 'Experiment is not running',
  ReservationExceeded: 'Reservation exceeded',
  NotOpened: 'Campaign is not open',
  AlreadyOpened: 'Campaign is already open',
};

const stateOf = (ledger, limitUsd, concurrency) => ({
  limit: toMicrodollars(limitUsd),
  concurrency,
  jobs: Object.entries(ledger.jobs).map(([id, job]) => ({
    id,
    state: job.state,
    maximum: toMicrodollars(job.maximumUsd),
    actual: job.actualUsd === undefined ? null : toMicrodollars(job.actualUsd),
  })),
});

const accept = (outcome) => {
  if (outcome.accepted) return;
  throw new Error(MESSAGES[outcome.rejection] ?? outcome.rejection);
};

const microdollarsOf = (dollars, message) => {
  if (!Number.isFinite(dollars)) throw new Error(message);
  return dollars;
};

export const reserve = (ledger, id, maximumUsd, limitUsd = 20, concurrency = 2) => {
  accept(
    decideReserve(
      stateOf(ledger, limitUsd, concurrency),
      id,
      microdollarsOf(maximumUsd, 'Invalid reservation'),
    ),
  );
  return { ...ledger, jobs: { ...ledger.jobs, [id]: { state: 'running', maximumUsd } } };
};

export const settle = (ledger, id, actualUsd, limitUsd = 20, concurrency = 2) => {
  accept(
    decideSettle(
      stateOf(ledger, limitUsd, concurrency),
      id,
      microdollarsOf(actualUsd, 'Reservation exceeded'),
    ),
  );
  const job = ledger.jobs[id];
  return { ...ledger, jobs: { ...ledger.jobs, [id]: { ...job, state: 'done', actualUsd } } };
};

import * as Domain from '@alchemy.run/domain';
import * as Schema from 'effect/Schema';

export const CampaignId = Schema.String.pipe(Schema.brand('CampaignId'));

const Microdollars = Schema.Int;

const Job = Schema.Struct({
  id: Schema.String,
  state: Schema.Literals(['running', 'done']),
  maximum: Microdollars,
  actual: Schema.NullOr(Microdollars),
});

const BudgetState = Schema.Struct({
  limit: Schema.NullOr(Microdollars),
  concurrency: Schema.Int,
  jobs: Schema.Array(Job),
});

export class NotOpened extends Domain.Rejection('NotOpened') {}
export class AlreadyOpened extends Domain.Rejection('AlreadyOpened') {}
export class InvalidReservation extends Domain.Rejection('InvalidReservation') {}
export class DuplicateExperiment extends Domain.Rejection('DuplicateExperiment') {}
export class ConcurrencyLimit extends Domain.Rejection('ConcurrencyLimit') {}
export class BudgetLimit extends Domain.Rejection('BudgetLimit', { remaining: Microdollars }) {}
export class NotRunning extends Domain.Rejection('NotRunning') {}
export class ReservationExceeded extends Domain.Rejection('ReservationExceeded') {}

export class CampaignOpened extends Domain.Event('CampaignOpened', {
  limit: Microdollars,
  concurrency: Schema.Int,
}) {}

export class OpenCampaign extends Domain.Command('OpenCampaign', {
  target: CampaignId,
  input: { limit: Microdollars, concurrency: Schema.Int },
  events: [CampaignOpened],
  rejects: [AlreadyOpened, InvalidReservation],
}) {}

export class SpendReserved extends Domain.Event('SpendReserved', {
  id: Schema.String,
  maximum: Microdollars,
}) {}

export class ReserveSpend extends Domain.Command('ReserveSpend', {
  target: CampaignId,
  input: { id: Schema.String, maximum: Microdollars },
  events: [SpendReserved],
  rejects: [NotOpened, InvalidReservation, DuplicateExperiment, ConcurrencyLimit, BudgetLimit],
}) {}

export class SpendSettled extends Domain.Event('SpendSettled', {
  id: Schema.String,
  actual: Microdollars,
}) {}

export class SettleSpend extends Domain.Command('SettleSpend', {
  target: CampaignId,
  input: { id: Schema.String, actual: Microdollars },
  events: [SpendSettled],
  rejects: [NotOpened, NotRunning, ReservationExceeded],
}) {}

type State = typeof BudgetState.Type;

const committed = (state: State) => state.jobs.reduce((total, job) => total + (job.actual ?? job.maximum), 0);

export class Campaign extends Domain.Aggregate('Campaign', {
  id: CampaignId,
  state: BudgetState,
  initial: { limit: null, concurrency: 0, jobs: [] },
  commands: [OpenCampaign, ReserveSpend, SettleSpend],
  decide: {
    OpenCampaign: (campaign, cmd) => {
      if (campaign.limit !== null) return new AlreadyOpened();
      if (cmd.limit <= 0 || cmd.concurrency < 1) return new InvalidReservation();
      return [new CampaignOpened({ limit: cmd.limit, concurrency: cmd.concurrency })];
    },
    ReserveSpend: (campaign, cmd) => {
      if (campaign.limit === null) return new NotOpened();
      if (cmd.maximum <= 0) return new InvalidReservation();
      if (campaign.jobs.some((job) => job.id === cmd.id)) return new DuplicateExperiment();
      if (campaign.jobs.filter((job) => job.state === 'running').length >= campaign.concurrency)
        return new ConcurrencyLimit();
      const remaining = campaign.limit - committed(campaign);
      if (cmd.maximum > remaining) return new BudgetLimit({ remaining });
      return [new SpendReserved({ id: cmd.id, maximum: cmd.maximum })];
    },
    SettleSpend: (campaign, cmd) => {
      if (campaign.limit === null) return new NotOpened();
      const job = campaign.jobs.find((each) => each.id === cmd.id);
      if (job === undefined || job.state !== 'running') return new NotRunning();
      if (cmd.actual < 0 || cmd.actual > job.maximum) return new ReservationExceeded();
      return [new SpendSettled({ id: cmd.id, actual: cmd.actual })];
    },
  },
  evolve: {
    CampaignOpened: (s, e) => ({ ...s, limit: e.limit, concurrency: e.concurrency }),
    SpendReserved: (s, e) => ({
      ...s,
      jobs: [...s.jobs, { id: e.id, state: 'running' as const, maximum: e.maximum, actual: null }],
    }),
    SpendSettled: (s, e) => ({
      ...s,
      jobs: s.jobs.map((job) =>
        job.id === e.id ? { ...job, state: 'done' as const, actual: e.actual } : job,
      ),
    }),
  },
}) {}

export class Budget extends Domain.Model('Budget', { aggregates: [Campaign] }) {}

export type CampaignState = typeof BudgetState.Type;

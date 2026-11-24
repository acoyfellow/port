import * as DateTime from 'effect/DateTime';
import {
  Campaign,
  CampaignId,
  type CampaignState,
  OpenCampaign,
  ReserveSpend,
  SettleSpend,
} from './Budget.ts';

export type Outcome =
  | { readonly accepted: true; readonly state: CampaignState }
  | { readonly accepted: false; readonly rejection: string; readonly detail: Record<string, unknown> };

const MICRODOLLARS = 1_000_000;
const campaign = CampaignId.make('campaign');

export const toMicrodollars = (dollars: number) => {
  if (!Number.isFinite(dollars)) throw new Error('Amount must be finite');
  return Math.round(dollars * MICRODOLLARS);
};

export const toDollars = (microdollars: number) => microdollars / MICRODOLLARS;

export const empty: CampaignState = { limit: null, concurrency: 0, jobs: [] };

const options = () => ({ id: campaign, now: DateTime.nowUnsafe(), commandId: 'architecture-search' });

type Prediction =
  | { readonly _tag: 'Accepted'; readonly state: CampaignState }
  | { readonly _tag: 'Rejected'; readonly rejection: { readonly _tag: string } }
  | { readonly _tag: 'Unpredictable' };

const outcomeOf = (prediction: Prediction): Outcome => {
  if (prediction._tag === 'Accepted') return { accepted: true, state: prediction.state };
  if (prediction._tag === 'Rejected') {
    const { _tag, ...detail } = prediction.rejection;
    return { accepted: false, rejection: _tag, detail };
  }
  throw new Error('Budget decision could not be evaluated');
};

export const open = (state: CampaignState, limitUsd: number, concurrency: number): Outcome =>
  outcomeOf(
    Campaign.predict(state, new OpenCampaign({ limit: toMicrodollars(limitUsd), concurrency }), options()),
  );

export const reserve = (state: CampaignState, id: string, maximumUsd: number): Outcome =>
  outcomeOf(
    Campaign.predict(state, new ReserveSpend({ id, maximum: toMicrodollars(maximumUsd) }), options()),
  );

export const settle = (state: CampaignState, id: string, actualUsd: number): Outcome =>
  outcomeOf(Campaign.predict(state, new SettleSpend({ id, actual: toMicrodollars(actualUsd) }), options()));

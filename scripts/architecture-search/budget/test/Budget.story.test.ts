import { Story } from '@alchemy.run/domain/Story';
import { it } from '@effect/vitest';
import {
  AlreadyOpened,
  Budget,
  BudgetLimit,
  Campaign,
  CampaignOpened,
  ConcurrencyLimit,
  DuplicateExperiment,
  InvalidReservation,
  NotOpened,
  NotRunning,
  OpenCampaign,
  ReservationExceeded,
  ReserveSpend,
  SettleSpend,
  SpendReserved,
  SpendSettled,
} from '../src/Budget.ts';

const story = Story.make(Budget, {});
const campaign = Campaign.ref('c1');
const usd = (dollars: number) => Math.round(dollars * 1_000_000);
const opened = new CampaignOpened({ limit: usd(20), concurrency: 2 });

it.effect('refuses spend before the campaign is opened', () =>
  story(
    Story.when(campaign, new ReserveSpend({ id: 'a', maximum: usd(1) })),
    Story.rejected(new NotOpened()),
  ),
);

it.effect('reserves, then settles below the reservation', () =>
  story(
    Story.given(campaign, opened),
    Story.when(campaign, new ReserveSpend({ id: 'a', maximum: usd(2) })),
    Story.then(campaign, new SpendReserved({ id: 'a', maximum: usd(2) })),
    Story.when(campaign, new SettleSpend({ id: 'a', actual: usd(0.06) })),
    Story.then(campaign, new SpendSettled({ id: 'a', actual: usd(0.06) })),
  ),
);

it.effect('holds the concurrency limit and frees a slot on settlement', () =>
  story(
    Story.given(
      campaign,
      opened,
      new SpendReserved({ id: 'a', maximum: usd(2) }),
      new SpendReserved({ id: 'b', maximum: usd(2) }),
    ),
    Story.when(campaign, new ReserveSpend({ id: 'c', maximum: usd(1) })),
    Story.rejected(new ConcurrencyLimit()),
    Story.when(campaign, new SettleSpend({ id: 'a', actual: usd(0.1) })),
    Story.then(campaign, new SpendSettled({ id: 'a', actual: usd(0.1) })),
    Story.when(campaign, new ReserveSpend({ id: 'c', maximum: usd(1) })),
    Story.then(campaign, new SpendReserved({ id: 'c', maximum: usd(1) })),
  ),
);

it.effect('never lets reservations exceed the ceiling, and reports what remains', () =>
  story(
    Story.given(campaign, opened, new SpendReserved({ id: 'a', maximum: usd(19) })),
    Story.when(campaign, new ReserveSpend({ id: 'b', maximum: usd(1.5) })),
    Story.rejected(new BudgetLimit({ remaining: usd(1) })),
  ),
);

it.effect('counts a forfeited reservation at its full amount', () =>
  story(
    Story.given(
      campaign,
      opened,
      new SpendReserved({ id: 'a', maximum: usd(2) }),
      new SpendSettled({ id: 'a', actual: usd(2) }),
    ),
    Story.when(campaign, new ReserveSpend({ id: 'b', maximum: usd(18.5) })),
    Story.rejected(new BudgetLimit({ remaining: usd(18) })),
  ),
);

it.effect('refuses duplicates, bad amounts, overspend and settling twice', () =>
  story(
    Story.given(campaign, opened, new SpendReserved({ id: 'a', maximum: usd(2) })),
    Story.when(campaign, new ReserveSpend({ id: 'a', maximum: usd(1) })),
    Story.rejected(new DuplicateExperiment()),
    Story.when(campaign, new ReserveSpend({ id: 'z', maximum: 0 })),
    Story.rejected(new InvalidReservation()),
    Story.when(campaign, new SettleSpend({ id: 'a', actual: usd(2.01) })),
    Story.rejected(new ReservationExceeded()),
    Story.when(campaign, new SettleSpend({ id: 'q', actual: usd(1) })),
    Story.rejected(new NotRunning()),
    Story.when(campaign, new SettleSpend({ id: 'a', actual: usd(1) })),
    Story.then(campaign, new SpendSettled({ id: 'a', actual: usd(1) })),
    Story.when(campaign, new SettleSpend({ id: 'a', actual: usd(1) })),
    Story.rejected(new NotRunning()),
  ),
);

it.effect('a campaign can be opened once, with sane limits', () =>
  story(
    Story.when(campaign, new OpenCampaign({ limit: 0, concurrency: 2 })),
    Story.rejected(new InvalidReservation()),
    Story.when(campaign, new OpenCampaign({ limit: usd(20), concurrency: 2 })),
    Story.then(campaign, opened),
    Story.when(campaign, new OpenCampaign({ limit: usd(5), concurrency: 1 })),
    Story.rejected(new AlreadyOpened()),
  ),
);

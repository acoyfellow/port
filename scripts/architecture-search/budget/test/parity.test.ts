import { expect, it } from 'vitest';
import { reserve, settle } from '../../budget-ledger.mjs';
import { reserve as legacyReserve, settle as legacySettle } from '../../core.mjs';

type Ledger = { jobs: Record<string, unknown> };

const generator = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const NAMES = ['a', 'b', 'c', 'd', 'e'];

const outcomeOf = (run: () => unknown) => {
  try {
    run();
    return 'ok';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const withLedger = (ledger: Ledger, run: (next: Ledger) => Ledger) => {
  let result = ledger;
  const outcome = outcomeOf(() => {
    result = run(ledger);
  });
  return { outcome, ledger: result };
};

const compareSequences = (label: string, scale: number, concurrencyLimit: number) => {
  let compared = 0;
  const tally: Record<string, number> = {};
  const mismatches: string[] = [];
  for (let seed = 1; seed <= 400; seed++) {
    const next = generator(seed);
    let legacy: Ledger = { jobs: {} };
    let current: Ledger = { jobs: {} };
    for (let step = 0; step < 14; step++) {
      const id = NAMES[Math.floor(next() * NAMES.length)] ?? 'a';
      const reserveStep = next() < 0.55;
      const dollars = Math.round((next() * scale - 0.2) * 1_000_000) / 1_000_000;
      const before = withLedger(legacy, (ledger) =>
        reserveStep
          ? legacyReserve(ledger, id, dollars, 20, concurrencyLimit)
          : legacySettle(ledger, id, dollars),
      );
      const after = withLedger(current, (ledger) =>
        reserveStep
          ? reserve(ledger, id, dollars, 20, concurrencyLimit)
          : settle(ledger, id, dollars, 20, concurrencyLimit),
      );
      legacy = before.ledger;
      current = after.ledger;
      compared++;
      tally[after.outcome] = (tally[after.outcome] ?? 0) + 1;
      if (before.outcome !== after.outcome)
        mismatches.push(`seed ${seed} step ${step}: legacy ${before.outcome}, domain ${after.outcome}`);
    }
    expect(current).toEqual(legacy);
  }
  console.log('LEDGER-PARITY', label, compared, 'steps', JSON.stringify(tally));
  expect(mismatches).toEqual([]);
  return tally;
};

it('matches the legacy ledger over 400 seeded sequences with fractional amounts', () => {
  compareSequences('fractional', 9, 2);
});

it('matches the legacy ledger where the ceiling is reached often', () => {
  const tally = compareSequences('near-ceiling', 14, 5);
  expect(tally['Budget limit'] ?? 0).toBeGreaterThan(300);
});

it('keeps the ceiling at exactly 20 dollars with awkward cents', () => {
  let ledger: Ledger = { jobs: {} };
  ledger = reserve(ledger, 'a', 19.99, 20, 2);
  expect(() => reserve(ledger, 'b', 0.02, 20, 2)).toThrow('Budget limit');
  ledger = reserve(ledger, 'b', 0.01, 20, 2);
  expect(() => reserve(ledger, 'c', 0.000001, 20, 2)).toThrow(/Budget limit|Concurrency limit/);
});

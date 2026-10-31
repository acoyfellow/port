# Split a bill fairly

A group splits a restaurant bill with tip.

Acceptance:
- src/split.ts exports splitBill(total: Money, weights: number[], tipPercent: number): Money[]
- The tip is percentOf(total, tipPercent) from src/core/money.ts; the grand total is total plus tip
- Each share is proportional to its weight; the shares add up to exactly the grand total in cents
- Leftover cents go one each to the largest fractional remainders; ties go to the earlier person
- A weight of 0 gets zero; weights must be finite and not negative, with at least one above 0, else RangeError
- An empty weights list throws a RangeError; a negative total throws a RangeError; the currency is kept

Files you will most likely change: src/split.ts, test/split.test.ts

Conventions:

- Erasable TypeScript only: no `enum`, no `namespace`, no constructor parameter properties. Node strips the types and
  runs the file, with nothing installed and no build step.
- Relative imports name the `.ts` file (`import { add } from "./core/money.ts"`). Import types with `import type`.
- Amounts are `Money` from `src/core/money.ts`: integer cents and a currency. Build them with `money(cents, currency)`
  and do arithmetic with the module's functions, never on floats.
- Tests use `node:test` and `node:assert/strict` and live in `test/<name>.test.ts`; `node --test` runs them all.
  Compare amounts with `assert.deepEqual(actual, money(...))`.
- Every existing test must keep passing. When a function in `src/core/money.ts` changes, every caller and test of it
  must keep working; a function this intent does not mention keeps its signature and behavior.

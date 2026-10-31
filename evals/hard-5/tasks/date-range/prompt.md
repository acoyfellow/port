# Merge booking date ranges

Calendar holds are stored as date ranges and must be merged.

Acceptance:
- src/ranges.ts exports mergeRanges(ranges: [string, string][]): [string, string][]
- Dates are ISO strings "YYYY-MM-DD"; a range [start, end] includes both days
- Overlapping ranges and ranges that touch (end + 1 day = next start) merge into one
- The result is sorted by start; the input array and its items are not changed
- Month and year boundaries and leap days are handled: ["2024-02-28","2024-02-29"] touches ["2024-03-01","2024-03-02"]
- A range with start after end, or a string that is not a real calendar date (e.g. "2023-02-29", "2024-13-01", "2024-1-05"), throws a RangeError

Files you will most likely change: src/ranges.ts, test/ranges.test.ts

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

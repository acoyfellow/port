# Due dates in business days

Invoices are due a number of business days after issue.

Acceptance:
- src/dates.ts exports addBusinessDays(date: string, days: number, holidays?: string[]): string with YYYY-MM-DD dates in UTC
- Saturdays, Sundays and the given holidays are not business days; negative days count backward
- 0 days returns the date itself when it is a business day, else the next business day
- Throws a RangeError for a date that does not exist or is not YYYY-MM-DD, or for a non-integer number of days

Files you will most likely change: src/dates.ts, test/dates.test.ts

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


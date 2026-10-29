# Write amounts in words for checks

Printed refund checks need the amount in words.

Acceptance:
- src/words.ts exports toWords(m: Money): string for USD amounts
- Format: "<dollars in words> dollar(s)" then " and <cents in words> cent(s)" only when cents are not zero; singular for exactly one
- Numbers use lowercase English with hyphens for 21-99 and no "and" inside numbers: 115 is "one hundred fifteen"; scales up to millions
- Zero dollars is "zero dollars"; negative amounts start with "minus "
- Throws a RangeError for any currency other than USD or for more than 999,999,999.99 dollars

Files you will most likely change: src/words.ts, test/words.test.ts

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


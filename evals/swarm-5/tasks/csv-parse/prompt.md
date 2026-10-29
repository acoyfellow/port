# Parse CSV files correctly

Price-list imports break on quoted fields.

Acceptance:
- src/csv.ts exports parseCsv(text: string): string[][], one array of fields per record, following RFC 4180
- Quoted fields may contain commas, newlines, and doubled quotes that mean one quote
- Records end with LF or CRLF; a final line ending does not add an empty record; an empty input is []
- Spaces are kept as they are; an empty line in the middle is a record with one empty field
- Throws a SyntaxError for an unterminated quote, a quote inside an unquoted field, or text right after a closing quote

Files you will most likely change: src/csv.ts, test/csv.test.ts

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


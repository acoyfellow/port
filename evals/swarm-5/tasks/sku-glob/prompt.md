# Match SKUs with glob patterns

Promotions target SKUs by pattern.

Acceptance:
- src/glob.ts exports matchSku(pattern: string, sku: string): boolean, matching the whole SKU
- * matches any run of characters including none, ? exactly one, [abc] and ranges [a-z] one of a set, [!...] one not in the set
- ] right after [ or [! is a literal; - first or last in a set is a literal; an unclosed [ is a literal [
- \\ makes the next character literal; a trailing backslash throws a SyntaxError
- Matching must stay fast for patterns with many stars: no backtracking blow-up

Files you will most likely change: src/glob.ts, test/glob.test.ts

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


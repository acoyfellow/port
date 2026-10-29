# Merge carts

A guest cart is merged into the account cart at sign-in.

Acceptance:
- src/cart.ts exports mergeCarts(a: Cart, b: Cart): Cart
- Lines for the same sku are combined into one line, at a's position, with the quantities added and a's product kept
- Lines only in b are appended in b's order
- Carts in different currencies throw a TypeError; neither input cart is changed
- A merged quantity above 99 is capped at 99

Files you will most likely change: src/cart.ts, test/cart.test.ts

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


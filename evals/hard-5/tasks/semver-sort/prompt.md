# Sort release versions

The release page lists versions newest first.

Acceptance:
- src/semver.ts exports compareVersions(a: string, b: string): number (negative, 0 or positive) and sortVersions(vs: string[]): string[] newest first, input unchanged
- Versions follow SemVer 2.0.0: MAJOR.MINOR.PATCH, optional -prerelease and +build; a leading "v" is allowed and ignored
- Numbers compare numerically; a prerelease is lower than its release; prerelease identifiers compare left to right, numeric ones numerically, numeric lower than text, and more identifiers win when all earlier ones are equal
- Build metadata is ignored for order; two versions that differ only in build compare 0 and keep their input order when sorted
- Leading zeros in a number ("01.2.3", "1.2.3-01") or a missing part ("1.2") throw a SyntaxError

Files you will most likely change: src/semver.ts, test/semver.test.ts

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

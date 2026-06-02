---
name: tsc-vs-vitest
description: Vitest (esbuild) strips types and passes type-broken tests; always run tsc --noEmit separately as the typecheck sensor
metadata:
  type: feedback
---

Vitest runs un-typechecked: esbuild strips TS types, so a test file with a type error (wrong arg count, no-overlap comparison) PASSES vitest while `tsc --noEmit` (the real typecheck sensor) goes red.

**Why:** S27 lib/ideas.test.ts called `hasMirror(idea)` but the fn is `hasMirror()` (0 args) — vitest 8/8 green, tsc TS2554. The executor's "vitest 8/8" report hid a typecheck break. Same run surfaced a pre-existing S25 semantic-merge.test.ts TS2367 (no-overlap comparison) that had been red unnoticed.

**How to apply:** Never trust "vitest passed" as the front typecheck signal. Run `cd front/web && npx tsc --noEmit` as a separate sensor on EVERY front-touching step. tsc is project-wide, so it also catches prior-green regressions (S25 file). Fix in-test type errors directly (drop the extra arg; `(x as string)` for intentional dead-branch comparisons), then re-biome (format) + re-vitest. Related: [[i18n-keys-missing]] — another "tests pass but a sensor is red" blind spot.

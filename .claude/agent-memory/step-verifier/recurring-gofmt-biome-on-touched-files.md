---
name: recurring-gofmt-biome-on-touched-files
description: Recurring step-executor scar — go test/vet pass but gofmt -l flags touched .go; biome flags unused imports + noNonNullAssertion in test twins. Always run formatters before verdict.
metadata:
  type: feedback
---

ALWAYS run `gofmt -l <touched .go dirs>` and `biome check <touched front files>` before issuing a verdict — even when go test/vet and vitest/tsc are all green.

**Why:** go test and go vet do NOT run gofmt, so executor-produced .go files repeatedly ship with mis-aligned struct-literal fields or over-indented doc-comment bullets (S74 relemit.go, S78 regen_fixture_test.go). Separately, biome flags two recurring classes in TS test twins: (a) `import { x }` where x is never used = dead binding (S76 lib/behavior-expander, S78 app-regenerator.test `Schema`); (b) `.plan!` / `.x!` noNonNullAssertion — the established clean twins (relation-emitter, entity-modeler) carry ZERO of these, so match that posture with `.x?.`. Note `biome ci` exits 0 on warnings (not strictly CI-blocking), but cleaning to repo posture is the right call.

**How to apply:** at every step verification, after the green test run, run `gofmt -l` on the step's Go dirs and `biome check` on the step's front files; fix any output with `gofmt -w` / targeted edits, then re-run the affected test once. These are cheap deterministic fixes the verifier applies directly (never a residual issue, never a bounce-back). See [[project-s78-app-regenerator]], [[project-s74-relation-emitter]], [[project-s76-behavior-expander]].

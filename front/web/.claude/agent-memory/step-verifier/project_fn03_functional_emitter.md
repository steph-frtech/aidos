---
name: fn03-functional-emitter
description: FN03 reforms the AIDOS emitter (emit.go) to pure-functional + a purity property mirror; output bytes unchanged so S34 parity preserved.
metadata:
  type: project
---

FN03 = the functional reform of the emitter itself (back/runtime/generators/emit.go), executing the FN02 mandate (ADR 0036) on the emitter source.

What it does:
- Removes the package-level `var typeMap` global → pure `typeBindings()` constructor returned by value, threaded explicitly into renderGoSqlc/renderPgDDL/renderTSTypes; `knownType()` for membership; `mapFields()` (higher-order map) replaces strings.Builder mutation.
- **Output bytes UNCHANGED** — every S34 parity test (fixture/materialized/roundtrip/determinism) stays green. This is the load-bearing claim: the reform is byte-neutral.
- Purity mirror `emitters_purity_property_test.go` (rapid): P1 ReEmissionByteIdentical (16 rounds + input-purity), P2/P3 NoGlobalMutableVar (parse emitted Go AST, fail-closed), P4 TestEmitterRendererHoldsNoMutableBindingTable (RED-first — detects `var typeMap` in emit.go), ProjectByteIdentical.
- Front twin lib/emitters.ts gains `proveEmittedPurity(s,t,rounds=16)`; /emitters panel gains "Prouver la pureté" button per card (data-testid prove-purity-<target>, verdict data-pure); e2e tests/e2e/emitters.spec.ts 4/4.

Verification gotchas:
- P4 RED-first is genuine: injecting `var typeMap = ...` into emit.go makes it FAIL (verified by injection+restore). It is fail-closed AST walk, not LLM.
- TS twin's TYPE_MAP is a module `const` (immutable) — fine, NOT a determinism gap (the mandate forbids mutable module var).
- targetOrder in generators.go IS a package var but out of FN03's scope (ADR 0036 §3 binds back/gen/ + emit.go's binding table only) — not a violation.
- linear-server MCP unauthenticated in isolated session → OQ-FN03-linear, OpenQuestion not blocker.
- Run Go from back/ root; run generator tests with `-count=1` (14s; includes S34 parity). e2e from repo root /data/dev/aidos.

Verified-green.

---
name: operation-fixture-verification
description: How to verify the S10 Operation DSL interpreter — the N2 fixture mirror, authorize-before-mutate, cross-plane Go↔TS parity.
metadata:
  type: project
---

The Operation DSL (S10, `back/kernel/operation/`) is the N2 Workflow executor — its mirror is a **fixture** (`state → command → events`), NOT Gherkin/rapid. A forced journey/property here would be a double-typed monster (see [[kernel-dsl-mirror-nature]]).

**Why:** an operation's nature is workflow; the fixture IS the truth form. The createOrder anchor (KRD §93) is the canonical case.

**How to verify (the load-bearing checks):**
- `go test ./kernel/...` — operation 7/7 + prior green (expr/policy/records) intact.
- The two fixture rows: `createOrder/happy` (events `[OrderCreated, CartCleared]`, status pending, total 15, authorize-index < mutate-index) and `createOrder/authz-denied` (ErrAuthorizationDenied, events `[]`, Mutator never called). The denied case is the red guard proving the pipeline order is real.
- authorize delegates to Policy via the injected `Authorizer` seam (mocked at S10; real `policy.Eval` is a later tooth — documented OQ, not a residual).
- Cross-plane parity: the Go mutate computes total by summing `data["items"]` float64 prices; `front/web/lib/operation.ts` `run()` mirrors it. Verify front Vitest `lib/operation.test.ts` (6/6) and Go fixture agree on the same trace (events/status/total/authorize-before-mutate).
- The interpreter must be pure (no clock/RNG/IO); side effects only through the 4 Deps seams (Validator/Authorizer/Reader/Mutator).
- branch verb is in the closed grammar + table but unexercised by the anchor — minimal/honest evaluator is correct (no invented semantics), not a gap.

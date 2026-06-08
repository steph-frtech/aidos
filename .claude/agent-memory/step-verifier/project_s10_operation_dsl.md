---
name: s10-operation-dsl
description: S10 Operation DSL interpreter (§24.3/§93) — N2 workflow executor verification record
metadata:
  type: project
---

S10 Operation DSL §24.3/§93 = N2 (Workflow) executor state→command→events. Verified green ZERO corrections.

**Go** back/kernel/operation: PURE table-driven Interpret(op,state,deps)→([]events,Result,err) walking ordered Steps; sealed Step iface 6 verbs validate/authorize/read/mutate/branch/return (closed grammar, IsStepKind closed-set), stepTable init() dispatch (evalBranch self-ref via dispatch→avoids init-cycle), explicit default→ErrUnknownStepKind typed-failure never-silent-skip. State $-rooted bag ($.input/$.auth/named slots), Resolve REUSES expr/policy selector .length ADR0007. 4 seams Deps=Validator/Authorizer/Reader/Mutator (mocked S10, real policy.Eval/Expr sum/sqlc = later teeth same iface). CreateOrder() VERBATIM §93 anchor (no invented step/event/total/status). authorize→evalAuthorize→deps.Authorize seam = Policy DSL delegation (done-crit 3). Short-circuit: authz DENY returns events-so-far(empty)+ErrAuthorizationDenied, mutate never reached.

**Tests** 7 GREEN go test 0.002s: TestCreateOrderHappy (authorize-idx<mutate-idx, events==[OrderCreated,CartCleared], status pending, total 15), TestCreateOrderAuthzDenied (ErrAuthorizationDenied, events==[], mutate never called), DispatchUnknownStepKind/InterpretUnknownShortCircuits/StepKindsClosedSet/StateResolveAndBind/ReturnOnUnboundSlot. gofmt/vet clean. Fixture materialized tests/kernel/createOrder_op.fixture.md (Postgres mirrors=S06 OQ).

**Front** lib/operation.ts byte-faithful TS twin (STEP_KINDS canonical order, CREATE_ORDER verbatim, pure run() interpreter mirror), vitest 6/6, /operation READ-ONLY (truth via ChangeSet → ui-completeness VACUOUS correct, no headless cap), themed+bilingual. e2e 6/6 live :3000 (pipeline order, OrderCreated→CartCleared trace, PASS badge, return pending/15, six verbs). tsc rc=0 biome clean. i18n 3441==3441 operation 24==24. nav WorkbenchHeader:78.

**Docs** concept+internals 3 layers (Implémentation/Méta/Méta-méta), docs.json:87-88, mint validate PASS, committed 6f58ac6 (ancestor of clean HEAD==origin d5c9a0b).

WALL grep clean (no INSERT/UPDATE/DELETE in page/lib). branch verb in table but unexercised (no fixture needs it — honest, no invented semantics). OQ: real-policy-wiring(later)/Postgres-mirrors=S06/Hono-emitter=later/Linear-unauth — all by-design. verified-green ZERO corrections.

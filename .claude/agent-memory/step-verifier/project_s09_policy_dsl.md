---
name: s09-policy-dsl
description: S09 Policy DSL verification — ALLOW/DENY rule tree over Expr selectors, rapid property mirror (DENY-precedence + totality), content-addressed kernel.policy table
metadata:
  type: project
---

S09 = the Policy DSL (KRD §24.4, §93): authorization-as-artifact. Verified GREEN, zero corrections.

**Done-criteria met:** a ∀ ALLOW/DENY rule tree evaluates deterministically over Expr-style $-rooted selectors; rapid property mirror proves DENY-precedence + totality.

- Go pkg `back/kernel/policy`: sealed Rule sum type 8 kinds (combinators all/any/not + comparison leaves eq/gt/lt + predicates exists/matches) over Operand (selector|literal); closed Scope set {RESOURCE,OPERATION,ENTITY,FIELD}; Effect {ALLOW,DENY}. Pure TOTAL `Eval(p,ctx)` via effect-gate: ALLOW-gate→ALLOW iff rule holds else DENY; DENY-gate→DENY iff holds else ALLOW. `Holds` recursive; dangling selector / type mismatch → leaf NOT-hold never errors/panics. resolveSelector REUSES expr's $-rooted dotted-path semantics (.length→len) ADR0007, no new JSON-path engine. Canonicalize = sorted-key JSONB by construction, hash via records.Hash (one address space).
- Mirror = rapid PROPERTY test (N1 ∀ slot, NOT Gherkin — policy nature is invariant; a journey would be double-typed monster). 5 props: CanPlaceOrder_AllowIffConditions (cross-checks Eval vs hand-written oracle conditionsHold, both directions of §93 biconditional), CombinationLaw_AnyFailBlocks (any DENY⇒DENY, all-ALLOW⇒ALLOW over arbitrary trees), NotInvolution, Eval_Total (never panics/errors over generated ctx), ContentAddressed (id==version==Hash, byte-change⇒new id). + TestPolicyFixtures 4/4 (1 ALLOW + 3 DENY). canPlaceOrder = KRD §93 VERBATIM, no invented scope/comparator/field.
- Migration `kernel_policy_baseline.sql`: content-addr kernel.policy (PK id, CHECK version=id, body JSONB, superseded_by append-only head). Wall: aidos_agent GRANT SELECT only + REVOKE INSERT/UPDATE/DELETE/TRUNCATE; aidos writer SELECT/INSERT/UPDATE no-DELETE. Testcontainers pg16 3 tests RAN GREEN 7.1s (RoundTripsAsJSONB + RejectsNonContentAddressed CHECK + AgentRoleIsSelectOnly permission-denied INSERT/UPDATE/DELETE = in-DB wall).
- go vet clean, gofmt clean, go test 7.1s GREEN.
- Front `lib/policy.ts` BYTE-FAITHFUL TS twin (pure evaluate/holds/canonicalize, static registry, determinism-first). Cross-checked: Go canon == TS canon == content-addr `e2fbac3f8a7e58ca3ad82348fd2ca7030026cdc69d0b5d635e598c332de1379e` for canPlaceOrder. vitest 12/12, tsc clean, biome clean.
- `/policy` page: READ-ONLY projection (rule tree + 3 named leaves + scopes + 8 kinds + try-a-context ALLOW/DENY samples + content-addr id + authority badge). ui-completeness VACUOUS (Policy=truth written only via aidos CLI ChangeSet, no headless capability — correct per wall, like S08 expr/S04 wall). WALL grep clean: only `.update(canonicalize())` = crypto hashing not truth-write. Nav entry WorkbenchHeader:77 `/policy`. e2e policy.spec.ts 7 specs.
- i18n 3441==3441 parity, policy 25==25 keys both (report said "~45/48" — loose count, but parity holds zero orphans).
- Docs concept+internals 3 layers (Implémentation/Méta/Méta-méta), docs.json:85-86, mint validate PASSED, committed 4afa2fb pushed (docs repo HEAD d5c9a0b == origin/main clean).

**OQ (by-design forward-deps, NOT residual):** policy not yet wired into Operation DSL authorize step = S10; no codegen/sqlc emitters; live kernel.policy SELECT wiring = later tooth (seeded anchor+samples render meanwhile); Linear MCP unauthenticated (cannot flip S09 issue to Done).

verified-green ZERO corrections.

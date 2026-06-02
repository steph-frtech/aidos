---
name: s08-expr
description: S08 Expr DSL — typed JSON AST (lit/ref/call/obj/arr) + pure evaluator + closed catalogue; read-only /expr is correct (truth-write via CLI/ChangeSet); verified-green
metadata:
  type: project
---

S08 lands the Expr DSL (KRD §24.5): a typed JSON AST with five kinds (lit/ref/call/obj/arr), a CLOSED function catalogue (lowercase/concat/now/uuid/randomToken + >/&&/!/length), $-rooted refs, and a pure Go evaluator. `back/kernel/expr/` — expr.go (AST), parse.go (Parse+Canonicalize, content-address), eval.go (pure Eval, injected Providers for now/uuid/randomToken), catalogue.go (closed allow-list). Migration `kernel_expr_baseline.sql`: kernel.expr table, CHECK(version=id) content-address, agent role SELECT-only.

**Why read-only /expr is correct (not a ui-completeness gap):** an Expr AST is *truth* — it's written only by the aidos CLI via approved ChangeSet, never from a screen (the wall). So the panel projects/visualizes; ui-completeness is vacuous here (same pattern as S03 CLI, S04 wall, S07 sensors). Do NOT flag the read-only panel as a headless-capability gap.

**Done-criteria proof:** fixture mirror (5 cases, materialized tests/kernel/expr_eval.fixture.md + TestExprFixtures) + 5 rapid properties (RoundTrip identity, EvalDeterministic, ClosedCatalogue, UnknownKindRejected, EvalNeverPanics) + 3 Testcontainers (round-trip, content-address-reject, TestAgentRoleIsSelectOnlyOnExpr = the wall). Front: lib/expr.ts pure port + Vitest 12/12; Playwright 6/6 on :3100.

Determinism-first satisfied: Parse/Canonicalize/Eval pure (no LLM), Eval has a recover→typed-error guard so the no-panic invariant holds; reproducibility mirrors on both planes (rapid + Vitest).

Forward-deps = OpenQuestions, NOT residual: mirrors-schema persistence back-filled at S06; visible_when/enabled_when control wiring at S11; Expr→TS codegen + evaluator MCP later. See [[project_determinism_repro_mirror]], [[project_playwright_port_targeting]].

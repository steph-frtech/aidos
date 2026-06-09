---
name: fk01-truth-level
description: FK01 (FKE-track first step, after S117) — 7 KRD truth levels stored + parity mirror; verification notes
metadata:
  type: project
---

FK01 — `truth_level` stocké + miroir de parité. First step of the **FKE piste** (BUILDER_PLAN.md:464/468, runs after app-builder S117). Spec: ROADMAP-fke FK01, KRD FKE-5/§5.

**What it ships (PURE, write-NOTHING wall-respecting):**
- `back/kernel/truthlevel/truthlevel.go` — 7 ordered levels Raw(1)→Reconciled(7) (LevelUnknown=0 zero-value, never returned by Compute except all-false). `Compute(Signals)→Level` PURE TOTAL transition reads HIGHEST satisfied provenance door (raw/idea/proposal/accepted/projection/observation/reconciled), top-down switch so partial/over-filled still resolves to one rung — SOLE legal writer of truth_level, never hand-posed (determinism-first §6/§8). `CheckParity(stored,signals)` parity mirror: aligned iff stored==Compute, divergence=ErrParityDivergence RED. Stored level = CACHE PROVEN BY COMPUTATION, not a 2nd source.
- Migration `kernel_truth_level_baseline.sql` ADDITIVE expand-only: NULLable truth_level col + CHECK pinning 7 FKE-5 names on BOTH kernel.truth AND mirrors.mirror (both exist in S02 kernel_records_baseline). No GRANT change (wall). Out-of-enum → DB CHECK error.

**4 done-criteria ALL PROVEN (ran):**
1. property stored==computed (parity mirror, divergence RED) — rapid TestParity + fast-check twin.
2. transition = pure total fn — rapid TestCompute_TotalDeterministic (same input→same output, never panics, in-enum).
3. SemanticDiff `add` — migration_roundtrip_test TestSemanticDiffIsAdd (truth_level coord in free space, old absent → semanticdiff.ChangeAdd; level value = Compute output not hand-posed).
4. panel filtre par niveau — /truth-level filter-select control + Playwright (all→7/7, single level→that level only).

**Verification result: PASSED, ZERO corrections.**
- gofmt -l CLEAN (no scar this time), go vet clean, go build ./... exit0, broad build prior-green intact.
- Property ROBUST -rapid.checks=3000 0.047s (not flaky). Test forms all present: property + fixture (truthlevel_fixture_test.go) + integration (migration_roundtrip Testcontainers 4 cases real Postgres 16-alpine, ran green ~5-7s each).
- WALL grep CLEAN on mcp/truth-level/main.go + front actions.ts (no INSERT/UPDATE/Exec/pgx/GRANT). MCP aidos-truth-level = 3 PURE read-only tools (compute/check_parity/levels), main_test green.
- TS twin lib/truth-level.ts matches Go authoritative (top-down compute, checkParity). vitest 6/6, tsc clean (only PRE-EXISTING behavior-capture err filtered — NOT FK01), biome 5 files clean.
- Panel TruthLevelPanel.tsx useActionState, all e2e testids present (filter-select/submit, ladder-*, results, results-count, record-*, record-level-*, parity-* data-aligned, data-level). i18n fr5040==en5040 EXACT, truthLevel ns 32==32, nav WorkbenchHeader:198. Playwright 4/4 GREEN live :3000.
- Docs 3-layer (Impl/Méta/Méta-méta all present) concept+internals fk01-truth-level.mdx, docs.json:455-456, mint validate PASS, HEAD 4b7997b==origin/main pushed clean.

**OpenQuestions (by-design, NOT residual):**
- OQ-FK01-LINEAR: Linear MCP unauthenticated (only authenticate/complete_authentication exposed) — issue not movable. Recurring across all steps. Record, don't fail.
- OQ-FK01-PERSIST (bootstrap §6): the actual WRITE of truth_level onto a Postgres record flows through the privileged aidos CLI at the legal door (idea→mirror→/goal→ChangeSet); the changeset-apply persist engine is later truth-write plumbing. FK01 delivers the pure transition + additive column + parity mirror = its full contract. Forward-dependency.

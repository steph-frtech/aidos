---
name: project-s51-economics
description: S51 harness economics — pure Evaluate(budget,cost,valueCase)→verdict (KRD §66.3) with advisory HARNESS_COST_EXCEEDS_BUDGET reusing S13 shape; read-only+action-capable /harness-economics; verified-green
metadata:
  type: project
---

S51 = « l'économie du harnais » (KRD §66.3): the more a constraint costs to maintain, the more it must justify its value.

- **Pure core** `back/runtime/economics/economics.go`: `Evaluate(HarnessCostBudget, MeasuredCost, *ValueCase) EconomicsDecision` — pure/total, no time.Now(). Per-axis OR over-budget (equal=within, ADR 0035); over-any-axis + no justified ValueCase ⇒ over_budget_flagged + advisory `HARNESS_COST_EXCEEDS_BUDGET` (S13 BlockReason SHAPE, code owned LOCALLY in pkg — NOT an extension of closed S13 wall enum, because advisory not a wall refusal). justified VC ⇒ over_budget_justified (kept). too_expensive/revisit ⇒ still flagged. SnapshotID reuses S01/S02 Canonicalize+Hash. Closed enums Risk/Decision/Verdict with Validate guards.
- **Mirrors:** fixture (5 tests incl THE done case ci 18>10 no VC), rapid property (determinism+soundness reproducibility mirror), Testcontainers roundtrip (enum CHECKs, wall agent SELECT-only on fitness, append-only writer). `go test ./runtime/economics ok 9.7s`.
- **Migration** `harness_economics_baseline.sql` expand-only: `fitness.harness_cost_budget` DECLARED above the line (agent SELECT-only, aidos writer INSERT+SELECT, REVOKE UPDATE/DELETE; caps non-neg + risk enum CHECKs) + `runtime.harness_economics_snapshot` below waterline (content-addressed, append-only, verdict/risk/decision enum CHECKs). No prior table/GRANT altered.
- **UI** `/harness-economics` read-only diagnostic + action-capable: budget card surfacing 5 caps beside measured cost (over=red), economics table with COMPUTED verdicts, ValueCase card, re-evaluate (below line) + propose→ChangeSet stub (the wall — NO budget-edit/NO delete affordance). TS twin `lib/economics.ts` mirrors Go verdict-for-verdict, pinned by vitest 5/5. e2e 8 tests. nav.economics label in fr+en. 39 i18n keys both locales (checked clean — see [[feedback_i18n_keys_missing]]).
- **Determinism-first:** Evaluate pure, no LLM; reproducibility mirror both planes (rapid + fast-check).

Verified PASS, zero corrections. tsc clean, biome clean, go build ./... clean (prior green intact), mint validate ok, docs pushed (HEAD==origin/main a49d003, three layers present). OpenQuestions (forward-deps, NOT residual): ADR 0035 markdown not written (rule pinned in mirrors+CHECKs); cost meter not built (consumed by design); Stop conjunct deferred; snapshot write path via S20 ChangeSet; Linear MCP unauthenticated. Minor cosmetic: Go field MaxMutationRuntimeSecond singular vs JSON tag plural — serialization consistent (tags match DB cols+TS), not a gap.

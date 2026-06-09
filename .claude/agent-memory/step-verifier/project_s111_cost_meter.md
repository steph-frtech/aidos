---
name: project-s111-cost-meter
description: S111 per-cell COST METER verification — aggregates real AgentRuns into counted MeasuredCost, defers to economics.Evaluate, feeds S83 disjoncteur; verified green zero corrections
metadata:
  type: project
---

§S111/E13 per-cell COST METER PURE COMPOSITION closes gap between S51 (HarnessCostBudget/ValueCase/Evaluate §66.3) and S52 (AgentRun/RunMeter BA11): AGGREGATES many runs per cell into ONE COUNTED MeasuredCost (never estimate), DEFERS to economics.Evaluate (AUTHORITATIVE verdict, adds no judgment of its own — determinism-first), projects over-budget onto DisjoncteurSignal (named S111→S83 wire, Trip==OverBudget(dec)==verdict==over_budget_flagged, identical predicate buildloop.Terminate S83 already used). Writes NOTHING (wall §2).

**Done-crit PROVEN**: property — over-budget flagged ADVISORY never-silent-block + costlier-justify-more (ValueCase{justified} clears flag, else flagged). Both Go rapid + TS fast-check pin it. Fixture 3 (within 38000/6, over_budget_flagged HARNESS_COST_EXCEEDS_BUDGET over_axes∋llm_tokens disjoncteur-trips THE done case, over_budget_justified no-block no-trip). Rapid 6 props (determinism/counted-never-estimated exact-arithmetic-sum/order-independence/verdict-always-closed-over-flagged-unless-justified/justified-clears-flag/disjoncteur-wire).

**Reused-symbols verified-exist**: economics.Evaluate:228 VerdictWithinBudget:111 VerdictOverBudgetFlagged:118 VerdictOverBudgetJustified:115 CodeHarnessCostExceedsBudget:56 OverAxes:165 MeasuredCost(MutationRuntimeSecond/HumanReviewMinutes stay-zero never-fabricated); agentimpl.RunMeter(Tokens/Turns/CIMinutes/WallClockSecs budget.go:61); agentrun.Record:177 ResultGreen:28. nonNeg clamp mirrors BA11. Only llm_tokens+ci_minutes mapped (BA27 discipline), mutation/human-review zero (agent-run doesn't produce them = monster to fabricate).

**Sensors**: go test costmeter+mcp green 0.030s; PROPERTY ROBUST under -count=3 -rapid.checks=3000 (2.068s, NOT flaky-passing — my recurring scar, ran elevated); broad go build ./... exit0; prior-green economics/agentrun/agentimpl intact; gofmt -l CLEAN; go vet CLEAN; wall-grep CLEAN (no INSERT/UPDATE/Exec/ToKernel/kernel./mirrors./fitness-write). MCP aidos-cost-meter 3 PURE read-only tools (cost_meter_cell/cost_disjoncteur_signal/cost_validate_budget) main_test 6 green, toRunCosts uses FIXED timestamps (no arg-less clock §6).

**Front**: TS twin lib/cost-meter.ts reuses lib/economics evaluate, display-only Go-authoritative, vitest 12/12; tsc clean for cost-meter; biome 6 files CLEAN. /cost-meter action-capable useActionState 2 controls (meter-submit heavy+valuecase toggles / disjoncteur-submit) Server Actions run PURE twin writesTruth=false. All e2e testids present. verdict labels map DANS LE BUDGET/SIGNALÉ/JUSTIFIÉ, trip DÉCLENCHÉ/non déclenché matching e2e regexes. nav:179 costMeter. i18n fr4902==en4902 EXACT, costMeter ns 31==31. Playwright 4/4 RAN live:3000 route-200.

**Docs**: 3-layer internals (Implémentation:9/Méta:38/Méta-méta:46) docs.json:289-290 mint validate PASS; HEAD c6ace46==origin/main pushed.

**OQ by-design**: Linear-server MCP unauthenticated (only authenticate tools surfaced, can't move step issue — needs OAuth+restart); mintlify reindex async-lag (pushed+validated, index eventual).

**VERDICT: verified-green ZERO corrections.** Clean composition step, executor honest about Linear/reindex OQs. No determinism gap (whole capability pure counting/arithmetic, economics.Evaluate single judge, no LLM).

---
name: ba27-economicsloop
description: BA27 wires live RunMeter + PRE-CALL halt into Drive (gap G3) and feeds terminated run cost to economics.Evaluate (S51); verified-green pattern
metadata:
  type: project
---

BA27 — live meter + halt-on-budget in the loop + economics feed. Verified GREEN.

- `DriveWithEconomics(in) → (AgentRun, RunMeter, error)`: PRE-CALL halt — each turn's cost is PROJECTED onto the meter (`meter.Tally`) and `CheckBudget` runs BEFORE the turn executes; a breaching turn is refused before it starts (cost never lands, effect never fires) → meter never crosses the effective cap (min S29/S51 = `EffectiveTokensCap`, BA11 authoritative). `Drive()` now delegates; `FinalMeter` re-drives (one authoritative meter, no replay drift).
- `MeasuredCostOf(meter)` maps Tokens→LLMTokens, CIMinutes→CIMinutes only; mutation/human-review axes stay 0 (an agent run produces neither — fabricating = monster). `EvaluateRun(meter,budget,vc)` defers to `economics.Evaluate` (S51 authoritative, read-only diagnostic, no truth-write).
- NOTE: economics.MeasuredCost field is `MutationRuntimeSecond` (not `MutationRuntime` as report prose said) — report prose was loose, code correct.
- over_budget_flagged is demonstrated by evaluating a COMPLETED run against the CELL's separately-declared TIGHTER HarnessCostBudget (5 tok) — distinct from the loop's anti-runaway cap. Coherent, documented in fixtures + internals page.
- Mirrors: economics_loop_fixture_test.go (4) + economics_loop_property_test.go (5 rapid: never-cross-cap, abandoned-iff-halt, reproducible, pure cost map). TS twin lib/agentrun.ts (driveWithEconomics/measuredCostOf/evaluateRun) + agentloop-economics.test.ts (8 vitest). All green fresh.
- UI: /agents « economics-loop » subsection, tight/loose cap radios + Drive control computing (run,meter) below the line then evaluateRun; testids economics-loop/-cap-tight/-cap-loose/-drive/-result/-meter(data-tokens)/-verdict(data-verdict). 16 i18n keys all present fr+en+page.tsx. e2e 3/3 live on :3000 (stale-server check passed: markup served).
- Wall: agentloop/mcp have NO INSERT/UPDATE/DELETE/Exec; all below-line telemetry. git status shows kernel/hooks files modified but those are PRIOR BA steps in this worktree, NOT in BA27 files_changed — BA27 confined to runtime/agentloop + mcp/agentloop + front + docs.
- Docs: concept + internals (3 layers) pages, registered in docs.json (2 hits), mint validate clean, commit 221e0c0 on origin/main.
- Linear MCP unauthenticated (OAuth) — OQ, non-blocking per §11.

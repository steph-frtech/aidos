---
name: ba11-budgetgate
description: BA11 RunMeter monotone tally + CheckBudget pure gate; effective tokens cap = min(S29.Budgets, S51.HarnessCostBudget), tightest wins fail-closed; verified-green
metadata:
  type: project
---

BA11 = the per-run COST COUNTER + BUDGET GATE of a governed build-agent (back/runtime/agentimpl/budget.go). RunMeter = monotone value-semantics tally (Tally clamps negatives via nonNeg, returns new meter, pure fold) over tokens/turns/ci-minutes/wall-clock. CostAware = tokens × declared rate (monotone in tokens, rate is data never invented). CheckBudget = pure total per-axis gate, fixed precedence tokens→turns→ci_minutes→wall_clock so BreachedAxis is deterministic; inclusive ceiling (cost==cap is within, cap+1 breaches).

**The G1 reconciliation (core done-criterion):** tokens is declared TWICE — goal.Budgets.Tokens (S29) ∧ economics.HarnessCostBudget.MaxLLMTokensPerGoal (S51). EffectiveTokensCap = min(the two), EXPORTED, authoritative (§8). Single-source axes: turns from S29, ci-minutes from S51.MaxCIMinutes, wall-clock from S29.TimeSeconds. Verified the dep fields exist live: goal.Budgets{TimeSeconds,Turns,Tokens}; economics.HarnessCostBudget{CellRef,MaxCIMinutes,MaxLLMTokensPerGoal,ExpectedRiskReduction}. New S13 code CodeAgentBudgetExceeded="AGENT_BUDGET_EXCEEDED" registered (decl + reasons map + codeOrder), how_to_fix names tightest-cap-wins + /goal door.

Mirror = budget_property_test.go (rapid, 8 named props: monotone, determinism, min-is-authoritative+boundary, fail-closed any-axis, cost-aware, wall-clock-deadline-at-zero-tokens, blockreason-shape, equal-caps). TS twin in lib/agentlayer.ts (tally/costAware/effectiveTokensCap/checkBudget, Math.min, verbatim precedence + AGENT_BUDGET_EXCEEDED_REASON) + Vitest mirror with REAL semantic props (not count) 73/73. Wall held vacuously (pure below-line, no DB/clock/rng/I/O/LLM). Determinism-first respected: pure gate, min() authoritative, no agent inference.

Action-capable /agents budget-gate: effcap shows min(1000,800)=800, fault select within/exceeded, run button executes checkBudget at boundary; e2e asserts BlockReason CODE (semantic). SCAR handled correctly: shared impl-viewer button-count bumped 4→5 (see [[project_ba10_mandatoryhook]]).

Verified-green 2026-06-03: gofmt clean, go vet clean, go test agentimpl+blockreason ok, go build ./... exit 0, tsc exit 0, vitest 73/73, all 11 budgetGate i18n keys in BOTH fr+en, Playwright agents.spec 40/40 on live :3000 (served BA11 markup). Docs HEAD 41494ac == origin/main, mint validate passed, 2 docs.json refs, 3 internals layers. Linear MCP unauth (only authenticate surfaced) = OQ §11. Forward-deps (OQ, non-blocking): RunMeter live-loop wiring (accumulate/streaming-hardstop/pre-call) = BA27; tokens-axis dedup to one owner = suggested SemanticDiff. agentlayer.ts is `file: data` encoding — use grep -a (see [[project_ba07_capacityaxis]]).

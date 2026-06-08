---
name: project-s83-build-loop
description: S83 build-loop service (executing agent of app-builder) + deterministic circuit breaker BUILD_LOOP_NO_PROGRESS — verifier notes
metadata:
  type: project
---

S83 = Runtime build-loop service (back/runtime/buildloop) + deterministic circuit breaker. The executing agent of the app-builder: red set → ContextRouter Compile (S33 algo) → LLM Generate (gated exception, isolated to ONE port) → wall-stamped sandbox write (S82, below waterline) → Sensors.Run (deterministic judge) → iterate → record AgentRun (S52) → Terminate.

THREE done-criteria mirrors ALL PASS (I ran them by name):
- TestLoopGreenOnlyWhenNonGameableStopPasses (fixture/Godog): green ONLY when goal.IsClosed (red→green ∧ prior intact ∧ mut≥floor ∧ no monster); 5 sub-cases.
- TestAgentWritesNothingAboveTheWaterline (property): ∀ spec ∀ target, above-waterline write → Autorisee=false + AGENT_WRITE_ABOVE_WATERLINE, sandbox NEVER applied.
- TestTerminationIsPureFunctionOfHistory (property): same input → byte-identical Decision.

Terminate is PURE/TOTAL: green-first (goal.IsClosed REUSED verbatim, no re-impl) → else breaker (NoProgress OR economics.Evaluate==VerdictOverBudgetFlagged) → else continue. NoProgress 4 signals: max-iterations cap / zero-newly-green over StagnationWindow / repeated diff-hash / red↔green oscillation. No confidence field (anti-gameable). Wired to economics.HarnessCostBudget (S51); justified ValueCase clears budget flag (DecisionJustified → VerdictOverBudgetJustified → not flagged → continue). CROSS-CHECK: Go economics.Evaluate (justified→OverBudgetJustified not Flagged) and TS twin (`axes.length>0 && !valueCaseJustified`) AGREE; axis order ci_minutes,llm_tokens identical.

External symbols all verified present: blockreason.CodeBuildLoopNoProgress (:325 + entry :827 + non-empty how_to_fix), CodeAgentWriteAboveWaterline, economics.Evaluate/VerdictOverBudgetFlagged/OverAxes, agentrun.ApplyWall/Record, goal.IsClosed (runtime/goal/goal.go:285). go test buildloop+mcp ok, vet/gofmt clean, go build ./... clean.

MCP back/mcp/build-loop: 3 PURE tools (terminate/no_progress/verdicts), NO SQL, writes NOTHING (returns values). actions.ts evaluateTerminationAction = pure compute, writes nothing (truth via propose→ChangeSet S85). lib/build-loop.ts byte-twin (isClosed/noProgress/terminate/overBudgetAxes). vitest 5/5, tsc/biome clean on build-loop files.

Front: panel useActionState bound to evaluateTerminationAction (action-capable, ui-complete), form+submit testids, all 13 e2e spec testids exist in panel. nav:144 build-loop registered. i18n 4107==4107, buildLoop 41==41 parity, 0 fr-only/en-only.

Docs: concept+internals (3 layers Implémentation/Méta/Méta-méta present), docs.json:235-236, mint validate PASS, pushed 0e0a37e HEAD==origin/main.

WALL grep CLEAN (no kernel/mirrors/fitness write in buildloop/mcp/actions).

OQ by-design forward-deps (NON-blocking): real ContextRouter(S33)/LLM/sandbox(S82)/sensors injected as ports tested with scripted fakes; AgentRun persistence rides S52 below-line grant; truth-write via propose→ChangeSet S85; Linear MCP unauth (could not flip S83 to Done).

VERDICT: verified-green ZERO corrections.

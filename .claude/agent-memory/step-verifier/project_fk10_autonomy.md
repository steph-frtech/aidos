---
name: fk10-autonomy
description: §FK10 (after FK09) autonomy_level A0..A8 = 6th declared axis of agent layer — fail-closed Enforce + PromotionFromHistory pure
metadata:
  type: project
---

§FK10 (ROADMAP-fke FKE-11/34, after FK09) `autonomy_level ∈ {A0..A8}` CLOSED DECLARED 6th axis of CoucheAgent (back/kernel/autonomy) PURE write-NOTHING.

Level=int A0=0..A8=8 directly ordered (required≤declared = numeric compare) but closed-set re-asserted IsKnownLevel [0,8] fail-closed; levelOrder declared canonical A0→A8 (no map iter); String "A<n>" else "A?"; CriticalCeiling=A7 const.

THREE pure/total functions no clock/rng/I/O/LLM:
- Validate(declared) refuses out-of-ladder ErrUnknownLevel.
- Enforce(declared, action Action{Name,Required Level,Critical bool})→Decision{Allowed,*BlockReason}: refuse if either out-of-ladder; A8-never-on-critical encoded STRUCTURALLY — if Critical && Required>A7 refuse AND effectiveDeclared capped at A7 (even declared-A8 held to A7 ceiling on critical); else required>effectiveDeclared → refuse. Every refusal carries NEW BlockReason AGENT_AUTONOMY_EXCEEDED.
- PromotionFromHistory(current, []RunOutcome oldest→newest, PromotionPolicy{MinGreenRuns,MinEvidence})→Level: invalid-or-≥A8 → current UNCHANGED; n<1 clamped to 1 (fail-closed, non-positive bar would promote on empty); len(history)<n → current; window=last-n, any !Green||Evidence<MinEvidence||Incident → current; else current+1 (never past A8). DefaultPolicy={3, E4}. RunOutcome derived via OutcomeOf(agentrun.AgentRun, evidence, incident) — Green from run.Result==ResultGreen, evidence+incident supplied alongside.

NEW BlockReason CodeAgentAutonomyExceeded="AGENT_AUTONOMY_EXCEEDED" registered: const + reasons map (3 non-empty how_to_fix: stay_within/earn_promotion/freeze_via_goal) + codeOrder (last entry) — additive 'refine' extension of closed enum.

DONE-CRIT BOTH PROVEN: (1) fixture autonomy_fixture_test.go TestFixture_A1AttemptsMerge_Refused — A1→merge(A6,critical) refused AGENT_AUTONOMY_EXCEEDED + non-empty how_to_fix; +A6Merges/A7Release/A8NeverOnCritical/PromotionEarned(3-clean→A2, incident/below-E4/still-red→withheld A1). (2) property autonomy_property_test.go TestPromotionIsPureFunctionOfHistory (rapid) — window-allClean→current+1 reproducible never-declared; +EnforceFailClosedMonotone(required≤declared ∀ rung pair + determinism)/A8NeverOnCritical/LadderClosed(out-of-range fail-closed)/PromotionNeedsFullWindow(history<window→no promote).

VERIFIED-GREEN ZERO corrections: gofmt CLEAN (exit0), go test kernel/autonomy+mcp/autonomy+runtime/blockreason ok, vet clean, broad build exit0, PROPERTY ROBUST -count=2 -rapid.checks=3000 0.056s. WALL grep CLEAN on autonomy.go AND mcp/autonomy/main.go (no INSERT/UPDATE/pgx/Exec/LLM/clock/rng). deps verified exist: prooftype.ELevel/E3/E4/E5, agentrun.Record/ResultGreen/ResultStillRed.

MCP aidos-autonomy (back/mcp/autonomy) write-nothing 2 tools enforce+promote, main_test green. TS twin front/web/lib/autonomy.ts Go-authoritative (enforce/promotionFromHistory/isKnownLevel/levelLabel/DEFAULT_POLICY) vitest 5/5; NOTE benign divergence: promotionFromHistory on invalid current returns 0 (TS can't return non-Level) vs Go returns current — non-blocking, panel feeds only valid levels. tsc clean (only PRE-EXISTING behavior-capture:101 'Kind' S64-S77 filtered). biome 5 files clean.

/autonomy action-capable AutonomyPanel useState write-NOTHING (pure projection, wall correct): TWO controls ENFORCER(action-select→enforce-submit→decision/decision-badge/block-reason/how-to-fix) + CALCULER LA MONTÉE(history-select→promote-submit→promotion/promoted-level/promotion-verdict) + A0..A8 ladder(9 ladder-rung, A8 amber). page.tsx h1 title "L'autonomie A0-A8" matches e2e regex /l'autonomie a0-a8|autonomy a0-a8/i. i18n fr158==en158 autonomy 23==23 nav autonomyNav both WorkbenchHeader:207. e2e tests/e2e/autonomy.spec.ts 5/5 PASS live 35.1s (projects.project snapshot noise UNRELATED). docs 3-layer Impl/Méta/Méta-méta concept+internals fk10-autonomy.mdx docs.json:473-474 mint validate SUCCESS HEAD d5531d9==origin/main.

OQ by-design: Linear-server MCP unauth (authenticate/complete_authentication only) — FK10 issue not moved; AGENT_AUTONOMY_EXCEEDED materialized in code not yet Postgres-persisted (truth-store written via aidos role, agent no GRANT — bootstrap exception); Mintlify reindex lag. NOTE: executor flagged the step INPUT paragraph was mis-pasted from FK09 (described conscience aggregator); executor correctly implemented the ACTUAL FK10 (autonomy A0..A8) per ROADMAP-fke §FK10 + done-criteria header. Verified the done-criteria match autonomy not conscience — correct call, no conscience files touched.

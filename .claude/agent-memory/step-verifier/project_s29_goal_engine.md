---
name: s29-goal-engine
description: S29 goal engine — /goal idea→DRAFT ChangeSet+red set + non-gameable Stop:goal-check hook half; verified green
metadata:
  type: project
---

S29 = the GOAL ENGINE (KRD §56-§59, §63 ①). The door idea→mirror→/goal.

**What it is:** `back/runtime/goal/goal.go` — PURE OpenGoal (idea→DRAFT ChangeSet via S20 Open + derived red set via S22 redwave.Impact; rejects IDEA_WITHOUT_MIRROR when MirrorDelta==nil, NO_RED_SET when wave empty) + PURE IsClosed non-gameable stop = `red set→green ∧ prior intact ∧ mutation≥floor ∧ no monster`, takes NO agent-confidence input (StopInput has DELIBERATELY no confidence field — agent never grades its own copy). id=records.Hash(canonicalBody) EXCLUDES Status (OPEN→CLOSED advances without changing id, mirrors ChangeSet stamp/id split). REUSES S02 hash/S20 changeset.Open/S22 Impact/S13 blockreason — never forks.

**The work this pass (the only edits):** the mandated Stop:goal-check hook HALF was a scaffold (doc.go "inert until S29"). Executor wired it ADDITIVELY: `back/hooks/stop/goalcheck.go` (GoalCheckSource seam + NoGoalSource no-op fallback + CheckGoal reusing goal.CloseBlockReason, fail-closed on Load err = anti-passthrough §82) composed into Run FIRST (`goal-check && completeness-check` via package-level `goalSource` var defaulting NoGoalSource so prior completeness tests stay green — never REMOVED a guardrail §5). + goalcheck_fault_injection_test.go 6 scenarios.

**DONE-CRIT all met:** TestOpeningAGoalCreatesADraftChangeSetAndNonEmptyRedSet (fixture) + non-gameable proven by goalcheck fault-injection (4 faults all BLOCK GOAL_STILL_RED exit2: still-red mirror / broken-prior / mutation<floor / monster; closeable PASSES exit0; no-open-goal no-op) + rapid props (IsClosedDeterministic/AnyFaultMeansNotClosed/ClosedImpliesAllFourHold/NeverPanic).

**Verified green ZERO corrections:** go build clean; go test -count=1 ./runtime/goal ok 0.012s + ./hooks/stop ok 14.4s (incl Testcontainers completeness + 6 goal fault-inj all PASS verbose); vet+gofmt clean. Migration ideas_goal_baseline.sql expand-only ideas.goal (status CHECK OPEN|CLOSED + closed_at-consistency CHECK) agent SELECT-only REVOKE writes + re-asserts kernel/mirrors REVOKE = wall. Front lib/goal.ts+goal-data.ts+goal-stream.ts READ-ONLY (no INSERT/propose/kernel write — promotion via propose→ChangeSet→approval not screen write, ui-completeness correct for promotion door) vitest 16/16 biome clean tsc clean. e2e goal.spec.ts 4/4 live :3000 5.4s. i18n 3441==3441 goal 32==32. docs concept+internals 3 layers docs.json:127-128 mint validate PASS committed b7480ef pushed origin/main 0-ahead. doc.go correctly marks goal-check ACTIVE at S29.

**OQ (by-design forward-deps, NOT residual):** production GoalCheckSource (live ideas.goal + sensor/mutation/monster SELECT-only read) seamed but binary defaults NoGoalSource until DB source wired; DRAFT→APPLIED commit-gate stays S20; red-set from S22; no MCP (pure lib + harness gesture); no /evolve middle loop §63②; Linear unauth (OAuth+restart per linear-tracker memory). All documented, none block S29 own done-criteria.

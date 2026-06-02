---
name: s29-goalengine
description: S29 goal engine — pure OpenGoal/IsClosed non-gameable stop + Stop:goal-check hook; verified-green
metadata:
  type: project
---

S29 = the GOAL engine (KRD §56–§59, §63 ①): the door `idea → mirror → /goal`.

- `back/runtime/goal/goal.go`: pure/total `OpenGoal(OpenInput)→(Goal,*BlockReason)` reuses S20 `changeset.Open` (DRAFT, spec+mirror atomic), S22 `redwave.Impact` for the red set (Edge is a type alias of redwave.Edge, not a fork), S02 `records.Hash/Canonicalize` for id (status excluded from address). `IsClosed(goal,StopInput)→bool` = redSet→green ∧ priorGreen intact ∧ mutation≥floor ∧ no monster; **StopInput has NO confidence field** (the whole point — agent never grades its own copy); missing sensor verdict ⇒ red (anti-passthrough). `CloseBlockReason` ⇒ GOAL_STILL_RED.
- `back/hooks/goal-check/main.go`: SEPARATE Stop binary (sibling of hooks/stop, additive), defers to goal.CloseBlockReason, fail-closed on garbage. Fault-injection main_test 7/7: blocks on surviving red / broken prior / low mutation / monster / missing verdict / garbage.
- Migration `ideas_goal_baseline.sql`: expand-only ideas.goal, red_set inside jsonb body, 3 CHECK (status set, closed_at consistency, body/column agreement), agent SELECT-only + re-asserts REVOKE on kernel/mirrors. Agent literally cannot write CLOSED.
- Front `lib/goal.ts` = declared TWIN (same 4-condition AND, missing→red); GoalPanel action-capable (open-goal/check-stop-red/check-stop-green) computing from the twin; READ-ONLY truth (ui-completeness vacuous on write-path — close stamp is aidos CLI role via S20 commit-gate). vitest 5/5, tsc clean. 32 i18n keys present in BOTH fr/en; nav label under nav.goal.
- e2e tests/e2e/goal.spec.ts 4/4 GREEN on :3000.
- Docs: concept + internals (3 layers) registered (2 refs in docs.json), mint validate passes, pushed to steph-frtech/docs main (b7480ef, local==origin).
- Linear AID-32 Done (runtime+step, AIDOS project).

OpenQuestions (by-design forward deps, NOT residual): /evolve middle loop ② = S42, reality loop ③ = S43; no MCP (pure lib + harness gesture); macro→micro fractal goals §52 deferred. AID offset: AID-32 = S29.

Verified-green: re-read every artifact, re-ran all suites from scratch, prior deps (changeset/redwave/blockreason/records) still green.

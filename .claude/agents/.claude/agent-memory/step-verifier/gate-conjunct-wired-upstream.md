---
name: gate-conjunct-wired-upstream
description: Sensor/gate steps may have their Stop conjunct ALREADY wired upstream (S29 goal.IsClosed); the step only FEEDS it — verify the wiring exists, do not demand a new ChangeSet.
metadata:
  type: project
---

A gate/sensor step's done-criterion "the threshold gates the stable phase" can be met without any new ChangeSet on the Stop hook, because the conjunct may already exist upstream.

**Why:** S40 (mutation sensor) "gates aidos stable" — but the `mutation ≥ floor` conjunct was already pinned at S29 in `back/runtime/goal/goal.go` (`StopInput.Mutation`/`MutationFloor`, condition (3): `if in.Mutation < in.MutationFloor { return false }`). S40's contribution is the *densimètre* that PRODUCES the live score that conjunct consumes. The plan's "wire it in via ChangeSet (else OpenQuestion)" branch correctly resolves to "already pinned upstream".

**How to apply:** For a gate step, grep `runtime/goal/goal.go` for the conjunct field BEFORE flagging a missing ChangeSet. The proof the step satisfies the criterion is a fixture that imports `runtime/goal` READ-ONLY and shows: low score ⇒ `goal.IsClosed` false; score-at-bar ⇒ true (other conjuncts holding). That is a valid, non-monster mirror. Demanding a redundant ChangeSet on an unchanged prior contract would violate §9 anti-overwrite. See [[verify-emitter-determinism]] for the analogous "re-run proves it" verifier pattern.

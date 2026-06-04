---
name: ba24-orchestration
description: BA24 — OrchestrationPolicy + kind-aware Validate + per-run pin (RunPin) + ResolveConflict (zero-lost-update, total/symmetric); verified green.
metadata:
  type: project
---

BA24 adds `OrchestrationPolicy` to `CoucheAgent` (back/kernel/agentlayer/orchestration.go): closed FanMode + SameFileConflictPolicy enums, RoleCap, validatePolicy (rejects phantom cap > spec knob, gap F1), PolicyVersion (records.Hash of canonical body) + PinForRun + MutationIsForbidden (gap F3 immutability per-run), and ResolveConflict (gap F2): total/deterministic/symmetric tie-break of who-passes-first by MirrorRank→content-hash→agent→target; loser WAITS, NextAction always serialise_then_merge.

TS twin verbatim in front/web/lib/scheduler.ts (validatePolicy, pinForRun, mutationIsForbidden, resolveConflict, mirrorRank); reproducibility mirror scheduler.test.ts (25 fast-check). /agents `scheduler-orchestration` subsection: orch-resolve-conflict-button, orch-bump-version-button, orch-reset-button + policy verdict; wall respected (policy PROPOSED via /goal, not a screen write). e2e tests/e2e/agents.spec.ts BA24 block (4 cases, all green). Verified green: gofmt/vet clean, go test uncached pass, tsc/biome clean, mint validate pass, docs pushed origin/main 7798dc3.

**Watch (by-design, NOT a gap):** the kind-aware Validate now forbids a NON-orchestration layer from carrying an `Equipe` OR an `Orchestration` policy. `LayerKindEquipeAgents` ("a team of agents") therefore cannot carry an Equipe array — the team fan-out/coordination panel for equipe_agents is BA25's surface (forward dep, OpenQuestion). The migration_roundtrip + fixture tests only attach a team to `orchestration`, so no prior-green broke. If a later step wires equipe_agents teams, this rule will need revisiting via a ChangeSet.

Linear: linear-server MCP unauthenticated this session (OpenQuestion, per §11 not a blocker). See [[project_ba23_schedulermcp]] [[project_ba20_scheduler]].

---
name: project-s86-build-console
description: S86 verification — live build console projection (faithful to recorded AgentRun) + per-project stable-phase recording; verified green, zero corrections
metadata:
  type: project
---

S86 « Console de build live + métrage coût/tour » — VERIFIED GREEN, ZERO corrections.

**What it is:** PURE read-only AGGREGATION (back/runtime/buildconsole) of everything a human watches during a build — Project(Input)→BuildConsoleState aggregates recorded AgentRun (S52) + loop History/Decision (S83) + economics MeasuredCost/HarnessCostBudget (S51) + S85 BuildInbox pending into a streamed state (attempt diffs zipped writes×history, sensor results=latest turn greens sorted, cost meter, breaker verdict verbatim, AgentRun result verbatim, approval gate sorted). NO LLM, NO new judgment — a faithful projection of existing records.

**Done-crit (both PINNED + RAN uncached):**
1. StateEqualsRun = non-gameable faithfulness predicate (state.RunID/Goal/Result == run + every authorised attempt maps to an authorised recorded write — anti-fabrication). Fixture TestStreamedStateEqualsRecordedRun + TestConsoleCannotFabricateAnAuthorisedAttempt (run with refused write, tampered state claiming Authorised:true → StateEqualsRun false). Property TestProjectIsDeterministicAndFaithful (rapid: determinism + StateEqualsRun ALWAYS holds for Project's output).
2. RecordStablePhase = per-project stable-phase gate: computes §43 verdict via phases.IsStable (REUSED, never re-judged) → STABLE returns dag.Node (id=phase content-addr, parents=projectdag heads, Stratum=above) ; UNSTABLE refused STABLE_PHASE_INCONSISTENT_CUT (no node from red mirror). Fixture TestStablePhaseRecordedOnlyAtVerdict + property TestRecordStablePhaseIsRecordingIffStable (recording ⇔ stable ⇔ ¬refusal).

**The wall:** both ops return VALUES, write NOTHING. aidos stable --project (cmd/aidos/stable.go) computes verdict + prints node to record — READ-ONLY, privileged aidos writer commits inside ChangeSet. MCP build-console = 2 PURE tools (buildconsole_project returns faithful_projection=StateEqualsRun at boundary + buildconsole_record_stable_phase) — NO truth-write tool, NO SQL. wall-grep CLEAN (no kernel./mirrors./fitness./INSERT/sql in buildconsole.go or front actions).

**Checks:** go build/vet/gofmt clean ; go test -count=1 buildconsole+mcp+cmd/aidos OK ; runtime/...+phases+projectdag prior-green intact. Front: lib/build-console.ts byte-twin (project/stateEqualsRun/isStable/recordStablePhase) vitest 3/3 ; tsc clean for build-console (ONLY error = pre-existing S67 behavior-capture `Cannot find name 'Kind'` NOT mine) ; biome 5 files clean. i18n parity 4210==4210 (no fr-only/en-only), buildConsole namespace fr+en complete, e2e regex strings match (stable.recorded="STABLE…", stable.refused="INSTABLE/UNSTABLE", faithfulOk="…FIDÈLE…"). Nav: WorkbenchHeader:147 {href:/build-console,k:buildConsole}. e2e build-console.spec.ts 4 tests, all 14 testids present in panel. Docs: concept+internals mdx (3 layers Implémentation:9/Méta:56/Méta-méta:66), docs.json:241-242, mint validate PASS, HEAD==origin/main 98c7e05 pushed.

**OQ (by-design forward-dep, non-blocking):** Linear MCP unauth (only auth tools surfaced) — issue flip best-effort ; Mintlify post-push reindex lag ; live-cut feed for aidos stable reads deterministic catalogue (OQ-S23-1, real store read S02/S24/S07 later tooth) ; DAG node persistence = privileged aidos writer in ChangeSet (the wall). NONE block S86's own done-criteria.

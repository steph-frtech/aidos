---
name: s28-exploration
description: S28 exploration gestures (/grill /spike /harvest) — pure Runtime engine over S27 ideas; spike confined, harvest proposes DRAFT Truth; verified-green
metadata:
  type: project
---

S28 = the three §75 exploration gestures (/grill /spike /harvest) as a pure Runtime engine OVER the S27 ideas lifecycle (KRD §75/§84/§118/§132; ADR 0023).

- `back/runtime/exploration/exploration.go`: pure/total. Grill(idea,verdict,reason) routes on closed 3-value verdict {sharp→ideas.Grill; fuzzy→ideas.Grill then ideas.Spike; bad→ideas.Reject} — DEFERS every transition to back/kernel/ideas (never re-impl). CheckSpikeWrite = authoritative confinement predicate (path under /spike or SPIKE_WRITE_ESCAPES_ZONE). Harvest → DraftTruthProposal with HasFrozenVersion()/HasMirror() CONSTANT false (the double absence keeps it a proposal). CheckHarvestWrite(kernel|mirrors|fitness)→HARVEST_CANNOT_FREEZE.
- `back/hooks/spike-confinement`: PreToolUse hook defers to the pure predicates, fail-closed on garbage (deny exit 2), learns idea status from INJECTED event field (never reads kernel/mirrors — below waterline). Fault-injection tests green.
- BlockReason codes SPIKE_WRITE_ESCAPES_ZONE + HARVEST_CANNOT_FREEZE in runtime/blockreason with actionable FR how_to_fix (confine_write_to_/spike, write_mirror_run_goal_freeze).
- BDD journey tests/runtime/exploration.feature (6 scenarios incl. the wall: spike-confined + harvest-cannot-freeze) — done-criterion "proven by the wall + a journey" met. + rapid reproducibility/invariant mirror (closed status set, confinement ∀ paths, harvest always DRAFT & writes no truth, TestEngineIsDeterministic).
- Skills .claude/skills/{grill,spike,harvest} all carry §75 honesty rules.
- Front /exploration: read-only above-the-wall lab; ExplorationPanel.tsx is genuinely action-capable (onClick buttons execute the SAME pure deciders via front twin lib/exploration.ts: routeVerdict/checkSpikeWrite/harvest); fast-check 7/7. ui-completeness pattern correct (gestures act via deciders; idea persistence via idea-intake MCP, kernel freeze via later /goal — by design).
- OpenQuestions (by-design forward deps, NOT residual): no /goal freeze of the DRAFT Truth yet; genealogical link to frozen truth wired by later /goal (KRD §119); hook reads injected idea_status.
- Verified-green: go build ./... 0; go test exploration+spike-confinement+idea-intake PASS; vet/gofmt clean; tsc 0; vitest 7/7; all 36 i18n keys present in BOTH fr/en (cross-checked); biome clean; Playwright 5/5 on reused :3000 (route served the new testids); mint validate pass; docs pushed origin/main e81ce22 (in sync); Linear AID-65 Done.

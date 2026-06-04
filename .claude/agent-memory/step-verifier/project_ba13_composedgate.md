---
name: ba13-composedgate
description: BA13 GateAction — the SINGLE composed pure/total verdict folding all 9 governed-agent axes in explicit precedence; perimeter proven closed; verified-green
metadata:
  type: project
---

BA13 = the SINGLE composed verdict that closes the governed-build-agent perimeter. `back/runtime/agentimpl/gate.go` `GateAction(impl, act, meter, h, b, rate, hookVerdicts) → Decision` folds EVERY enforcer built across BA07–BA12 into ONE pure/total function in an EXPLICIT precedence (gap D3):

1 determinism (Arbitrate, INSIDE the gate, FIRST) → 2 zone (wall.Classify deny-list) → 3 path (PathAllowed allow-list) → 4 egress → 5 exec → 6 capacity (ToolAllowed) → 7 skill (SkillAllowed) → 8 budget (CheckBudget min()) → 9 hook (HooksSatisfied).

**Precedence is contract, not cosmetic:** it decides which BlockReason a multiply-violating action returns. zone (deny-list) PRECEDES path (allow-list) — a kernel write inside an over-broad AllowedPaths trips ZONE not path. Arbitrate dominates a stacked gap+zone+budget. Each axis checked only when its inputs present (totality). `PrecedenceAxes`/`Axis*` consts single-source the axis names.

**Wall single-sourced:** gate.go imports `back/hooks/pretooluse/wall` (the BA03 extraction) for zone Classify — no dup. GateAction WRITES NOTHING (pure classifier). `back/hooks/pretooluse/gate.go` `EvaluateGoverned(GovernedEvent)` is the S04 hook bridge: pure adapter delegating to GateAction; bare-zone path (Evaluate/Classify) UNCHANGED, regression mirrors pass (anti-overwrite §9).

**Mirrors:** gate_fixture_test.go (happy + each of 9 axis violations → correct BlockReason + Arbitrate-first + zone-before-path) RED-first; gate_property_test.go (rapid: reproducible, total/no-panic, DeniedAxis∈PrecedenceAxes iff denied, determinism-gap-dominates). TS twin gateAction/GateDecision/GateActionInput/PRECEDENCE_AXES/AXIS_* in agentlayer.ts — verbatim precedence match.

**Verified green:** Go 3 pkgs ok + full ./runtime/... ./hooks/... EXIT 0 (prior-green intact) + go build clean. tsc 0; vitest 87/87 (+7). e2e agents.spec 47/47 (+2 BA13: allowed-perimeter, refuses-at-determinism) on :3000. mint validate success; docs concept+internals (3 layers) registered docs.json, pushed origin/main 03122fa.

**Button-count SCAR held this time:** BA13 reuses the BA12 arbiter-gate-run button (adds the gate-decision verdict block, NOT a new button) so the shared impl-viewer `toHaveCount(6)` assertion (agents.spec:296) stays 6 — correct by design. (Contrast BA10 where a probe was added and the count had to bump.)

**BA13-specific e2e scar (obs 2963, fixed by executor):** the demo gate target was first hardcoded to `front/web/...` which is outside the resolved impl's AllowedPaths → confinement axis pre-empted the determinism headline → test failed. Fixed by targeting `impl.allowedPaths[0] + "/demo.ts"` (coupled to the selected agent's OWN allow-list) so confinement passes and determinism surfaces as the headline. Lesson: a composed-gate UI demo must target IN-BOUNDS for the axis under test to surface.

**OpenQuestions (by-design fwd-deps, NOT residual):** (1) the real S04 hook transport reading a GovernedEvent from a live tool-call stream awaits the loop shell (BA15+); EvaluateGoverned is the pure primitive, unit-tested not yet on transport. (2) Linear MCP unauthenticated (only authenticate exposed) — OAuth+restart needed.

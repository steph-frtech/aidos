---
name: ba08-skillaxis
description: BA08 — SKILL-axis enforcer SkillAllowed (3rd of 4 wall axes); pure set-membership default-deny, AGENT_SKILL_NOT_BOUND; sibling of BA07 ToolAllowed
metadata:
  type: project
---

BA08 adds the SKILL axis of the governed-agent wall, alongside it in back/runtime/agentimpl/enforce.go (same file as BA07 ToolAllowed — the BA-E2 enforcer axes share enforce.go by design; BA09/BA10 add PathAllowed/Egress/Exec/HooksSatisfied there too).

- `SkillAllowed(impl, skillName) -> SkillDecision{Allowed, *BlockReason}`: pure total fail-closed set-membership over `impl.Skills` (the Enabled SkillBindings BA05 resolveSkills resolved). Allowed IFF skill bound; else default-deny with NEW S13 `AGENT_SKILL_NOT_BOUND`. Same verdict SHAPE as ToolAllowed (capacity) and agentlayer.MayWrite (zone). The 3rd of four declared axes.
- `CodeAgentSkillNotBound` added additively to blockreason.go (const + reasons entry + codeOrder) — auto-validated by the enum-driven property mirror via Codes(). enforce.go pure: no DB/clock/rng/I/O.
- TS twin `skillAllowed` + `SkillDecision` + `AGENT_SKILL_NOT_BOUND_REASON` (FR explanation + 3 howToFix VERBATIM-matching Go) in front/web/lib/agentlayer.ts. 5 new vitest cases (57 total, was 52).
- /agents ImplementationViewer gains an action-capable skill-probe (testid skill-probe-run): enter skill → executes skillAllowed → allowed badge or AGENT_SKILL_NOT_BOUND BlockReason+how_to_fix. Below-the-line pure verdict, no truth-write — wall respected. BA06/BA07 "exactly 1 button" assertion refined to exactly-2 (capacity + skill probes).
- e2e SEMANTIC: fixture (agentlayer-data.ts BDD_WRITER) binds write-bdd-scenario=enabled (allow), evolve=DISABLED (deny — proves resolveSkills drops disabled, surface narrows), unknown=default-deny. 4 new cases, 29/29 total green on :3000.

Verified-green: go build/vet/gofmt clean, rapid 5 SkillAllowed props + blockreason green, runtime+kernel/agentlayer 20 pkgs ok (no prior-green regression), vitest 57/57, tsc clean, e2e 29/29 on live :3000 (:3100 stale 404, :3200 down), both .aidos-docs pages live (200) + docs.json registered + mint validate clean, pushed origin/main 2467bc2 (working tree of .aidos-docs clean). 3 layers present in internals.

Notes: whole back/runtime/agentimpl/ dir is still UNTRACKED (??) on this branch — entire BA02-BA08 back code lives in working tree uncommitted, normal for in-progress BA series. Unrelated working-tree churn (kernel/agentlayer knobs.go + wall.go) is a parallel BA kernel-side step, NOT BA08's skill enforcer — its tests pass, doesn't affect BA08. OQ: Linear MCP unauth (best-effort §11). PASS.

---
name: wb2-11-goal
description: §WB2-11 /v2/goal — the /goal gesture (idée→miroir→/goal→gel, KRD §116) as XState wizard + pure twin; the wall-crossing
metadata:
  type: project
---

§WB2-11 (after WB2-10) /v2/goal = le /goal geste (KRD §116 "promouvoir = écrire le miroir = /goal") as XState wizard idea→mirror_written→frozen. THE WALL-CROSSING (§2): idea PROPOSES (hasMirror=false) → ÉCRIRE LE MIROIR flips HasMirror false→true → /goal composes a ProposedKernel (idée descends to its coordinate VERBATIM + receives frozenVersion content-addressed prefix `k:`) carried by a ChangeSet DRAFT prefix `cs:` — wroteKernel ALWAYS false (PROPOSE never APPLY).

TWIN lib/v2/goal.ts PURE/TOTAL/DETERM no-LLM no-clock no-rng: promoteIdea/validateMirror/frozenVersion(FNV-1a reused from WB2-03/07)/changeSetId(idempotent from ideaId+version)/refuseDirectWrite/goalStage. WALL LITERAL via TYPE LITERALS — `readonly hasMirror: true` and `readonly wroteKernel: false` on ProposedKernel (type system enforces). refuseDirectWrite returns BlockReason{code:WALL_DIRECT_TRUTH_WRITE_FORBIDDEN} for ANY input — NO success path by construction. validateMirror imposes EL10 expectedMirrorForm (reuses besoin-completeness.isMirrorForm). syntheticIdea/syntheticMirror (operation/F/feuille, fixture_n2) OQ synthetic same as WB2-03/06/07.

MACHINE GoalWizardMachine.ts XState v5 3 states, DELEGATES all judgment to twin (guards mirrorValide=validateMirror, promotable=promoteIdea; actions goal=promoteIdea, refuse=refuseDirectWrite) — judges-nothing. SCREEN page.tsx Server→GoalWizardClient client-only stepper shadcn data-state/data-active. goal NOT a glossary slug → own static route, no /v2/[slug] collision. REACHABLE: /v2/[slug] adds CONCEPT_GESTURES{mur:/v2/goal} link (v2-concept-gesture-mur testid, v2Shell.gestureGoal key) — ui-completeness from /v2/mur.

VERIFIED-GREEN ZERO corrections: vitest twin14+machine6=20/20, lib/v2+app/v2 133/133 (executor said 125, more files now all green), tsc0 globally, biome0 (6 files), build13.0s /v2/goal ƒ, i18n v2Goal fr38==en38 all keys present + gestureGoal fr/en present, WALL clean (no kernel/mirrors/fitness import, no fetch/mutation, e2e asserts writes===[]), docs 3-layer docs.json:511-512 mint validate PASS, code HEAD 1848e25==origin/build/s00-s47 clean tree, docs HEAD 3e66cb9==origin/main both pages on origin.

SSR :3211 static (title/wall-note/back/stepper data-state=idea/idea-coordinate=operation/mirror-form/mirror-text/write-mirror/direct-write testids) hydrates CLIENT (wizard); /v2/mur carries gesture link; coexistence / 200. SCAR-respected: PORT next start -p 3211 own pid kill, prod :3000 re-200, /v2/grill prior step still 200.

OQ (by-design forward-dep, NOT residual): synthetic idea/mirror until store serves live ideas/kernel (S06 mirrors schema, S20 changeset engine); Linear MCP unauth (can't move WB2-11 to Done); Mintlify index lag (pages on origin, live after reindex). All bootstrap-exception OQ. Executor report accurate.

---
name: wb2-10-grill
description: §WB2-10 /v2/grill = the grill-with-docs gesture (CLAUDE.md §6 phase 1) as XState wizard — sharpen an intention above the wall, PROPOSE only
metadata:
  type: project
---

§WB2-10 (after WB2-09) /v2/grill = the geste GRILL-WITH-DOCS (CLAUDE.md §6 phase 1) conducted as XState wizard: capture raw intention → bound scenarios (≤5 mandat A) → AFFÛTE language (declared table) → revue → AFFÛTER → intention AFFÛTÉE + candidate ADRs + doc seed. PROPOSE only (hasMirror=false/wroteKernel=false LITERALS, the wall §2).

TWIN lib/v2/grill.ts PURE/TOTAL/DETERMINISTIC no clock/rng/IO/LLM: runGrill(draft,stepSlug)→GrillResult; diagnose()→GrillIssue[](intent_too_short/no_scenario/too_many_scenarios/scenario_incomplete); verdictOf()→sharp/fuzzy/rejected COMPUTED grammar (empty intent OR >5 scenarios→rejected; missing/incomplete→fuzzy; 1..5 complete→sharp); sharpenText() word-boundary regex replace by SHARPEN_TABLE declared (feature→cellule,bdd/test→miroir,goal→/goal,wall→mur,db→Postgres…) IDEMPOTENT (canonicals not themselves ambiguous); CandidateADR one per distinct sharpened term, table-order, deduped; grillHash FNV-1a content-addr; DocSeed annexes 2 Mintlify paths; reuses glossary SLUGS no fork. MACHINE app/v2/grill/GrillWizardMachine.ts XState v5 4 states intention→scenarios→revue→affutee, DELEGATES to twin (guard nonRejete=diagnose, action grill=runGrill), judges nothing.

SCREEN page.tsx Server (getTranslations, passes KEYS to client) → GrillWizardClient client-only useMachine; stepper shadcn data-state/data-active GRILL_STEPS; scenario add/remove count n/5; AFFÛTER→amber sharpened panel verdict+ADRs+docSeed+hasMirror/wroteKernel. grill NOT a glossary slug → own dedicated route, NO /v2/[slug] collision (NOT in DEDICATED_SLUGS={liens,cellules} but doesn't need to be since not a slug).

VERIFIED-GREEN ZERO corrections: vitest grill twin 14 + machine 4 = 18/18, full lib/v2+app/v2/grill 105/105 (prior green intact), tsc0 biome0(6 files; «then» Gherkin term suppressed by biome-ignore-all noThenProperty — KRD ubiquitous language), build13.3s /v2/grill ƒ +/v2/[slug] ƒ, i18n v2Grill fr47==en47 all page KEYS+title/eyebrow/subtitle/wallNote present, WALL clean (no fetch/mutation/kernel/mirrors/fitness imports; PATCH_SCENARIO is XState event NOT http write), docs 3-layer (Implémentation:9/Méta:41/Méta-méta:49) docs.json:509-510 mint validate PASS HEAD 6fa9a0b==origin/main.

SSR :3221 carries static+first-step testids (title/wall-note/stepper/state/intent/next/wizard/subtitle/back-home); wizard interactivity (sharpen, scenarios, ADRs) hydrates CLIENT-side → e2e needs live server (executor ran :3210 2/2 green, same scar as all WB2 client wizards). SCAR-respected: next start -p 3221, killed by exact ss-ltnp pid, prod :3000 re-200.

OQ by-design (non-blocking): Linear MCP unauthenticated (§11 best-effort, can't move WB2-10 issue); Mintlify search-index lag (pages on origin/main, mint validate clean, indexing follows deploy). Executor report fully accurate.

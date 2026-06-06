---
name: project-el06-thresholds
description: EL06 verified-green — BesoinThresholds declared config + enumerable OptionSpace metric, with a self-comparison vacuity scar found and fixed
metadata:
  type: project
---

EL06 (compound-du-besoin track): TWO declared above-the-wall capabilities in back/runtime/besoin/thresholds.go.

1. **BesoinThresholds** = ONE content-addressed record (DefaultThresholds() MaxScenarios=5 = ROADMAP ≤5); RequiredFieldsFor(l) SOURCED from spec.go RequiredFields (delegates to levelSpecs, NO second copy) so EL07/EL11 read the SAME record. Hash() over max_scenarios + per-rung required fields in AllLevels() order (9 levels: 7 source rungs product/journey/view/control/action/operation/entity + 2 transversal bands invariant/policy).
2. **OptionSpace(L,L+1)** = enumerable declared metric per ADJACENT SOURCE-rung pair (uses Levels()=7 + NextLevel → 6 pairs). 5 enumerable (product→journey 7, journey→view 7, view→control 8, control→action 3, action→operation 5) + operation→entity DECLARED OpenQuestion (Enumerable=false, Size()==-1 NEVER fabricated 0 — entity aggregate boundaries are user's open domain). Size()=len(Choices)|−1, pure count never LLM.

Cross-stack hash parity VERIFIED byte-for-byte: Go Hash() == TS thresholdsHash() == `37d267af164e1258099b88854efd745ce045ea9881b8fdbbcde1b1406e00f037` (re-ran both, not trusted from report). Go rapid 10 props + TS vitest/fast-check 10/10; gofmt/vet/tsc/biome clean.

Wall STRUCTURAL: thresholds.go imports only crypto/sha256, encoding/hex, fmt, sort, strings — no pgx/INSERT/kernel/mirrors/fitness. Above-the-line config.

**SCAR found & fixed (self-comparison vacuity, see [[feedback-assert-self-comparison-vacuity]]):** the "Prouver la source unique" control's runSource() in BesoinThresholdsPanel.tsx AND the TS twin test besoin-thresholds.test.ts:42 both compared `requiredFieldsFor(l)` against `requiredFieldsFor(l)` (the function against itself) — tautologically green, proving nothing. The Go property RequiredFieldsHaveNoSecondCopy does it RIGHT (compares RequiredFieldsFor vs RequiredFields, two distinct fns). Fixed both TS sides to compare requiredFieldsFor(l) vs specOf(l).requiredFields (the grammar's raw spec). Still green (property genuinely holds) but now non-vacuous. e2e scenario B (source-verdict not "Drift/Dérive") is meaningful again.

i18n parity 2778==2778 both locales, all besoinThresholds.* keys present both, nav wired both (/compound-besoin-thresholds k="besoinThresholds"). e2e 4/4 PASS on :3000 (live server served committed panel; my fix is source-only, behaviour unchanged both green).

Biome WorkbenchHeader:263 suppression-no-effect warning is PRE-EXISTING (commit 295112e nav-drawer 2026-06-03, git blame confirmed) NOT EL06 — same scar as EL04/EL05.

ADR 0042 accepted. Docs d875625 HEAD==origin/main mint-validate passed, 3 layers (Implémentation/Méta/Méta-méta) in internals + concept, registered docs.json. FwdDep: OQ-EL06-1 operation→entity non-enumerable v1 (declared OQ, later EL may enumerate); OQ-EL06-2 Linear MCP unauth. verified-green.

---
name: el19-wizard
description: EL19 verification — /compound-besoin level-by-level FORCED wizard tunnel + /compound-besoin/doc requirements-doc generator; the front-facing capstone of the EL track
metadata:
  type: project
---

EL19 = the level-by-level FORCED tunnel (vertical staircase) on route /compound-besoin + the requirements-doc generator on /compound-besoin/doc.

- **CompoundBesoinWizard.tsx**: step N+1 LOCKED until `canDescend(N).enough` (EL07 gate made visible via data-unlocked attr); a parsable-but-VACANT scenario (VACANT_BODY scenarios:[]) does NOT unlock = anti-gaming (data-enough=false); ShrinkOptionSpace integer per rung (EL08, shrinkFor reads optionSpaceFor); anchors above read-only incl NoEmit (anchorsAbove EL08); metadata panel per node (EL04); cross-app-reuse shown as OpenQuestion never acquired (EL18). The verdict is the PURE TS twin canDescend — front NEVER re-implements the gate.
- **lib/besoin-requirements-doc.ts** EmitRequirementsDoc = PURE projector COMPOSING emitCount/emitIdeas (EL16) + redBacklog topo-sort (EL17) + levelMirrorForm (EL10) + levelToProposes via emitCount (EL05); re-implements none; same graph → byte-identical markdown+graphHash; no LLM.
- **WALL**: screen is pure useState, NO fetch/POST; project()/openGoals() call only pure twins + setState; emitted Ideas HasMirror=false; git diff touched ONLY front/ + docs. "Ouvrir comme goals" REFUSED on incomplete graph via besoinCompleteness (EL09 monster NEED_LEVEL_WITHOUT_MIRROR), data-ok=false.
- ui-completeness: 5 executable controls (complete/make-vacant/project/open-goals + doc generate), each with e2e.
- **Sensors**: tsc clean; vitest reproducibility mirror 7/7 + full besoin suite 178/178 (16 files) green; e2e 9/9 on :3000 (both routes 200).
- i18n 3183==3183 ZERO orphans, besoinWizard (38 keys incl rungNames×9) + besoinDoc (14 keys) + nav.besoinWizard/besoinDoc both locales; besoinInterview ns RETAINED (embedded EL13 panel kept below, non-destructive).
- docs: concept + internals el19-wizard.mdx, 2 refs in docs.json, three H2 layers (Implémentation/Méta/Méta-méta at lines 9/47/55), mint validate passed, HEAD==origin/main 60b1961.
- **SCAR**: biome-clean-lie recurred AGAIN — report claimed clean but `useTemplate` info on graphHash string-concat (line 261). Fixed → template literal, committed b986916. WorkbenchHeader:276 suppression warning is PRE-EXISTING (EL19 diff only touched nav GROUPS 49-58, not the backdrop suppression) — NOT an EL19 gap. See [[feedback-biome-clean-report-lie]].
- OQ (non-blocking by-design): Linear MCP unauth; prior EL14-EL18 files uncommitted on tree but functional (per-step isolation); /ideas board static fixture so Projeter surfaces in-screen (no live idea-intake HTTP endpoint = forward-dep).
- verified-green, 1 correction (biome useTemplate).

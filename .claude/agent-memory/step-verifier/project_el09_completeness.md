---
name: el09-completeness
description: EL09 verification — completeness law applied to the BESOIN (BesoinCompleteness pure detector + LevelMirrorForm table); verified-green
metadata:
  type: project
---

EL09 = the completeness law (S06) applied to the BESOIN above the wall. `BesoinCompleteness(graph, mirrors, metadata)→CompletenessReport{Complete, Monsters[]}` is a PURE/TOTAL detector: counting + matching, reuses EL04 `CertifyMetadata` (never re-judges), no clock/rng/IO/LLM.

4 closed besoin-local MonsterCode (separate from blockreason.Code and EL07/EL08 BesoinBlockCode): NEED_LEVEL_WITHOUT_MIRROR (resolved node, no mirror), ORPHAN_NEED_MIRROR (mirror reflects no resolved node — also fires on a DRAFTING node), NEED_MIRROR_WRONG_FORM (form != LevelMirrorForm), NEED_LEVEL_METADATA_DISAPPEARED (resolved node, EL04 metadata gone). Each carries non-empty HowToFix (never a prison). sortMonsters deterministic by level descent rank → code → explanation.

`BesoinLevelMirror{Reflects, Form}` is the NEED-SIDE description only — EL09 READS it, never writes a `mirrors`-schema record (real mirrors written below the wall by app-builder S68 via /goal). Wall STRUCTURAL: completeness.go + mirrorform.go import only fmt/sort, no pgx/sql/INSERT/UPDATE/kernel-mirror/fitness.

`LevelMirrorForm(level)→(MirrorForm,ok)` table built HERE as EL09's honest input (EL10 dependency split, declared OQ): total over 9 grammar levels, ok=false for out-of-scope. 5 derive-mirror-covered rungs (entity/policy/operation/control/action) carry SAME form pinned by TestProp_LevelMirrorForm_AgreesWithDeriveMirrorCovered (no fork); product/journey→gherkin_n0, view→screen_fixture freshly declared. 4 closed MirrorForm.

Fault-injection BOTH directions PROVEN (done-criterion): remove mirror→NEED_LEVEL_WITHOUT_MIRROR, orphan/drafting→ORPHAN_NEED_MIRROR, wrong-form, metadata-gone; GREEN baseline + empty-node-no-obligation. Reproducibility property 15× + law property (closed-code+howtofix). Go gofmt/vet/test PASS uncached. TS twin lib/besoin-completeness.ts byte-equivalent (metaComplete:boolean seam like EL07), vitest 13/13, tsc clean, biome clean (biome-clean-lie did NOT recur this step). i18n 2864==2864, 20 keys both locales + nav.besoinCompleteness both, nav wired WorkbenchHeader:48. Route /compound-besoin-completeness 200 on :3000, action-capable 4 controls (check/break-mirror/orphan/reset) run twin no-LLM. e2e 4/4 :3000. Docs c99a888 HEAD==origin/main, both pages on origin/main, registered docs.json after el08, 3 layers, mint validate passed.

OQ (non-blocking, by-design fwd-dep): EL10 full view/journey validators + Postgres persistence of level-mirror set (EL15); Linear MCP unauth. verified-green.

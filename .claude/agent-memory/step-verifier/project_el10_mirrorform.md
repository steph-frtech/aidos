---
name: el10-mirrorform
description: EL10 verification — LevelMirrorForm totality + new view/journey schema validators, candescend delegates (single source), above-the-wall
metadata:
  type: project
---

EL10 splits out of EL09 (which built the LevelMirrorForm table HERE as honest input). EL10 formalizes:

- `LevelMirrorForm(level)→(MirrorForm,ok)` already in mirrorform.go (EL09); EL10 adds `mirrorform_property_test.go` proving TOTAL over `AllLevels()`=9 (criterion says "8 rungs" — superset, satisfied) AND output ≡ derive-mirror for the 5 covered rungs (entity/policy/operation/control/action) via `deriveMirrorOracle` (INDEPENDENT hardcoded map, NOT self-comparison — EL06 [[assert-self-comparison-vacuity]] scar avoided). product/journey→gherkin_n0, view→screen_fixture (freshly declared, derive-mirror does NOT cover them).
- `validators.go` (NEW): `ValidateViewSchema` (goal + ≥1 named zone + ≥1 named datum; `namedList` accepts string OR {name:...}) and `ValidateJourneySchema` (parseable Gherkin ≥1 Given/When/Then). The two above-the-wall rungs with NO Go backing pkg.
- DETERMINISM-FIRST single source: candescend.go (EL07) LevelJourney/LevelView cases now DELEGATE to these validators → one view rule, one journey rule, no fork.

Wall STRUCTURAL: validators.go + mirrorform.go import only encoding/json + strings; no pgx/sql/INSERT/kernel/mirrors/fitness. Writes no mirror.

Sensors all green re-run: gofmt clean, vet clean, `go test ./runtime/besoin` ok, `go build ./...` ok (no external importer of besoin pkg, refactor safe). tsc --noEmit clean; vitest 20/20 (besoin-completeness.test.ts, incl fast-check determinism + derive-mirror oracle agreement); e2e 3/3 on :3000.

i18n: namespace `besoinMirrorform` 18 keys both locales; nav key `besoinMirrorform` both FR/EN (route /compound-besoin-mirrorform wired WorkbenchHeader:49); badges "delegated"/"declared" match e2e toContainText; total 2888==2888 zero orphans.

Docs: concept + internals el10-level-mirror-form.mdx both exist, registered docs.json:305-306, internals has 3 layers (Implémentation/Méta/Méta-méta), mint validate passed, HEAD==origin/main dd11d70.

OQ/non-blocking: Linear MCP unauth (can't flip issue — recurring); WorkbenchHeader.tsx:267 biome suppression-unused warning is PRE-EXISTING (commit 295112e nav-drawer, NOT EL10 — working tree has no WorkbenchHeader diff vs HEAD); page metadata says "8 rungs" once (cosmetic, table provably total over 9); richer view-zone modelling deferred to app-builder S68 (forward-dep). verified-green, ZERO corrections.

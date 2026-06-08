---
name: s06-mirror-completeness
description: S06 verification — typed Mirror record (5 fields) + completeness law + liveness computed; the step that BUILDS the mirrors schema (bootstrap waterline for prior file-mirrors)
metadata:
  type: project
---

S06 "Mirror schema + liveness" — the bicephalous-body step that BUILDS the `mirrors` Postgres schema (the substrate prior steps deferred to per CLAUDE.md §6 bootstrap exception).

**Verified-green, ZERO corrections.** Re-ran everything; report was accurate.

- Five typed §34 fields: Go `records.Mirror` struct + TS `Mirror` interface + `mirrors.mirror_record` columns with CHECK enums (reflects_layer_id/version, test_kind, cert_language, authority, liveness). Content-addressed CHECK `id=version=content_hash`.
- Liveness COMPUTED: `IsLiving()` = alive AND `CertLanguage.IsExecutable()` (prose absent from executableCertLang → never counts, KRD §805). Orphan/non-executable → monster.
- Completeness law: `ComputeCompleteness` = NoTruthWithoutMirror (required test_kind from RECORDED §90 profile requiredTestKinds map, not invented) + NoOrphanMirror; returns sorted monster set + verdict, never a satisfied bool (anti-Goodhart).
- `requiredTestKinds`: entity→schema, policy→property, operation→fixture, view→e2e, control/action→fixture, api→contract, db→snapshot, types→schema, ui-web/ui-mobile→unit. Single point to refresh via ChangeSet if §90 widens (OQ).
- Migration: agent SELECT-only, REVOKE INSERT/UPDATE/DELETE/TRUNCATE = in-DB wall; aidos writer SELECT/INSERT/UPDATE (UPDATE only for superseded_by head-move, body append-only by app discipline since PG has no column-scoped GRANT — proven by TestMirrorRecordAppendOnlyHead).
- Go tests RAN fresh -count=1 GREEN: records 9.45s (TestCompletenessOverRealPostgres + TestMirrorRecordWallHolds permission-denied + TestMirrorRecordContentAddressed + TestMirrorRecordAppendOnlyHead, all Testcontainers pg16; + TestCompletenessBDD 4 scenarios Godog; + rapid TestReproducible/TestVerdictMatchesMonsterSet/TestNonExecutableNeverCounts/TestOrphanAlwaysMonster). completeness pkg 0.009s. gofmt/vet clean.
- BDD: tests/mirror/completeness.feature 4 scenarios (no_truth_without_mirror / no_orphan_mirror / living-executable=green / non-executable=red), back-filled per bootstrap (this is the step that builds mirrors).
- Front: lib/mirror-health.ts byte-faithful PURE port (REQUIRED_TEST_KINDS + EXECUTABLE_CERT_LANGS + computeCompleteness) + DEMO cut; vitest 9/9. /mirror-health route + HealthRunner executes via Server Action computeHealth (READ-ONLY: only computeCompleteness + revalidatePath, NO truth-write — wall-legal because completeness is a read-only verdict). Nav entry :94. e2e 3/3 RAN live 4.5s (run-monster→RED_MONSTER both reasons + orphan data-orphan; run-complete→COMPLETE all data-living).
- i18n 3441==3441, mirrorHealth 13==13 keys matching.
- Docs: concept + internals (3 layers Implémentation:11/Méta:51/Méta-méta:59) registered docs.json:79-80, mint validate passed.

**NOTE (not a gap):** back/kernel/mirror/completeness/completeness.go is actually S12 (the Stop GATE that CONSUMES S06's detector) — correctly NOT claimed as S06's own work, reuses not re-derives. No overwrite.

OQ (forward-deps, NOT residual): §90 registry-widening=ChangeSet later; completeness Stop-enforcement hook=S12; HTTP/API gateway=S36; Linear MCP unauth (memory: needs OAuth+restart). All by-design.

---
name: project-s02-records
description: S02 KRDCore seven record types — content-addressed JSONB substrate, round-trip + property mirror, verified green
metadata:
  type: project
---

S02 = the seven KRDCore record kinds (Idea/Truth/Mirror/Layer/Link/ChangeSet/Phase) as content-addressed append-only JSONB; id==version==Hash(Canonicalize(body)).

VERIFIED GREEN (re-verified 2026-06-07, ZERO corrections):
- `back/kernel/records/records.go`: PURE Canonicalize (recursive key-sorted JSON, UseNumber) + SHA-256 Hash + Validate (content-address invariant) + NewRecord constructor. No DB/IO/MCP/sqlc — pure structs, determinism-first authoritative.
- migration `kernel_records_baseline.sql`: creates ideas.idea, kernel.truth/layer/link, mirrors.mirror, changesets.changeset, dag.phase; GRANT SELECT-only + REVOKE INSERT/UPDATE/DELETE/TRUNCATE on all 7 = in-DB wall.
- Done-criteria MET: `go test ./kernel/records -count=1` GREEN 4.94s — TestSevenRecordsRoundTripAsJSONB (real Postgres Testcontainers, 7 tables round-trip validated JSONB), TestAgentRoleIsSelectOnlyOnTruthSchemas (per-kind INSERT/UPDATE/DELETE→permission denied wall), TestKRDCoreRecordsBDD (Godog acceptance, feature at tests/kernel/krdcore_records.feature), 4 rapid property tests (canon stable under key reorder, byte-change→new hash, empty example each kind validates, tampered address rejected).
- gofmt/vet clean; tsc 6 files clean; biome clean on app/records.
- Front /records: RecordsPanel reads 7 types + above/below badges + head rows JSONB preview; page.tsx `records-source` badge live|demo; e2e records.spec.ts (7 types, badges, source, teach, propose-gated).
- i18n 3441==3441, records ns 26==26.
- Docs concept+internals (3 layers Implémentation/Méta/Méta-méta) registered docs.json:71-72, mint validate PASSED, HEAD==origin d5c9a0b.
- WALL front clean: only "kernel.records" string literal in RecordsTeach (teaching, not a write).

By-design forward-deps (OpenQuestions, NOT residual): ProposeControl present-but-disabled "à venir S20" (changeset engine S20 / idea-intake S27); mirrors schema persistence of mirror sources is bootstrap-file form until S06; no store MCP at S02 (S01 owns store). Linear MCP unauthenticated.

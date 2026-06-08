---
name: project-s89-provision-datastore
description: S89 per-app datastore provisioner — PURE content-addressed Plan over S88 verdict; plain-postgres default by construction, doltgres opt-in iff Go; verified green zero corrections
metadata:
  type: project
---

S89 = per-app DATASTORE PROVISIONER (app-builder EPIC9, ADR 0006/0047 + ADR 0048, DP15/ADR 0043).

- **back/runtime/provision**: PURE BuildPlan(Spec)→(Plan, *blockreason). plain-postgres DEFAULT by construction (empty Target⇒plain); doltgres opt-in ONLY under S88 Decision.OptInAllowed (else CodeOutOfScope, never silent downgrade); pgvector sidecar iff NeedsVector on plain (NOT on doltgres, caveat recorded); DDL via REUSED gen/db.EmitMigration (sorted entities, byte-stable); per-project isolation database app_<hash12>/namespace proj_<hash12> from records.Hash("provision/v1:"+projectID); migration human-gated via REUSED db.RequireMigration (DataTruthScope §44.3) BEFORE DDL render, BlockReason surfaced verbatim; emitted as PulumiResource (DP15, sorted Env). id=records.Hash(canonicalPayload) excludes id+reasons (keys on resolution only). No LLM. WroteKernel never.
- **Reused fns verified real**: db.RequireMigration (datatruthscope.go:228), db.EmitMigration (emit.go:85), doltgresspike Decision.OptInAllowed (doltgresspike.go:244), db.AppliesExistingRecords. All exist.
- **DONE-CRIT** (Testcontainers provision_apply_test.go) — all 4 PINNED+covered: DDL applies on default target + CRUD round-trip (TestProvisionDDLAppliesDefaultTarget), per-project isolation 2 containers B≠see-A (TestProvisionIsolationApply), doltgres `AS OF` post-DOLT_COMMIT returns earlier row total=10 (TestProvisionDoltgresAsOf). Opt-in AIDOS_RUN_PROVISION_APPLY/AIDOS_RUN_DOLTGRES_SPIKE, skips no-Docker = by-design forward-dep OpenQuestion. Plan logic proven by property+vitest regardless.
- **Property mirror** rapid 5: Reproducible(id+DDL), DefaultIsPlainPostgres(empty⇒plain, sidecar iff vec), DoltgresGate(no-go/absent⇒refused, go⇒asof), Isolation(distinct≠collide same=stable), MigrationHumanGate(historical no-scope⇒refused). go test ok 0.053s.
- go build ./... clean, gofmt -l clean, vet clean, go test runtime/...+gen/db prior-green intact.
- MCP aidos-provision 2 PURE tools (plan, images) write NOTHING. actions.ts WRITES NOTHING (plan is record). wall-grep CLEAN (no INSERT kernel/mirrors/fitness, no .Apply).
- TS twin lib/provision: buildPlan sha256-over-JSON (NOT byte-pinned to Go records.Hash — acceptable per established pattern; Go DDL is authoritative, apply test uses Go DDL; twin renderDDL is hand-approx). vitest 8/8. SAMPLE_GO_DECISION/SAMPLE_ENTITY for screen self-sufficiency.
- nav WorkbenchHeader:151 {href:/provision, k:provision}; i18n provision 27==27 keys, nav.provision both langs. Note: raw colon-count fr 5383 vs en 5382 = ONE colon INSIDE a string VALUE (nav label "Provisioning datastore par app" vs en), flat key sets IDENTICAL (in-fr-not-en=[], in-en-not-fr=[]) — structural parity holds, NOT a gap. (RECURRING: never trust raw `:`-count for i18n parity; flatten keys and diff sets.)
- tsc 1 error = lib/behavior-capture.test.ts `Cannot find name 'Kind'` S67 PRE-EXISTING, NOT S89. biome 5 files clean. no hardcoded zinc/hex in panel.
- e2e tests/e2e/provision.spec.ts 6/6 RAN GREEN live:3000 (render, default plain+DDL+isolation+content-addr, pgvector sidecar, doltgres opt-in as-of, historical-impact REFUSED human-gate, distinct-project isolation). All controls bound to real engine.
- ADR 0048 (addendum 0006, follows 0047) docs/adr. docs 3-layer (Implémentation/Méta/Méta-méta) docs.json:247-248, mint validate PASS, pushed aa57c19 HEAD==origin/main.
- OQ (by-design, non-blocking): Testcontainers apply opt-in/Docker-gated forward-dep; Linear MCP unauthenticated (OAuth only).

verified-green ZERO corrections.

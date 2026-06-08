---
name: project-s78-app-regenerator
description: S78 « Régénérer mon app » verification — project-scoped byte-stable regenerator that refuses hand-edits; verified green after 1 gofmt + biome cleanup
metadata:
  type: project
---

S78 = `back/runtime/regen` « Régénérer mon app »: Runtime action bound to a Kernel cut that re-emits ALL project sources (entities+relations+ops sync+async+controls+blobs) in ONE pass by COMPOSING the authoritative S74 emitter `relemit.EmitAll` (NO second emitter — reuse §3/ADR0007), classifies staleness by source-hash (Stale/Fresh/Unchanged), and REFUSES on hand-edit FIRST (fail-closed).

DONE-CRIT (property): byte-stable regeneration + refuse hand-edited gen/ file. Both proven:
- `Regenerate(schema, ledger, disk) → (Plan, *BlockReason)` PURE, no file I/O (disk passed in as []DiskFile), no clock/rng/LLM.
- Hand-edit gate runs BEFORE emission, sorted-path order (deterministic first-drift), `Drifted(recordedOutputHash, onDisk) = records.Hash(onDisk) != recordedOutputHash` (REUSES S01 records.Hash — same hash the S74 emitters stamp into Artifact.OutputHash). First drift → empty Plan + CodeGenFileHandEdited.
- `CodeGenFileHandEdited`/`GEN_FILE_HAND_EDITED` added ADDITIVELY to closed blockreason enum (const :301 + non-empty FR how_to_fix entry).
- Stale ≠ drift: stale = source moved (normal, regenerate); drift = hand-edited (forbidden, refuse) — two orthogonal computations over same ledger.

Mirrors ALL GREEN: regen_property_test.go (rapid: ByteStable/OrderInvariant/RefusesHandEdit/FaithfulTree_NoRefuse/StaleBySourceHash), regen_fixture_test.go (Customer+Order+async worked example, 3 outcomes), MCP main_test.go, lib/app-regenerator.test.ts vitest 6/6 (fast-check single-file-handedit-always-refuses). go test regen 0.18s + mcp 0.009s GREEN, go build ./... clean, vet clean.

MCP back/mcp/app-regenerator 3 PURE tools (regenerate/check_drift/plan_only) writes-nothing wall-clean. Front lib/app-regenerator.ts composes S74 twin emitDDL/emitTS/emitWorker (djb2 LOCAL hash for twin internal-consistency, Go records.Hash AUTHORITATIVE=OQ front-id-vs-Go-hash). actions.ts WRITES NOTHING (VALUES-only, clean|handedit scenario). e2e 3/3 GREEN live :3000 (200). nav wired WorkbenchHeader:142 k:appRegenerator. i18n 3971==3971 (22 keys each, perfect parity). docs 3-layer Implémentation/Méta/Méta-méta internals:9/51/61 docs.json:225-226 mint-validate PASS pushed 9e6ae04 0-ahead-of-origin/main. wall-grep CLEAN (no kernel/mirror writes in actions/MCP/regen).

TWO CORRECTIONS (both recurring patterns, see [[recurring-gofmt-biome-on-touched-files]]):
1. `gofmt -w regen_fixture_test.go` — Project field alignment in struct literal (go test/vet do NOT run gofmt; ALWAYS `gofmt -l` touched .go).
2. biome on lib/app-regenerator.test.ts: removed unused `Schema` import (import{x} but x never used = dead binding) + replaced 9 `.plan!` noNonNullAssertion with `.plan?.` (established test-twin posture in relation-emitter/entity-modeler twins is ZERO noNonNullAssertion — match it; biome ci exits 0 on warnings so NOT strictly blocking, but cleaned to repo posture).

OQ by-design (NOT residual): (1) Linear MCP unauthenticated (OAuth+restart) — S78 issue not moved, best-effort §11. (2) persisted Postgres emission-ledger WRITER owned by emitter/changeset seam below the line — regen CONSUMES LedgerEntry list read-only, never authors (forward-dep). (3) front djb2 twin hash vs Go records.Hash/sha256 — Go authoritative, twin only needs internal consistency for screen byte-stability. verified-green AFTER 2 cleanup corrections.

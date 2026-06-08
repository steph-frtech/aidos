---
name: project-s74-relation-emitter
description: S74 relation-aware multi-entity emitter (relemit) — verification facts + the one gofmt correction
metadata:
  type: project
---

S74 « émetteurs relation-aware (+ async + blob) » — RELATION-AWARE MULTI-ENTITY emitter over S35 single-entity emitters. Package `back/kernel/entities/relemit`.

**Why:** the S35 emitters capped emitted apps at ONE sync entity; S74 projects a WHOLE schema cut (entities + relations S71 + async ops S73) to the emitted app's TS/Hono targets (ADR 0040).

**Shape:** Schema{Project, []EntityRelations, []AsyncOp}. Validate gates whole schema projectable (entities S35.Validate, ref.Resolve every relation→UNKNOWN_RELATION_TARGET never guessed, FK target needs identifier→ErrTargetNoIdentifier, async S73 ValidateAsync). SchemaBody/SchemaHash content-addressed via records.Canonicalize+Hash, INPUT-ORDER-INVARIANT (canonicalEntities by name, canonicalAsync by name). EmitDDL (FK 1-1/1-N → `relname_id` REFERENCES real table PK, N-N → join table `owner_relname` composite PK, outbox table iff async). EmitTS (typed assoc fields + nav SDK loadXY — Go renders full bodies, TS twin renders signatures-only=screen preview, Go authoritative). EmitWorker (TS outbox drainer + cron echeance baked, refuses no-async). EmitAll fans deterministically. Target=TS/Hono per ADR 0040 (Postgres DDL dialect unchanged); emitting writes NO truth (projection, S78 owns regen).

**Done-criteria (ALL MET):** (1) same multi-entity AST→byte-identical (TestProp_Deterministic + TestProp_InputOrderInvariant Go rapid + Vitest); (2) N-N emits join table (book_tags composite PK); (3) DDL FKs reference real declared tables (TestFixture_EveryFKReferencesADeclaredTable + TestProp_FKReferencesDeclaredTable); (4) async node emits worker + outbox table.

**Verification:** go test -count=1 GREEN (relemit+mcp+ref+operation all ok), go build ./... clean, go vet clean. MCP back/mcp/relation-emitter = 5 PURE tools (emit_ddl/ts/worker/all, schema_hash) NO DB/SQL — wall clean. Front lib/relation-emitter.ts byte-faithful twin (fast-check) vitest 7/7; /relation-emitter action-capable emitAction WRITES-NOTHING renders values; tsc clean (only pre-existing behavior-capture.test.ts S64 err, unrelated); biome clean 6 files; nav WorkbenchHeader:138; i18n relationEmitter fr+en present; 5 Playwright e2e GREEN against :3000. Docs concept+internals (3 layers Implémentation/Méta/Méta-méta) docs.json:217-218, mint validate PASS, pushed 610f9e1 0-ahead.

**ONE CORRECTION:** gofmt flagged relemit.go — the package doc-comment's bullet-list continuation lines were over-indented; gofmt 1.19+ reflows comment indentation. Applied `gofmt -w`. (RECURRING across steps: executor's hand-aligned multi-line doc comments trip gofmt's comment reformatter — always `gofmt -l` the touched .go files even when go test/vet pass, since `go test` does NOT run gofmt.)

**OpenQuestions (by-design, non-blocking):** Linear MCP unauthenticated (couldn't move S74 issue); emitted-worker outbox-table runtime substrate + Windmill/NATS deferred (DP16); TS twin nav-SDK signatures-only vs Go full-bodies (Go authoritative per determinism-first). Verified-green AFTER 1 gofmt correction.

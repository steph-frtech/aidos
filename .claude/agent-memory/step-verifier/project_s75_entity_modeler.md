---
name: s75-entity-modeler
description: S75 entity/relation modeler verification — canvas draft + propose→ChangeSet + draft-level CRDT concurrency, byte-equal Go/TS hash
metadata:
  type: project
---

S75 « modeleur entité/relation (canvas) + concurrence draft-level » — CANVAS pre-proposal engine over S35 entities + S71 ref.Relation (REUSED verbatim, closed sets never widened).

**Core (back/kernel/entities/modeler):** Draft{Project,[]EntityNode{Entity,[]Relation}} PURE/total. Validate = project+≥1 node, unique names, entities.Validate per node, ref.Resolve every relation (S71 gate, UNKNOWN_RELATION_TARGET never guessed), FK 1-1/1-N/N-N target needs entities.Identifier (mirrors S74 EmitDDL refusal). Body/SchemaHash canonicalize → sort nodes/relations by name (attribute order PRESERVED=semantic) → records.Canonicalize+Hash(S02) → INPUT-ORDER-INVARIANT. Propose validates → changeset.Open DRAFT (spec_delta target `entity-schema@<project>` body=canonical draft + mirror_delta `#mirror`) NEVER applies (wall); reject=discard DRAFT, kernel intact, applied_at nil.

**concurrency.go:** Presence/PresenceSet Join(idempotent,name-sorted)/Leave/LockHolder (soft-lock ADVISORY never blocks merge). MergeDrafts three-way CRDT keyed by entity name: add-by-one kept, change-by-one wins, BOTH-changed-different→a kept + Conflicts surfaced (anti-overwrite, NEVER LWW), both-removed→drop. nodeHash=hash of one-node draft. Order-independent (result sorted), idempotent.

**Done-criteria ALL met & independently verified:** model Customer↔Order→proposed DRAFT in entity-map (fixture+e2e), reject leaves kernel intact (Propose never applies), two editors no overwrite (CRDT keeps both adds, provenance AddedByA/B), divergent edit=conflict surfaced, unknown target refused. CROSS-LANG HASH: I recomputed Go SchemaHash for demo draft = **a91081e16f1c65b806a2b48e09dbf49911ddee1a0dea57dc78f7075b8791c743**, byte-identical to the value pinned in lib/entity-modeler.test.ts (TS twin uses createHash sha256 over canon() = Go records.Hash(Canonicalize)).

**Sensors:** go test modeler+mcp GREEN, vet/gofmt/build clean. MCP 5 PURE tools (schema_validate/hash/propose/canvas_merge/presence) NO SQL=wall clean. front: vitest 7/7, tsc clean (only pre-existing behavior-capture.test.ts S65 "Cannot find name 'Kind'" — NOT introduced by S75), biome clean 5 files, actions WRITE-NOTHING (propose/merge pure, no DB), e2e 5/5 all testids present in panel, h1 t("title")="Modeleur entité/relation"/"Entity/relation modeler" matches regex, nav:138 registered, i18n 110==110 entityModeler in both. wall grep: no INSERT/UPDATE kernel/mirrors/fitness, no pool/pg/query. No LLM/clock/rng in code (only doc-comment mentions). Docs 3-layer (Implémentation/Méta/Méta-méta) docs.json:219-220, mint validate PASS, pushed 3c14a20 0-ahead.

**OQ by-design (NOT residual):** Linear MCP unauthenticated (could not move S75 issue — §11 best-effort OpenQuestion). Apply/approval = aidos CLI + AuthorityGraph = S110. Kernel SOURCE persistence = changeset-engine below wall. behavior-capture.test.ts tsc error = pre-existing S65.

verified-green ZERO corrections.

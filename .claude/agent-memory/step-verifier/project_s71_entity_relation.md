---
name: s71-entity-relation
description: S71 verification — entity-relation AST node (Relation) extending the entity type system without widening the closed scalar set
metadata:
  type: project
---

S71 « nœud de relation de l'Entity AST » — DISTINCT relation node over S35 entities (app-builder EPIC 6).

**Core** `back/kernel/entities/ref/ref.go`: Relation{Name,Target,Cardinality,Semantic,Required}, closed enums Cardinality{1-1,1-N,N-N}+Semantic{fk,association,composition} (declared order, IsKnown*, Cardinalities()/Semantics() copy-out no map leak). ValidateShape (shape+kind), Resolve(r,known map) → ErrUnknownTarget if target∉declared set (UNKNOWN_RELATION_TARGET, never guessed — THE honesty done-crit), Body/ID/Parse content-addressed round-trip REUSING records.Hash/Canonicalize verbatim, BlockUnknownTarget reuses S13 blockreason.BlockReason (Code=CodeOutOfScope "OUT_OF_SCOPE", code-in-explanation switches UNKNOWN_RELATION_TARGET vs UNKNOWN_RELATION_KIND), non-empty how_to_fix. PURE no clock/rng/LLM. **TestProp_ScalarSetUntouched** proves entities.ScalarTypes() {string,int,decimal,bool,timestamptz} not widened — relation is its own node.

**Done-crit MET**: property round-trip (TestProp_RoundTrip ID(Parse(Body))==ID + ContentAddressed retarget⇒new id + Deterministic) + fixture TestFixture_RelationRoundTripsAsContentAddressedAST; honesty TestProp_UnknownTargetRefused + TestFixture_UnknownRelationTargetIsRefusedNeverGuessed + MCP TestRelationResolve + e2e Ghost fault-inj.

**Verified**: go test ref+entities(prior green 8.3s)+mcp all GREEN, vet/gofmt clean, go build ./... clean. Byte-parity anchor computed live: body=`{"cardinality":"1-N","name":"customer","required":true,"semantic":"fk","target":"Customer"}` id=`a853f1ccd185d5bf17edc45cd1a7665e83f0a2f144844eba9378dd4e02d5dfee` — matches report AND TS twin vitest 6/6 (lib/entity-relation.test.ts asserts this exact id). MCP 2 pure tools (relation_resolve/relation_address) write nothing. Front: page title "Nœud de relation de l'Entity AST" matches e2e regex, nav WorkbenchHeader:137, i18n parity 3802==3802 (report said 4053 — wrong number but PARITY holds, not blocking). Wall grep CLEAN (no INSERT/kernel/mirrors/fitness in front). tsc clean for S71 (1 pre-existing behavior-capture.test.ts error unrelated, S65/67). biome clean. e2e 4/4 (6.0s). docs concept+internals(3 layers Implémentation/Méta/Méta-méta) docs.json:211-212, mint validate PASS, pushed d483ef4 0-ahead of origin/main.

**OQ by-design**: relation-aware emitters (FK/join-table/sqlc) = S74 scope (S71 emits nothing); Linear MCP unauthenticated (only authenticate tools exposed) — step issue not movable programmatically; front-id-vs-Go-hash proven byte-equal not assumed.

verified-green ZERO corrections.

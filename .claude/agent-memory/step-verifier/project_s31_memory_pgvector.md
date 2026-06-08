---
name: s31-memory-pgvector
description: S31 Memory adapter (pgvector) verification — write+similarity-recall over the four indexable KRD memories, two injectable backends
metadata:
  type: project
---

S31 Memory adapter (pgvector, KRD §136/§119.1) — verified GREEN, ZERO corrections (re-verified 2026-06-07; prior full verify 2026-06-01 obs 1846/1847/1848).

Done-criteria all met: MemoryItems of all four kinds (episodic/semantic/procedural/structural) store+retrieve via pgvector embeddings; similarity recall deterministic under fixed seed; proven by mirror.

**Go pkg** `back/archive/brain/memory/`: Store port {Write/Recall/Get} + injected Embedder port, TWO interchangeable backends (ADR 0025) — MockStore (in-mem, exact cosine over seeded HashEmbedder, no model) + PgxStore (brain.memory_item via pgx, HNSW cosine ANN, ON CONFLICT(id) DO NOTHING=idempotent append-only). MemoryItem id=records.Hash(CanonicalBody) REUSE S01/S02 (canonicalBody Kind="memory_item" matches S30 shape, NO version/NO mirror key, excludes id+embedding). Closed Kind enum 4 (working/evolutionary explicitly OUT), closed Taint enum 5 (round-trips intact). rankHits = SHARED pure recall core (cosine, kind/branch filter, score-desc, tie-break id-asc, truncate-k). HashEmbedder seeded SHA-256 bag-of-tokens L2-normalized → determinism-first holds by construction.

**Mirrors**: memory_fixture_test.go TestFixture_WriteThenRecall PARAMETRIZED over {mock,pgx} backends (pgx via live pgvector Testcontainer) — identical pass IS the "both backends injectable" done-criterion; asserts id==content-hash, nearest-semantic-first, score-desc, len≤k, kind+branch filter narrows, superseding-write=+1 row (append-only), same-body=idempotent no-row. memory_property_test.go TestProperty_StoreContract rapid (mock; pgx proven observationally equiv by fixture) — ≤k, score-desc, filters, id==hash, recallable, taint round-trip, count==distinct-ids, recall-determinism (2nd recall same order). go test -count=1 fresh GREEN memory 2.4s + mcp 0.005s, gofmt/vet clean.

**Migration** `brain_memory_pgvector_baseline.sql` EXPAND-ONLY over S30 brain.memory_item: CREATE EXTENSION vector; ADD COLUMN IF NOT EXISTS kind/content/embedding vector(384)/provenance/validity_scope/expires_at/confidence/taint(default {}); indexable-kind CHECK (NULL-tolerant for pre-S31 rows); HNSW vector_cosine_ops index + (kind,branch) idx. S30 columns/CHECKs/GRANTs untouched+re-asserted. Wall: GRANT SELECT,INSERT brain (below waterline=fuel) REVOKE UPDATE/DELETE/TRUNCATE (append-only); REVOKE all writes+CREATE on kernel/mirrors/fitness. ADR 0025 pins dim=384/HNSW/cosine.

**MCP** `back/mcp/memory/main.go`: 3 tools memory_write/memory_recall/memory_get (one-tool-one-op, Store-backend injected). NO truth-schema write (only matches=explanatory comment + doc keywords). go test PASS.

**Front** twin lib/memory.ts (4 kinds, 5 taints, cosine recall, kind/branch filter, score-desc tie-break id-asc, seeded fnv1a embedder) READ-ONLY no-truth-write. lib/memory.test.ts fast-check vitest 6/6 GREEN. lib/memory-data.ts SEED_MEMORIES+EXAMPLE_QUERY (load-bearing e2e/panel anchors). MemoryBackendsPanel action-capable: recall executes FROM SCREEN (recall-query/recall-cta/kind-chips/backend-toggle) ui-completeness HOLDS, fuel-never-truth banner, hits show score/kind/branch/taint/provenance. biome clean 4 files. e2e tests/e2e/memory-backends.spec.ts 5 scenarios testids match (kind-chip×4/hit-row/hit-kind/hit-score/hit-taint/hit-provenance/backend-real/fuel-banner). NOTE: front backends use DIFFERENT seeds (mock=31,real=7) yet e2e asserts same TOP hit for SEED_MEMORIES — by-design "interchangeable on top hit", NOT a contradiction. i18n memoryBackends 31==31, total 3441==3441.

**Docs** concept + internals (3 layers Implémentation/Méta/Méta-méta verified present) docs.json:131-132, mint validate PASS, .aidos-docs main...origin/main 0-ahead (pushed). All S31 files committed d01e396 (the S20→S32 archive batch commit), working tree clean for all S31 files.

OQ by-design (NOT residual): MemoryFirewall promotion flow Memory→ContextPack→Idea→Mirror→Goal→Kernel §119.1 = S30 firewall pkg + later; ContextRouter/ContextPack §119.3 = S33 (confidence-scale numeric-vs-§138-ordinal seam to resolve, ADR 0008 addendum); ContextGraphDecision+reuse §119.2 = S32; no working/evolutionary memory (4 indexable only). Linear S31 issue NOT flipped to Done — linear-server MCP unauth (only authenticate/complete_authentication exposed, obs 5312 confirms), recorded as OQ per contract §5 (never fail step on Linear-unauth). verified-green ZERO corrections.

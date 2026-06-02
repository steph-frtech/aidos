# ADR 0025 — S31 Memory adapter: embedding dimension, index, distance, and the injected Embedder port

- **Status:** accepted
- **Date:** 2026-06-01
- **Step:** S31 — Memory adapter (pgvector embeddings; episodic/semantic/procedural/structural)
- **Supersedes:** none — refines the "pin before S31 codes" obligation left open by ADR 0008.

## Contexte

S31 gives the engine-side `/brain` store a **memory adapter**: write a `MemoryItem` and **recall by
similarity** over **pgvector** embeddings across the four *indexable* KRD memories — episodic /
semantic / procedural / structural (KRD §136). ADR 0008 froze the backend as **native pgvector** and
left three things to pin *before* S31 codes, because a later change forces a **reindex of the
append-only table**:

1. the **embedding dimension** (`vector(N)` is fixed at column-creation),
2. the **index type**,
3. the **distance/operator**.

It also requires the embedder to be an **injected port** so tests need no real model and the runtime
can name its model in provenance.

## Décision

- **Dimension = 384.** `brain.memory_item.embedding` is `vector(384)`. 384 is the native dimension of
  the small open sentence-transformer family (e.g. `all-MiniLM-L6-v2`) — cheap, CPU-friendly, ample
  for recall-as-fuel. It is **pinned at column creation**; changing it later is an expand-contract
  migration that reindexes the (append-only) table, never an in-place `ALTER`.
- **Index = HNSW** (`vector_cosine_ops`), per ADR 0008. HNSW gives high-recall ANN with predictable
  query latency and is the pgvector ≥ 0.8 default for read-heavy recall; IVFFlat (the considered
  alternative) needs a populated table to build well and is tuned per-dataset — wrong for an
  append-only store written incrementally.
- **Distance = cosine** (`<=>`, `vector_cosine_ops`), per ADR 0008. Recall is *semantic nearness*,
  scale-invariant; cosine is the right metric (L2 / inner-product rejected: magnitude-sensitive).
  **Score = `1 - cosine_distance`** (so higher = nearer; the fixture/property order by score desc).
- **The `Embedder` is an injected port** (`memory.Embedder` interface, `Embed(text) []float32` of
  length 384). Two implementations behind it:
  - `HashEmbedder` (deterministic, **no model**) — the test/mock embedder. It maps text to a fixed
    384-vector by a seeded, content-only hash bucketing scheme (same text ⇒ same vector, always), so
    a test never depends on a network model and the **reproducibility mirror** holds by construction.
    This is the seeded determinism the done-criterion ("deterministic under a fixed seed") names.
  - The **real** runtime embedder (a 384-dim sentence model) is **named in the MemoryItem provenance**
    and wired only in the runtime; S31 ships only the port + the deterministic `HashEmbedder` (the
    real model is a runtime concern, not a build-time dependency). The model name living in
    provenance is what makes a future model swap a *recorded reindex*, not a silent drift.
- **Two `Store` backends behind one interface, injected by constructor (no global):**
  - `MockStore` — in-memory, exact cosine over the `HashEmbedder` vectors (deterministic).
  - `PgxStore` — `brain.memory_item` via pgx, HNSW cosine ANN.
  The write-then-recall fixture runs against **both** and must pass identically — that identity *is*
  the "both backends injectable" done criterion.
- **Recall filter = SQL `WHERE` on kind/branch** in `PgxStore` (pushed down, not a post-filter), and
  the equivalent pre-filter in `MockStore` — so the two backends are observationally equivalent.

## Conséquences

- The `brain.memory_item` table (created append-only at S30, body-only) is **expanded** by S31 with
  the indexable columns `kind`, `embedding vector(384)`, `provenance`, `validity_scope`, `expires_at`,
  `confidence`, `taint text[]` and the HNSW index — **expand-only/append-only**, never altering or
  dropping the S30 shape (CLAUDE.md §9). The `vector` extension is enabled in the same migration.
- The agent role keeps **SELECT + INSERT only** on `brain.memory_item` (below the wall — fuel), and
  **no** grant on kernel/mirrors/fitness (the wall re-asserted). No UPDATE/DELETE — supersession is a
  new row, expiry is `expires_at`.
- A later embedding-model change is a **deliberate reindex** (new migration), gated by an ADR — never
  an in-place edit of the append-only table.

## Alternatives rejetées

- **IVFFlat index** — needs a populated table to train; wrong for incremental append-only writes.
- **L2 / inner-product distance** — magnitude-sensitive; recall here is semantic nearness (cosine).
- **A bigger dimension (768 / 1536)** — more storage + index cost for no recall gain at this fuel
  scale; revisit only if a real model demands it (recorded reindex).
- **Embedding inside the store** (no port) — would couple tests to a model and break the deterministic
  reproducibility mirror; rejected.

## Open question (carried to S33, per ADR 0008)

The **confidence-scale seam**: S31 stores a numeric `confidence` (0..1); KRD §138 / S33's ContextRouter
filter on an *ordinal* scale (`observed_once | repeated | proven_by_sensor`). S31 keeps the numeric
field (it is what pgvector rows carry); the mapping to the ordinal scale is owned by S33's router and
is **not** invented here. Recorded as an OpenQuestion, not a blocker for S31.

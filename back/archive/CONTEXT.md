# AIDOS Archive

The version space of the OS: a single DAG that is at once manual undo, human branching, and the quality-diversity evolutionary memory. It also houses the engine-side `/brain` memory store — context fuel, never truth. Lives at `back/archive/`.

## Language

**archive (l'archive)**:
The version space of the OS as a whole — append-only with a mutable head, content-addressed, stratified by the waterline (human truth above, evolutionary branches below). One structure serving undo, branching, and evolutionary search.
_Avoid_: repository, backup, history, store (the `/brain` store is one part of it, not the whole).

### The version DAG

**version DAG (DAG de versions)**:
The shape of the version space: a DAG, not a line — stable phases are nodes, ChangeSets are edges, content-addressed over a `jj + git + Dolt` substrate.
_Avoid_: git history, commit log, version history, timeline.

**quality-diversity archive (archive QD)**:
The version DAG read as evolutionary memory: variant = branch, stepping stone = ancestor, niche = parallel branch, élite = a kept stable phase. The evolutionary archive and the version DAG are **one structure**, not two.
_Avoid_: training data, experiment tracker, model registry, separate evolution store.

**stable phase (phase stable)**:
A coherent cut in the DAG where every link resolves and every sensor is green at once (including the recursive aggregate) — the kernel's lockfile. Local (cell) or global (federation); fractal.
_Avoid_: release, snapshot, milestone, tag (a git tag / Dolt commit only *maps* a stable phase).

**ChangeSet**:
The atomic, reversible transactional envelope that moves from one stable phase to the next, wrapping `spec` (Kernel) and `miroir` (Mirror) together so they never drift. States are `DRAFT | APPLIED | REVERTED` only; a revert is a new inverse ChangeSet.
_Avoid_: commit, diff, transaction (generic); delta, revision, mutation (historical aliases).

**semantic merge (fusion sémantique)**:
The merge of two truth branches of the version DAG read as a **semantic** operation, not a textual one (KRD §122/§130): the **mirror** decides the conflict — RED on the merged cut (the recursive aggregate, §109) — never a line-level three-way diff. A merge git would call clean is **blocked** when its merged kernel-cut reddens a mirror. The decider `MergeSemantic(base, left, right, sensors)` is pure and read-only; it writes no truth (applying a clean merge rides the S20 ChangeSet path).
_Avoid_: three-way merge, text merge, git merge, auto-merge (the textual operation is exactly what semantic merge refuses to trust); rebase, cherry-pick.

**merged cut (coupe fusionnée)**:
The candidate coherent cut formed by the union selection `base + left's deltas + right's deltas`, evaluated by the same `IsStable` / recursive-aggregate oracle as any stable phase (S23/S18). It is content-addressed (S02). It is a *candidate* stable phase only — it becomes one iff its aggregate is GREEN.
_Avoid_: merge commit, merge result (generic), three-way result.

**merge conflict (conflit de fusion)**:
At least one mirror reddens on the merged cut (KRD §122) — including two branches touching *disjoint lines* that break the **same emergent invariant** of a shared parent (a conflict the text diff never sees). A conflict **blocks** the merge; resolving it is an **override** (human, above the waterline — ChangeSet + ADR + provenance, KRD §11/§12), never an auto-merge. A merge `MergeSemantic` cannot evaluate (no common ancestor, unevaluable cut) is **unresolvable → OpenQuestion**, never a fabricated `clean`.
_Avoid_: merge error, text conflict, line conflict, rejected hunk.

### Quality-diversity memory

**stepping stone**:
An ancestor node kept because it may seed a future leap, even though it is not itself an élite. It is why the archive is diversity, not just the current best.
_Avoid_: checkpoint, old version, dead branch.

**ArchiveCurationPolicy**:
The policy that keeps the DAG a living memory rather than an infinite dump (a `décharge`), declaring what to **keep**, **compress**, and **tombstone**. Critical history is never destroyed, only compacted or tombstoned.
_Avoid_: retention config, garbage collector, log rotation, purge.

### The `/brain` store

**`/brain` (the six KRD memories — store side)**:
The engine-side store of the six KRD memories — `working`, `episodic`, `semantic`, `procedural`, `structural`, `evolutionary` — branch-aware and indexable, at `back/archive/brain/`. It is context fuel, never truth. The human cockpit over `/brain` (Obsidian-style notes/adr/runs/glossary/maps) lives in the Workbench, not here.
_Avoid_: database, truth store, RAG store, knowledge base; conflating the store (here) with the cockpit (Workbench).

**MemoryFirewall**:
The gate that prevents memory from ever posing as truth: no `MemoryItem` reaches the kernel except through the mandatory flow `Memory → ContextPack → Idea → Mirror → Goal → Kernel`. Memory proposes; the kernel declares.
_Avoid_: access control, ACL, sanitizer, validation layer.

**memory adapter (adaptateur mémoire)** (S31):
The `/brain` store's write + **recall-by-similarity** seam over **pgvector** embeddings, across the four **indexable** memories — `episodic | semantic | procedural | structural` (KRD §136). One `Store` **port** (`Write`/`Recall`/`Get`) with two **injectable** backends — a deterministic `MockStore` (exact cosine over a seeded `Embedder`, no model) and a `PgxStore` (HNSW + cosine ANN over `brain.memory_item`, ADR 0025) — interchangeable behind the interface. `working` and `evolutionary` memory are **out** of the adapter (working = the live context window; evolutionary = the version DAG). It ships only write + recall; it reaches **nothing** above the wall.
_Avoid_: vector database, RAG, knowledge base, search index, embeddings store (it is fuel-recall, not a truth lookup and not a RAG that decides).

**recall (rappel)** (S31):
Retrieving the **nearest** memories to a query by **cosine similarity**, ordered by score descending, optionally narrowed by `kind`/`branch` filters, top-`k`. Deterministic under a fixed embedder seed. It is **context fuel**, never a decision: a recalled item is not a fact and reaches no kernel/mirror.
_Avoid_: query, lookup, search (truth-flavoured), retrieval-augmented decision, ranking truth.

**Embedder (port d'embedding)** (S31):
The injected port that maps text to a fixed-dimension vector (384, ADR 0025). The mock uses a deterministic `HashEmbedder` (no model — so tests need none and recall is reproducible); the runtime names its real model in the memory's provenance, so a model swap is a recorded reindex of the append-only table, never a silent drift.
_Avoid_: model, encoder (bare), tokenizer; baking a model into the store.

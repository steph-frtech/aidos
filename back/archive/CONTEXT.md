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

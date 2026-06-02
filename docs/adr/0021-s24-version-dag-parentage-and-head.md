# ADR 0021 — S24: the version DAG — parentage as an edge relation, head as a node flag

- **Status:** accepted
- **Date:** 2026-05-31
- **Step:** S24 (AIDOS Archive — Version DAG)
- **Context map:** `back/archive/CONTEXT.md` (version DAG, stable phase, ChangeSet, stepping stone, append-only with mutable head, waterline strata)
- **KRD:** §120 (the version space is a DAG, not a line; append-only with a mutable head), §121 (the three moves: branch / checkout-ancestor / rebranch; the abandoned line is never destroyed), §124 (waterline stratification: above = human truth, below = evolutionary), §125 (a stable phase is a coherent cut on any branch; several parallel heads)

## Decision

S24 lands the **version DAG** as the Archive's structural primitive: nodes are stable phases (S23), edges are ChangeSets (S20), and the three §121 navigation moves — **branch**, **checkout-ancestor**, **rebranch** — grow the DAG **append-only with a mutable head**. Three genuine representation choices were made (the spec flagged them as the likely real choices) and are pinned here as above-the-line decisions.

### 1. Parentage is the `dag.edge` relation — ONE representation, never duplicated on the node

A node may have ≥1 parents (a DAG, not a tree, §120). Parentage is stored **once**, as the `dag.edge (from_node, to_node, changeset)` relation; the in-memory `Node.ParentIDs` is **reconstructed from the edges** on load (`Store.Load`), never written as a second source of truth. This keeps a single authority for "who descends from whom" and makes a future merge (≥2 parents, §122) a pure addition of edges — no node-shape change. The edge **reuses the S20 `changesets.changeset.id`** (the DAG is a relation over existing rows; it never copies a ChangeSet body) and refuses a self-loop (`from_node <> to_node`) so the structure stays a DAG.

### 2. `head` is a boolean flag PER NODE — supporting several parallel heads (§125)

The current head is a `boolean head` column on `dag.node`, not a separate single-row pointer table. This is the simplest representation that supports **several parallel heads at once** (§125 — one branch stable while another is in flux): `Heads(dag)` is just the set of flagged nodes. A **branch off a head** moves the flag to the new node; a **branch off an inner ancestor** leaves the existing head(s) in place (two parallel lines). **CheckoutAncestor** is a pure **head-flag move**: it clears the flag on the ancestor's descendants and sets it on the ancestor — appending and deleting nothing. The `head` column is the **only mutable column**; `body`, `id`, `version`, `stratum` are immutable (content-addressed). The writer role's `GRANT` is `INSERT` + `UPDATE (head)` only — never `DELETE` (append-only; the abandoned line is never destroyed).

### 3. The node content address hashes {kind, parent_ids, stratum, label} — reusing S01/S02, never forked

A freshly branched/rebranched node's id is `records.Hash(records.Canonicalize({kind:"phase", parent_ids, stratum, label}))` — the **same content-hash scheme as S01/S02**, not a forked one. So a node is content-addressed (the same parentage + line identity always lands under the same id) and a move is replayable. A recorded stable phase's cut/sensor/verdict ride inside the persisted `dag.node.body` (so a node stays inspectable after the head moves); the branch/rebranch node is addressed by its parentage + line identity. The `version = id` CHECK pins content-addressing at the DB level.

## Why a new table family (not an ALTER of S23 `dag.stable_phase`)

S23's `dag.stable_phase` records a single `parent` back-reference. S24 needs the **full DAG** — ≥1 parents, several heads, the waterline stratum, and a first-class edge referencing the S20 ChangeSet. Per the anti-overwrite rule (expand-only, no ALTER of a prior table, CLAUDE.md §9), S24 adds **additive** `dag.node` + `dag.edge` tables; the S02 `dag.phase` and S23 `dag.stable_phase` shapes are **untouched**, and their GRANTs are unchanged.

## The wall (CLAUDE.md §2)

`dag` is above the waterline. The agent DB role gets **SELECT only** on `dag.node` / `dag.edge`; all writes are revoked. Only the privileged `aidos` writer role (via the `dag` MCP — the single door) INSERTs nodes/edges and UPDATEs the head flag. A "checkout an ancestor" is a head-flag UPDATE, never a DELETE.

## Consequences

- **Branch / CheckoutAncestor / Rebranch** are total, deterministic, pure functions of `(dag, command)` (no DB, no clock, no rng) — the rapid property mirror (Go) and the fast-check mirror (TS twin) pin append-only growth, the no-cycle invariant, the head-flag-move checkout, rebranch-parents-on-ancestor, parallel heads, and content-addressing.
- The DAG **only grows**: no move deletes a node or edge. An abandoned line stays as a stepping stone (§123) — the basis for the later QD sampling (§123) and mirror-gated promotion (§124), which ride on this DAG but are **not** this step.
- **Explicitly later:** semantic merge / conflict-as-sensor (§122, S25), mirror-gated evolutionary promotion (§124), QD niche sampling (§123, S26), and any red-wave / `/goal` firing on a move.

## Open question

- **OQ-S24-1** (by-design forward dependency): the front-end panel uses a deterministic *local* node id to animate a move offline; the authoritative content-addressed id is the Go `records.Hash`, surfaced via `dag_get` once the Workbench reads the live DAG through the SELECT-only role. Swapping the local id for the real content address is a later projection and does not change the move semantics.

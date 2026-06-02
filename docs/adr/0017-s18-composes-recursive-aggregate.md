# ADR 0017 — S18 `composes` (7th link) + recursive mirror aggregate

- Status: Accepted
- Date: 2026-05-31
- Subsystem: AIDOS Kernel (`back/kernel/composes`)
- Linear: AID-17 (`S18 · Composes / aggregate`)

## Context

KRD §108 introduces the **seventh** link — `composes`, the mereology link (a whole contains a
part), version-pinned and **weighted** (`load-bearing | cosmetic`). KRD §109 makes the
completeness law **recursive**:

```
aggregate_complete(L) := own_mirror(L)==GREEN ∧ ∀ child via composes(L) : aggregate_complete(c)
```

S06 defined a **flat** `own_mirror`-based completeness verdict; S12 turned that flat verdict into
a Stop gate. S18 must (a) land the `composes` link value, (b) compute the recursive aggregate so a
red child reddens the aggregated parent, (c) honour the KRD §112 declared weight/threshold (a
cosmetic change below threshold does not reopen the parent), (d) guard against cycles. It must do
so without re-erecting a hook, inventing a primitive, or silently rewriting S06/S12.

## Decisions

1. **No new primitive — composes generalizes the existing law (KRD §108 "aucun primitif neuf").**
   `composes` is a specialization of S17's generic `kind:"link"` record (`link_kind:"composes"`);
   the recursive aggregate generalizes S06's flat `own_mirror` verdict. The `composes` package
   **consumes** the per-node `own_mirror` verdict (handed in), it never re-derives or re-types it.

2. **Weight rides inside the kernel.link JSONB body; the threshold lives in a side table.**
   The S18 OpenQuestion (column placement vs the S02 shape) is pinned: the per-link `weight`
   rides INSIDE the existing content-addressed `kernel.link` body (matches S17 exactly — one
   pattern, no second shape, no `ALTER`), surfaced for inspection by a read-only
   `kernel.composes_edge` VIEW. The per-composite `activation_threshold` goes to a NEW append-only
   side table `kernel.layer_activation` (NOT an `ALTER` of `kernel.layer` — expand-only, never
   mutate a prior table). Both are **declared** truths (KRD §112 — never learned); the agent role
   gets SELECT-only (the wall).

3. **The §109 recursive law is unconditional; §112 activation is a separate signal.** A red own
   mirror, or ANY composes-child whose aggregate is RED, reddens the parent (the law at every
   node). The §112 weighted, thresholded **activation** (`Σ weight(changed children) ≥
   activation_threshold`) answers a different question — "does this *change* reopen the parent's
   emergent mirror for re-derivation?" — exposed as `Activation` / `ReopensOnChange`. A cosmetic
   change contributes weight 0.0, so it stays below any positive threshold (cosmetic isolation),
   while a green parent with a green cosmetic child stays GREEN.

4. **Cycle guard.** `composes` is a DAG; a cycle yields a typed `*CycleError` naming the layers,
   never a silent infinite recursion, never an invented edge (an OpenQuestion made explicit, §82).

## Two prior-contract touches → ChangeSet + SemanticDiff (NOT in-place edits)

Per CLAUDE.md §9 anti-overwrite, S18 does **not** hand-edit S06 or S12. The two generalizations
are recorded here as the SemanticDiff and will be applied through the ChangeSet engine (S20) when
that substrate lands; until then S18 ships the recursive capability in its own package, which the
S12 hook will **import** (never re-implement):

1. **S06 flat `Mirror.aggregate` → recursive law.** SemanticDiff kind: **refine** (not override —
   the flat verdict is the degenerate single-node case of the recursive law: a layer with no
   composes-children has `aggregate(L) == own_mirror(L)`). Blast radius: every composite layer.

2. **S12 Stop gate input.** SemanticDiff kind: **refine** — the gate is fed `Aggregate(L)` instead
   of the flat `own_mirror(L)`. S12's `Gate`/`Check` shape is unchanged; only the verdict source
   generalizes. S12's hook imports `back/kernel/composes` rather than re-deriving aggregation.

Both ChangeSets are **DRAFT** (recorded, not applied) until S20's ChangeSet engine + S21's
SemanticDiff land. No S06/S12 source file is edited by S18.

## Consequences

- A red load-bearing child reddens the aggregated parent (THE done criterion), with a drill-down
  path naming the red child.
- The aggregate is pure, total on a DAG, deterministic, never panics, and replayable (the rapid
  property mirror pins the law at every node, monotone reddening, cosmetic isolation, totality,
  the cycle guard).
- The specific edges/weights/thresholds of any real project remain human-declared truths above the
  line; S18 ships the METHOD (the link kind + the recursive law), never invented project data.

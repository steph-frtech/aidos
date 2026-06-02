-- S18: composes — the SEVENTH KRD §108 link (mereology: a whole contains a part) + the
-- DECLARED weight/threshold truth the recursive aggregate (KRD §109, §112) reads. Expand-only,
-- append-only, ADDITIVE. It NEVER alters or drops a prior table — the S02 kernel.layer /
-- kernel.truth and the S17 kernel.link shapes are untouched.
--
-- TWO declared truths land here (KRD §112 — *weights and thresholds are DECLARED by the human,
-- never learned*), so both get SELECT-only for the agent role (the wall, CLAUDE.md §2); only the
-- privileged aidos CLI writer role writes them, through an approved ChangeSet:
--
--   1. The per-link `weight` (load-bearing | cosmetic). A `composes` link is just a kernel.link
--      row whose body is {kind:"link", link_kind:"composes", parent, child, weight} — the weight
--      rides INSIDE the existing content-addressed JSONB body (the S17 substrate), so NO column
--      is added to kernel.link and NO prior table is altered. This side migration adds only a
--      CHECK-shaped VIEW that surfaces composes edges + their declared weight for inspection,
--      plus the per-composite activation_threshold table below.
--
--   2. The per-composite `activation_threshold` (KRD §112). Rather than ALTER kernel.layer in
--      place (which would mutate the S02 table — forbidden, anti-overwrite), the threshold lives
--      in a NEW append-only side table kernel.layer_activation, content-addressed and pinned to
--      the layer @version it qualifies. A layer's declared activation gate is a separate
--      append-only fact; the head moves by INSERTing a new row, never an in-place UPDATE.
--
-- COLUMN-PLACEMENT DECISION (the S18 OpenQuestion, now pinned): weight rides inside the existing
-- kernel.link JSONB body (matches S17 exactly — one pattern, no second shape); the threshold goes
-- to a side table (NOT an ALTER of kernel.layer — expand-only, never mutate a prior table). This
-- keeps the migration strictly additive and the declared truths inspectable.

-- kernel.layer_activation — the DECLARED per-composite activation_threshold (KRD §112),
-- content-addressed + append-only, pinned to the layer @version it qualifies. The threshold is a
-- declared truth above the line (never learned, never defaulted silently).
CREATE TABLE IF NOT EXISTS kernel.layer_activation (
    id                   TEXT        NOT NULL,           -- SHA-256 of the canonical body
    layer_id             TEXT        NOT NULL,           -- the composite layer id
    layer_version        TEXT        NOT NULL,           -- the layer @version this threshold qualifies
    activation_threshold DOUBLE PRECISION NOT NULL,      -- KRD §112 declared gate (≥ 0)
    body                 JSONB       NOT NULL,            -- {kind:"layer_activation", layer_id, layer_version, activation_threshold}
    version              TEXT        NOT NULL,
    superseded_by        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT layer_activation_pkey PRIMARY KEY (id),
    CONSTRAINT layer_activation_threshold_nonneg CHECK (activation_threshold >= 0)
);

-- kernel.composes_edge — a READ-ONLY VIEW surfacing the composes edges + their declared weight
-- out of the existing kernel.link JSONB bodies (the S17 substrate). It introduces NO new write
-- door and stores NO new fact: it is a projection of head kernel.link rows whose link_kind is
-- "composes", exposing parent/child/weight for the /truth-tree panel and the aggregate.
CREATE OR REPLACE VIEW kernel.composes_edge AS
SELECT
    l.id                                   AS link_id,
    l.body ->> 'link_kind'                 AS link_kind,
    l.body -> 'parent'                     AS parent,
    l.body -> 'child'                      AS child,
    l.body ->> 'weight'                    AS weight,
    l.version                              AS version,
    l.superseded_by                        AS superseded_by
FROM kernel.link l
WHERE l.body ->> 'link_kind' = 'composes';

-- The wall (CLAUDE.md §2): SELECT-only for the agent role on the new declared-truth table + the
-- view; all writes revoked. The agent reads the composition tree for /truth-tree but never writes
-- truth — only the aidos CLI writer role writes, via an approved ChangeSet.
GRANT SELECT ON kernel.layer_activation TO aidos_agent;
GRANT SELECT ON kernel.composes_edge    TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.layer_activation FROM aidos_agent;

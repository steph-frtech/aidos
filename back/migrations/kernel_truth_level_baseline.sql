-- FK01: truth_level — the seven KRD truth levels (FKE-5, Raw→Reconciled) stored on a
-- record. Expand-only, append-only, ADDITIVE. Adds one NULLABLE column to the truth
-- and mirror records. Applied via Atlas (declarative); this file is the canonical DDL.
--
-- FKE-5 (grill 2026-06-07): the truth level is STORED on the record (queryable,
-- historised) but WRITTEN ONLY by the deterministic transition function
-- (kernel/truthlevel.Compute) — never hand-posed — with a parity mirror
-- `stored_level == computed_level` (any divergence = RED). "Done is computed" holds:
-- the stored level is a CACHE PROVEN BY THE COMPUTATION, not a second source.
--
-- EXPAND-CONTRACT (CLAUDE.md §3/§9): the column is added NULLABLE so existing rows are
-- untouched — NO backfill, NO NOT NULL flip this step. It does NOT alter, drop, or
-- NOT-NULL-flip any prior column; the S02 row shapes are otherwise unchanged. This is
-- the SemanticDiff `add` (a behaviour pinned in free space — KRD §11), proven additive
-- by the roundtrip test (no prior row invalidated).
--
-- THE WALL (CLAUDE.md §2): no GRANT is added/changed here. The agent role keeps its
-- SELECT-only on kernel.truth / mirrors.mirror; only the privileged aidos CLI role
-- writes truth, via an approved ChangeSet. This migration is AUTHORED here but APPLIED
-- by the migration role.
--
-- The CHECK pins truth_level to the EXACT seven FKE-5 names — out-of-enum is a DB-level
-- error, not a silent string (defense in depth alongside truthlevel.Compute, which is
-- the SOLE legal writer of the value).

-- kernel.truth.truth_level — the FKE-5 rung of a frozen truth. Nullable: existing rows
-- are not yet levelled; the constraint allows NULL but pins any non-null value.
ALTER TABLE kernel.truth
    ADD COLUMN IF NOT EXISTS truth_level text;

ALTER TABLE kernel.truth
    DROP CONSTRAINT IF EXISTS truth_truth_level_enum;
ALTER TABLE kernel.truth
    ADD CONSTRAINT truth_truth_level_enum CHECK (
        truth_level IS NULL OR truth_level IN (
            'raw',
            'interpreted',
            'proposed',
            'accepted',
            'projected',
            'observed',
            'reconciled'
        )
    );

-- mirrors.mirror.truth_level — the FKE-5 rung of a mirror record (the mirrors schema
-- carries the level alongside facet, per the roadmap impact table). Same expand-only
-- contract.
ALTER TABLE mirrors.mirror
    ADD COLUMN IF NOT EXISTS truth_level text;

ALTER TABLE mirrors.mirror
    DROP CONSTRAINT IF EXISTS mirror_truth_level_enum;
ALTER TABLE mirrors.mirror
    ADD CONSTRAINT mirror_truth_level_enum CHECK (
        truth_level IS NULL OR truth_level IN (
            'raw',
            'interpreted',
            'proposed',
            'accepted',
            'projected',
            'observed',
            'reconciled'
        )
    );

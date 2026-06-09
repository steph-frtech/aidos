-- FK02: facet — the eight canonical KRD facets (FKE-1.3, F/I/S/B/R/V/M/X) stored on a
-- record. Expand-only, append-only, ADDITIVE. Adds one NULLABLE column to the truth and
-- mirror records (the facet COORDINATE, the orthogonal axis of FKE-1.4 paired with the
-- FK01 truth_level vertical axis).
--
-- FKE-1.3 (grill 2026-06-07, ADR 0044): a kernel declares which LENSES it instantiates,
-- COLLAPSIBLE — only the facets matching its nature of truth. The FUNCTIONAL facet (F) is
-- ALWAYS present (incompressible = intent + proof pair). The facet declaration is WRITTEN
-- ONLY by the privileged transition at the legal door — never hand-posed (the agent role
-- is SELECT-only on these tables, the wall).
--
-- EXPAND-CONTRACT (CLAUDE.md §3/§9): the column is added NULLABLE so existing rows are
-- untouched — NO backfill, NO NOT NULL flip this step. It does NOT alter, drop, or
-- NOT-NULL-flip any prior column; the S02/FK01 row shapes are otherwise unchanged. This is
-- the SemanticDiff `add` (a coordinate pinned in free space — KRD §11), proven additive by
-- the roundtrip test (no prior row invalidated).
--
-- THE WALL (CLAUDE.md §2): no GRANT is added/changed here. The agent role keeps its
-- SELECT-only on kernel.truth / mirrors.mirror; only the privileged aidos CLI role writes
-- truth, via an approved ChangeSet. This migration is AUTHORED here but APPLIED by the
-- migration role.
--
-- The CHECK pins facet to the EXACT eight FKE-1.3 letters — out-of-enum is a DB-level
-- error, not a silent string (defense in depth alongside kernel/facets.Validate, the SOLE
-- legal validator). The single-letter `facet` column marks a record's PRIMARY lens; the
-- full collapsible facet-set lives in the record body (JSONB), validated by Validate.

-- kernel.truth.facet — the primary KRD lens of a frozen truth. Nullable: existing rows are
-- not yet facet-tagged; the constraint allows NULL but pins any non-null value.
ALTER TABLE kernel.truth
    ADD COLUMN IF NOT EXISTS facet text;

ALTER TABLE kernel.truth
    DROP CONSTRAINT IF EXISTS truth_facet_enum;
ALTER TABLE kernel.truth
    ADD CONSTRAINT truth_facet_enum CHECK (
        facet IS NULL OR facet IN (
            'F',
            'I',
            'S',
            'B',
            'R',
            'V',
            'M',
            'X'
        )
    );

-- mirrors.mirror.facet — the primary KRD lens of a mirror record (the mirrors schema
-- carries the facet alongside the truth_level, per the roadmap impact table). Same
-- expand-only contract.
ALTER TABLE mirrors.mirror
    ADD COLUMN IF NOT EXISTS facet text;

ALTER TABLE mirrors.mirror
    DROP CONSTRAINT IF EXISTS mirror_facet_enum;
ALTER TABLE mirrors.mirror
    ADD CONSTRAINT mirror_facet_enum CHECK (
        facet IS NULL OR facet IN (
            'F',
            'I',
            'S',
            'B',
            'R',
            'V',
            'M',
            'X'
        )
    );

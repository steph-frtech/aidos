-- S14: TruthKind + VerifiabilityLevel — typing the true before the ratchet bites.
-- Expand-only, append-only, ADDITIVE. Adds two NULLABLE epistemic-typing columns to
-- the kernel.truth record (KRD §13.4 / §13.5). Applied via Atlas (declarative); this
-- file is the canonical DDL source.
--
-- EXPAND-CONTRACT (CLAUDE.md §3/§9): the columns are added NULLABLE so existing rows
-- are untouched — NO backfill, NO NOT NULL flip this step (that contract tightening is
-- a LATER changeset once every live truth is typed). It does NOT alter, drop, or
-- NOT-NULL-flip any prior column; the S02 kernel.truth shape is otherwise unchanged.
--
-- THE WALL (CLAUDE.md §2): no GRANT is added/changed here. The agent role keeps its
-- SELECT-only on kernel.truth (granted in kernel_records_baseline.sql / S04 wall
-- grants); only the privileged aidos CLI role writes truth, via an approved ChangeSet.
-- This migration is AUTHORED here but APPLIED by the migration role.
--
-- CHECK constraints pin each value to the EXACT KRD enum member set, so an out-of-enum
-- value is a DB-level error, not a silent string (defense in depth alongside the pure
-- truthtyping.Classify boundary check). The enum lists are EXACTLY the seven §13.4
-- TruthKinds and the five §13.5 VerifiabilityLevels — no invented member.

-- truth_kind — the EPISTEMIC type of a truth (KRD §13.4). Nullable: existing rows
-- are not yet typed; the constraint allows NULL but pins any non-null value.
ALTER TABLE kernel.truth
    ADD COLUMN IF NOT EXISTS truth_kind text;

ALTER TABLE kernel.truth
    DROP CONSTRAINT IF EXISTS truth_truth_kind_enum;
ALTER TABLE kernel.truth
    ADD CONSTRAINT truth_truth_kind_enum CHECK (
        truth_kind IS NULL OR truth_kind IN (
            'behavioral',
            'structural',
            'experiential',
            'economic',
            'regulatory',
            'statistical',
            'exploratory'
        )
    );

-- verifiability_level — how strongly the truth's signal can be proven (KRD §13.5).
-- Nullable for the same expand-only reason; the constraint pins any non-null value.
ALTER TABLE kernel.truth
    ADD COLUMN IF NOT EXISTS verifiability_level text;

ALTER TABLE kernel.truth
    DROP CONSTRAINT IF EXISTS truth_verifiability_level_enum;
ALTER TABLE kernel.truth
    ADD CONSTRAINT truth_verifiability_level_enum CHECK (
        verifiability_level IS NULL OR verifiability_level IN (
            'deterministic',
            'statistical',
            'delayed',
            'human_judged',
            'unverifiable'
        )
    );

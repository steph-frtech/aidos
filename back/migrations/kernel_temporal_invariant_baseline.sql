-- S50: TemporalInvariant — "toute vérité temporelle doit déclarer son horloge" (KRD §49.3).
-- Expand-only, append-only, ADDITIVE. TWO backward-compatible moves, both reusing prior
-- surfaces (the S14 nullable-expand pattern + the S06 mirror enum) — neither is forked.
-- Applied via Atlas (declarative); this file is the canonical DDL source. It never alters,
-- drops, or NOT-NULL-flips a prior column — the S02 kernel.truth shape and the S06
-- mirrors.mirror_record shape are otherwise unchanged.
--
-- A TemporalInvariant is a first-class invariant KIND (KRD §49.3) whose property is
-- time-dependent and which MUST declare its clock (clock ∈ system | external | logical),
-- its tolerance (a duration), and a temporal mirror form (mirror ∈ statechart | tla+ |
-- uppaal). It is NOT the temporal AXIS of the DAG (the changeset edge — WHEN truths
-- changed — already exists) and NOT scope.TimeWindow (S15: the OPAQUE validity window,
-- NO clock). It rides INSIDE the content-addressed kernel.truth body (the S02 substrate)
-- as a NULLABLE `temporal` jsonb fragment — existing rows are untouched (NO backfill, NO
-- NOT-NULL flip), exactly the S14 expand-only discipline.
--
-- ── MOVE 1 (mirror side) — widen the S06 cert_language CHECK ──────────────────────────
-- The S06 mirrors.mirror_record.cert_language CHECK enum is WIDENED to admit the temporal
-- forms `statechart` and `tla+`. Widening a CHECK to admit MORE values is expand-only (no
-- existing row violates it). `uppaal` is NOT added here: no mirror_record row uses it yet,
-- and a dead enum member is a monster (§5 hook-honesty applied to enum members) — it is
-- added at the step that persists a catastrophic hard-real-time mirror row (§778). The
-- temporal Go enum still KNOWS uppaal (it is a §49.3 member) and the kernel.truth
-- temporal-fragment CHECK below admits all three; only the mirror_record cert_language
-- enum is conservatively widened to the two forms a row will actually use.
--
-- ── MOVE 2 (kernel side) — a nullable temporal fragment on kernel.truth ───────────────
-- A NULLABLE `temporal` jsonb column on kernel.truth marks a truth as temporal and holds
-- {property, antecedent, consequent, relation, bound, clock, tolerance, mirror}. NULL is
-- allowed (existing rows untouched). NOT a new truth_kind member: KRD §13.4 does NOT list
-- `temporal`, so NO §13.4 enum member is invented (honesty, CLAUDE.md §8) — the temporal
-- nature rides in this fragment + the mirror cert_language, never as a forged kind. A
-- CHECK pins clock ∈ {system, external, logical} and mirror ∈ {statechart, tla+, uppaal}
-- WHEN the fragment is present (defense in depth alongside the pure temporal.Validate).
--
-- THE WALL (CLAUDE.md §2): GRANTs UNCHANGED. The agent role keeps SELECT-only on
-- kernel.truth and mirrors.mirror_record (granted in kernel_records_baseline.sql /
-- mirror_record_baseline.sql / the S04 wall grants); only the privileged aidos CLI writer
-- role writes truth, via an approved ChangeSet. This migration is AUTHORED here, APPLIED
-- by the migration role; it opens NO write door.

-- ── MOVE 1: widen the S06 mirror_record cert_language CHECK to admit statechart + tla+ ──
-- The full enum is re-declared (the prior eleven forms + the two temporal forms) so the
-- constraint is a superset of S06 — no existing row violates it (expand-only).
ALTER TABLE mirrors.mirror_record
    DROP CONSTRAINT IF EXISTS mirror_record_cert_language_check;
ALTER TABLE mirrors.mirror_record
    ADD CONSTRAINT mirror_record_cert_language_check CHECK (
        cert_language IN (
            'gherkin', 'xstate', 'fast-check', 'rapid', 'zod', 'pact',
            'type-check', 'k6', 'fixture', 'snapshot', 'unit', 'prose',
            -- S50 temporal forms (KRD §49.3): widened in, expand-only.
            'statechart', 'tla+'
        )
    );

-- ── MOVE 2: a nullable temporal fragment on the S02 kernel.truth record ────────────────
-- Nullable: existing rows carry no temporal fragment; the constraint allows NULL but pins
-- the clock and mirror enums when the fragment is present.
ALTER TABLE kernel.truth
    ADD COLUMN IF NOT EXISTS temporal jsonb;

ALTER TABLE kernel.truth
    DROP CONSTRAINT IF EXISTS truth_temporal_clock_enum;
ALTER TABLE kernel.truth
    ADD CONSTRAINT truth_temporal_clock_enum CHECK (
        temporal IS NULL OR temporal->>'clock' IN (
            'system',
            'external',
            'logical'
        )
    );

ALTER TABLE kernel.truth
    DROP CONSTRAINT IF EXISTS truth_temporal_mirror_enum;
ALTER TABLE kernel.truth
    ADD CONSTRAINT truth_temporal_mirror_enum CHECK (
        temporal IS NULL OR temporal->>'mirror' IN (
            'statechart',
            'tla+',
            'uppaal'
        )
    );

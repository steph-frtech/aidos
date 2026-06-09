-- FK16 — the CONTRACT half of the E0-E7 migration (KRD FKE-16; ROADMAP FK16, the LAST step of the
-- FK track, "STRICTEMENT en dernier" because it touches the frozen-proven `mirrors` corpus).
--
-- FK05 was the EXPAND: it declared the N0-N5 → E0-E7 mapping ALONGSIDE the legacy N-levels,
-- modifying no schema. FK16 is the CONTRACT: the `mirrors.mirror_record` corpus flips to E0-E7.
-- This is a textbook EXPAND-CONTRACT migration (CLAUDE.md §3 Atlas, expand-contract, append-only):
--
--   • EXPAND (additive, this migration): add the new columns ALONGSIDE the existing ones —
--       evidence_level   ∈ E0..E7   (the derived evidence rung, now authoritative, NOT NULL once
--                                     backfilled; defaulted to 'E0' so the ADD is non-blocking)
--       n_lifecycle      ∈ active|deprecated  (the lifecycle of the legacy N-label)
--     and BACKFILL evidence_level from the deterministic FK16 derivation (CertToE/KindToE/MirrorE,
--     replicated here as a SQL CASE so the in-place backfill matches the Go function byte-for-byte).
--
--   • The legacy proof-typing stays: the existing test_kind / cert_language columns are UNTOUCHED.
--     N is NEVER dropped. FK16's rule — "N déprécié via lifecycle, jamais supprimé (append-only)":
--     we DEPRECATE by setting n_lifecycle='deprecated', we never DROP a column, never DELETE a row.
--     The N-label (carried by test_kind/cert_language, the build-time source) remains fully
--     inspectable for provenance; only the AUTHORITY moves to evidence_level.
--
--   • The CONTRACT phase proper (a later, separate migration, once every reader reads E) would only
--     ever RE-STATE that N is read-only — it would still not drop it. Anti-overwrite (CLAUDE.md §9):
--     "deprecate via lifecycle", "supersede via version" — never destroy a truth.
--
-- GATED BY DataTruthScope (FK16 done-criterion: "migration expand-contract gated DataTruthScope").
-- This migration TOUCHES EXISTING DATA (it backfills evidence_level on every historical mirror
-- row) — that is a DataTruthScope.HistoricalImpact change (back/gen/db/datatruthscope.go). It is
-- legal precisely because it is expand-contract + additive + non-destructive: the backfill writes a
-- new column, it loses no row and erases no N. The data-migration gate (back/mcp/datamigrate) MUST
-- classify it HistoricalImpact and approve it as a non-destructive expand before it is applied.
--
-- ZÉRO PERTE (FK16 done-criterion: "chaque miroir N porte son E"). Every existing row gets its E
-- backfilled from the SAME deterministic mapping the Go contracte package uses; no row is skipped,
-- no N is erased. The Go Testcontainers test (records_db_test, contracte_db_test) proves the
-- backfilled evidence_level equals MirrorE(test_kind, cert_language) for every row — the parity
-- mirror of the bascule.
--
-- THE WALL (CLAUDE.md §2): unchanged. The agent role keeps SELECT-only on mirrors.mirror_record;
-- INSERT/UPDATE/DELETE/TRUNCATE stay revoked. This migration is applied by the privileged `aidos`
-- writer role through an approved ChangeSet, never by the agent. It opens NO new write door.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the CHECK constraints are guarded; the backfill is a
-- conditional UPDATE that re-runs harmlessly. Applied via Atlas (declarative, forward-only).

-- ── EXPAND: add evidence_level (E0..E7) alongside test_kind/cert_language (untouched) ──────────
-- Defaulted to 'E0' so the ADD COLUMN is non-blocking on a populated table; the backfill below sets
-- the real derived rung. CHECK pins the closed E0..E7 enum (declared, never learned — CLAUDE.md §8).
ALTER TABLE mirrors.mirror_record
    ADD COLUMN IF NOT EXISTS evidence_level TEXT NOT NULL DEFAULT 'E0';

ALTER TABLE mirrors.mirror_record
    DROP CONSTRAINT IF EXISTS mirror_record_evidence_level_check;
ALTER TABLE mirrors.mirror_record
    ADD CONSTRAINT mirror_record_evidence_level_check
        CHECK (evidence_level IN ('E0','E1','E2','E3','E4','E5','E6','E7'));

-- ── EXPAND: add n_lifecycle (active|deprecated) — the legacy N-label's stage ───────────────────
-- The N-label is carried by test_kind/cert_language (the build-time source). n_lifecycle records
-- whether that source is still authoritative (active) or preserved-for-provenance only (deprecated,
-- post-FK16). It is NEVER dropped. New rows default to 'active'; the backfill flips the corpus to
-- 'deprecated' as the bascule throws the switch.
ALTER TABLE mirrors.mirror_record
    ADD COLUMN IF NOT EXISTS n_lifecycle TEXT NOT NULL DEFAULT 'active';

ALTER TABLE mirrors.mirror_record
    DROP CONSTRAINT IF EXISTS mirror_record_n_lifecycle_check;
ALTER TABLE mirrors.mirror_record
    ADD CONSTRAINT mirror_record_n_lifecycle_check
        CHECK (n_lifecycle IN ('active','deprecated'));

-- ── BACKFILL: derive evidence_level for every existing row (ZÉRO PERTE) ────────────────────────
-- The SAME deterministic mapping the Go contracte.MirrorE uses, expressed as SQL so the in-place
-- backfill matches the function byte-for-byte (the parity mirror asserts it). RULE:
--   • a NON-executable cert (prose) → E0 (no evidence; KRD §805), regardless of test_kind;
--   • otherwise E = MAX(CertToE(cert_language), KindToE(test_kind)).
-- We compute both lenses as numeric ranks, take the max, and stamp the 'E<n>' label.
WITH ranked AS (
    SELECT
        id,
        CASE WHEN cert_language = 'prose' THEN 0
             ELSE GREATEST(
                 -- CertToE rank
                 CASE cert_language
                     WHEN 'gherkin'    THEN 3
                     WHEN 'xstate'     THEN 3
                     WHEN 'fast-check' THEN 5
                     WHEN 'rapid'      THEN 5
                     WHEN 'zod'        THEN 1
                     WHEN 'pact'       THEN 3
                     WHEN 'type-check' THEN 1
                     WHEN 'k6'         THEN 5
                     WHEN 'fixture'    THEN 3
                     WHEN 'snapshot'   THEN 2
                     WHEN 'unit'       THEN 2
                     ELSE 0
                 END,
                 -- KindToE rank
                 CASE test_kind
                     WHEN 'acceptance' THEN 3
                     WHEN 'e2e'        THEN 3
                     WHEN 'property'   THEN 5
                     WHEN 'fixture'    THEN 3
                     WHEN 'contract'   THEN 3
                     WHEN 'schema'     THEN 1
                     WHEN 'unit'       THEN 2
                     WHEN 'snapshot'   THEN 2
                     WHEN 'meter'      THEN 6
                     ELSE 0
                 END
             )
        END AS e_rank
    FROM mirrors.mirror_record
)
UPDATE mirrors.mirror_record m
SET evidence_level = 'E' || ranked.e_rank::TEXT,
    n_lifecycle    = 'deprecated'
FROM ranked
WHERE m.id = ranked.id;

-- Helpful index for the E-panel histogram and the "mirrors attaining E≥X" queries.
CREATE INDEX IF NOT EXISTS mirror_record_evidence_level_idx
    ON mirrors.mirror_record (evidence_level);

-- ── The wall: SELECT-only for the agent on the (now E-typed) mirror record — unchanged ─────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;
GRANT USAGE ON SCHEMA mirrors TO aidos_agent;
GRANT SELECT ON mirrors.mirror_record TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror_record FROM aidos_agent;

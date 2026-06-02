-- S27: Ideas lifecycle baseline migration.
-- Expand-only, append-only. Reuses the S02 ideas.idea content-addressed table
-- (back/migrations/kernel_records_baseline.sql) — it does NOT redeclare or alter
-- the table shape (id/body/version/superseded_by/created_at). It adds:
--   (1) a CHECK that the lifecycle status held in the body is one of the closed
--       five (draft|grilled|spiking|harvested|rejected) — no sixth status;
--   (2) the lifecycle GRANTs: the agent role may capture and ADVANCE ideas
--       (INSERT/SELECT/UPDATE on ideas.idea) because the ideas schema is STAGING
--       ABOVE the wall (CLAUDE.md §2) — an idea is a candidate, not yet a truth.
--       The wall is UNCHANGED: the agent still has NO write grant on the kernel /
--       mirrors / fitness schemas (those stay SELECT-only). The asymmetry IS the
--       contract: ideas writable above the wall, truth not.
--
-- An idea has NO version-freeze and NO mirror column — by construction it cannot
-- carry the thing that would make it a truth (KRD §118). The `version` column on
-- ideas.idea is the S02 content-address (= id), NOT a freeze: it is the same hash,
-- the "licence to change", not a promotion. The promotion to a kernel truth is the
-- aidos CLI role via the /goal flow, never this agent role.
--
-- A rejected idea is KEPT (traced, append-only): rejection is an UPDATE of the
-- status in the body to 'rejected' with a reject_reason — never a DELETE.

-- (1) Lifecycle status CHECK on the body — the closed five, nothing else.
-- Idempotent: dropped-if-exists then re-added so re-applying the declarative
-- migration is safe (Atlas expand semantics).
ALTER TABLE ideas.idea
    DROP CONSTRAINT IF EXISTS idea_status_lifecycle_chk;
ALTER TABLE ideas.idea
    ADD CONSTRAINT idea_status_lifecycle_chk
    CHECK (body ->> 'status' IN ('draft', 'grilled', 'spiking', 'harvested', 'rejected'));

-- (2) Lifecycle GRANTs — the ideas schema is staging ABOVE the wall. The agent
-- role (created in S01/S02) may capture and advance candidate-truths.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA ideas TO aidos_agent;

-- INSERT (capture), SELECT (triage/read), UPDATE (advance status / trace reject).
-- DELETE is deliberately NOT granted: a rejected idea is kept (append-only/traced).
GRANT INSERT, SELECT, UPDATE ON ideas.idea TO aidos_agent;
REVOKE DELETE, TRUNCATE ON ideas.idea FROM aidos_agent;

-- The wall is UNCHANGED. Re-assert SELECT-only on the truth schemas so this
-- migration provably does not weaken S02/S04: the agent can NEVER write the kernel
-- or the mirrors here. Promotion of an idea writes a kernel truth via the aidos CLI
-- role through /goal, gated by the promotion-gate hook (NO_MIRROR_NO_KERNEL).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.truth   FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.layer   FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link    FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror FROM aidos_agent;

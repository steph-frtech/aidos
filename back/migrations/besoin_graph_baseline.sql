-- EL15: the `besoin` schema baseline migration — the persistence behind the
-- besoin-intake MCP (the capability door over the BesoinGraph, ROADMAP EL15).
--
-- Expand-only, append-only. The `besoin` schema is a NEED store ABOVE the wall —
-- DISTINCT from the truth-store (kernel/mirrors/fitness), NOT an exception to the
-- wall (CLAUDE.md §2 + ROADMAP scope paragraph). A BesoinGraph and its LevelNodes
-- carry NEITHER a version-freeze NOR a mirror — by construction (the double absence,
-- EL03): a need never freezes here; promotion to truth is the app-builder writing the
-- mirror via /goal, by the aidos CLI role, never this agent role.
--
-- It adds:
--   (1) the `besoin` schema + `besoin.node` table — append-only rows, one per CAPTURE
--       turn (the in-memory interview accumulates an answer; each persisted capture is
--       a ROW, the history kept). Content-addressed by the BesoinGraph graph_hash so a
--       re-capture of the identical graph is a NO-OP (ON CONFLICT DO NOTHING);
--   (2) PROJECT ISOLATION via Row-Level Security (S55 forward dependency, modelled
--       here): each row carries its `project`; an RLS policy keyed on the session GUC
--       `aidos.project` makes project A's rows invisible to a session scoped to B.
--       Until S55 back-fills the typed ProjectScope, isolation is the RLS policy here;
--   (3) the GRANTs: the agent role may capture/read/advance the NEED graph
--       (INSERT/SELECT/UPDATE on besoin.node) and reuse `ideas.idea` (capture the Ideas
--       the mapping rungs emit, EL05). The wall is UNCHANGED — re-asserted SELECT-only
--       on kernel/mirrors, NO GRANT on fitness. The asymmetry IS the contract.

-- (1) The need schema + node table.
CREATE SCHEMA IF NOT EXISTS besoin;

-- besoin.node — one row per CAPTURE turn (append-only). graph_hash is the
-- content-address of the BesoinGraph after the turn (records.Hash(Canonicalize)),
-- so an identical re-capture lands on the SAME id (idempotent door, no duplicate).
-- `project` scopes the row (EL19 multi-project); `level` is the rung captured; `body`
-- is the canonical BesoinGraph JSONB (round-tripped losslessly). NO version-freeze,
-- NO mirror column — the double absence is enforced by a CHECK below.
CREATE TABLE IF NOT EXISTS besoin.node (
    id          TEXT        NOT NULL,
    project     TEXT        NOT NULL,
    level       TEXT        NOT NULL,
    body        JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT besoin_node_pkey PRIMARY KEY (id)
);

-- The DOUBLE ABSENCE (EL03/the wall): the canonical body never carries a `version`
-- (freeze) nor a `mirror` (proof) key. A row that smuggled one in would be a truth in
-- the need store — refused here, by CHECK, never by opinion.
ALTER TABLE besoin.node
    DROP CONSTRAINT IF EXISTS besoin_node_double_absence_chk;
ALTER TABLE besoin.node
    ADD CONSTRAINT besoin_node_double_absence_chk
    CHECK (NOT (body ? 'version') AND NOT (body ? 'mirror'));

-- An index for the project-scoped listing (the besoin_list tool reads by project).
CREATE INDEX IF NOT EXISTS besoin_node_project_idx ON besoin.node (project);

-- (2) PROJECT ISOLATION — Row-Level Security (S55 forward dependency, modelled here).
-- Each session sets the GUC `aidos.project`; the policy below makes a row visible only
-- when its `project` equals that GUC. Project A's graph is invisible to a B-scoped
-- session (the ROADMAP done-criterion: "projets isolés RLS"). The owner/superuser
-- bypasses RLS (the test harness applies the migration as owner), so the MCP role is
-- the one the policy gates.
ALTER TABLE besoin.node ENABLE ROW LEVEL SECURITY;
ALTER TABLE besoin.node FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS besoin_node_project_isolation ON besoin.node;
CREATE POLICY besoin_node_project_isolation ON besoin.node
    USING (project = current_setting('aidos.project', true))
    WITH CHECK (project = current_setting('aidos.project', true));

-- (3) GRANTs — the besoin schema is a NEED store ABOVE the wall.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA besoin TO aidos_agent;

-- INSERT (capture a turn), SELECT (read/state/list), UPDATE (advance). DELETE is NOT
-- granted: the need graph is append-only (a row is never destroyed).
GRANT INSERT, SELECT, UPDATE ON besoin.node TO aidos_agent;
REVOKE DELETE, TRUNCATE ON besoin.node FROM aidos_agent;

-- The RLS policy gates the agent role even though the policy is USING/CHECK — make the
-- role subject to RLS explicitly (it is not the table owner).
ALTER ROLE aidos_agent SET row_security = on;

-- The wall is UNCHANGED. Re-assert SELECT-only on the truth schemas so this migration
-- provably does not weaken S02/S04/S27: the agent can NEVER write the kernel or the
-- mirrors here. Promotion of a need to a truth writes a kernel truth via the aidos CLI
-- role through /goal, gated by the promotion-gate hook (NO_MIRROR_NO_KERNEL).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.truth   FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.layer   FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link    FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror FROM aidos_agent;

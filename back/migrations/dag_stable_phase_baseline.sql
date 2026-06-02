-- S23: the stable phase node — dag.stable_phase. A coherent cut in the version DAG
-- (KRD §43, §44): one version selected per constraint such that EVERY link resolves
-- (S17 green) AND EVERY sensor is green at once — the kernel's LOCKFILE. Expand-only,
-- append-only, ADDITIVE. It NEVER alters or drops a prior table — the S02 dag.phase
-- shape (id, body, version, superseded_by, created_at) is UNTOUCHED, and the S02/S04
-- wall GRANTs are unchanged.
--
-- WHY A NAMED TABLE (the S23 spec, consistent with the S18/S19/S20 side-table pattern):
-- S02 already created a generic content-addressed dag.phase node. S23 lands the
-- STABLE-PHASE-specific node the spec names — dag.stable_phase — carrying the §44 DAG
-- EDGE (the `parent` back-reference to the prior phase node) that dag.phase does not
-- have, WITHOUT an ALTER of the prior table (forbidden, anti-overwrite, CLAUDE.md §9).
-- The two phases of §44 are NODES; ChangeSets are the temporal EDGES — here a phase node
-- additionally records its single `parent` edge endpoint (append-only; branches/merges/
-- reverts are later Archive steps, not here).
--
-- THE WALL (CLAUDE.md §2): dag is a TRUTH schema ABOVE the waterline. The agent DB role
-- gets SELECT ONLY on dag.stable_phase — it may READ the recorded cut for the
-- /phase-stable panel and `aidos stable`, but it can NEVER write a phase node. Only the
-- privileged `aidos` CLI writer role INSERTs a phase node, via an approved ChangeSet
-- (the changeset commit-gate). This migration opens NO write door above the line for the
-- agent. UPDATE/DELETE/TRUNCATE are withheld from BOTH roles on the agent side: a phase
-- is content-addressed and IMMUTABLE — a new cut is a NEW node (a new hash), never an
-- in-place edit (KRD §12, append-only).
--
-- CONTENT-ADDRESSED: id = version = SHA-256 of the canonical cut body (S02
-- records.Canonicalize + records.Hash, reused — never forked). The cut/sensor_status/
-- stable/reasons all live INSIDE the JSONB body (a set of version-pinned refs, NOT
-- foreign keys) so a recorded phase stays inspectable AFTER the head moves.
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative. The Go Testcontainers suite (back/archive/phases) applies the S02 baseline
-- (which creates the dag schema + dag.phase) then this baseline against a throwaway real
-- Postgres on every `go test`.

CREATE SCHEMA IF NOT EXISTS dag;

-- dag.stable_phase — one immutable, content-addressed node per recorded stable phase.
--   id            : SHA-256 of the canonical cut body (= the phase's content address).
--   body          : the FULL recorded fact as JSONB — {cut, sensor_status, stable, reasons}.
--                   The cut is the constraintId→version selection; sensor_status the S07
--                   snapshot; stable the derived verdict; reasons the offending ids (empty
--                   iff stable). The body stays inspectable after the head moves.
--   version       : = id (content address; the phase is its own version).
--   parent        : the prior phase node this one descends from — the §44 DAG EDGE
--                   endpoint. NULL for a root phase (the first cut). Append-only.
--   created_at    : insertion time (append-only audit).
CREATE TABLE IF NOT EXISTS dag.stable_phase (
    id         TEXT        NOT NULL,
    body       JSONB       NOT NULL,
    version    TEXT        NOT NULL,
    parent     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stable_phase_pkey PRIMARY KEY (id),
    -- content-addressed: the node IS its own version.
    CONSTRAINT stable_phase_content_address CHECK (version = id)
);

-- Fast "walk the DAG edge to a phase's parent" lookup (the §44 temporal axis).
CREATE INDEX IF NOT EXISTS stable_phase_parent_idx
    ON dag.stable_phase (parent);

-- ── Roles (guard in case this migration runs before S01/S04) ──────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END
$$;

-- The wall (CLAUDE.md §2): dag is above the waterline. The agent role gets SELECT ONLY —
-- it reads the recorded cut for /phase-stable + `aidos stable`, but NEVER writes a phase
-- node. All writes are revoked from the agent.
GRANT USAGE  ON SCHEMA dag             TO aidos_agent;
GRANT SELECT ON dag.stable_phase       TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON dag.stable_phase FROM aidos_agent;

-- The `aidos` writer role: the single door to truth — INSERT + SELECT through an approved
-- ChangeSet (the changeset commit-gate). UPDATE/DELETE withheld: a phase is content-
-- addressed and IMMUTABLE — a changed cut is a NEW node (a new hash), never an in-place
-- edit (append-only).
GRANT USAGE          ON SCHEMA dag       TO aidos;
GRANT SELECT, INSERT ON dag.stable_phase TO aidos;

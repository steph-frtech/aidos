-- S20: ChangeSet lifecycle (KRD §44, §98, §44.1) — the DECLARED, content-addressed, append-only
-- lifecycle truth the changeset state machine (back/archive/changeset) reads/writes through the
-- approved flow. Expand-only, append-only, ADDITIVE. It NEVER alters or drops a prior table — the
-- S02 changesets.changeset shape (id, body, version, superseded_by, created_at) is UNTOUCHED.
--
-- WHY A SIDE TABLE (consistent with S18/S19): the S02 changesets.changeset already stores the
-- content-addressed envelope body (id = SHA-256 of the canonical {spec_delta, mirror_delta,
-- parent_phase, label, reverts} body — the atomic spec+mirror pair lives INSIDE that JSONB so they
-- can never be stored apart). S20 adds the LIFECYCLE STAMP — the DRAFT|APPLIED|REVERTED status, the
-- applied_at commit timestamp, and the reverts back-reference — WITHOUT an ALTER of the prior table
-- (forbidden, anti-overwrite). The status CHECK is the closed three-set wall the engine's Status
-- mirrors at the DB level: there is NO FAILED.
--
-- THE STATUS WALL (KRD §44): the CHECK pins the closed set {DRAFT, APPLIED, REVERTED}. A row's
-- transition to APPLIED (and the REVERTED stamp on a source when its inverse applies) is written
-- ONLY by the privileged `aidos` writer role through the approved ChangeSet flow (the changeset MCP,
-- the commit-gate). The agent role gets SELECT only (the wall, CLAUDE.md §2).

-- changesets.changeset_lifecycle — the append-only lifecycle stamp for an envelope. One row per
-- changeset id (the S02 changesets.changeset content hash it qualifies). The status CHECK is the
-- closed-set wall; applied_at is non-null iff status has reached APPLIED; reverts back-references
-- the source id for an inverse envelope. The head moves by INSERTing a new lifecycle row (append-
-- only), never destroying history.
CREATE TABLE IF NOT EXISTS changesets.changeset_lifecycle (
    id            TEXT        NOT NULL,            -- SHA-256 of the canonical envelope body (= changesets.changeset.id)
    status        TEXT        NOT NULL,            -- KRD §44 closed set: DRAFT | APPLIED | REVERTED (NO FAILED)
    parent_phase  TEXT,                            -- the stable phase this envelope moves from (a single DAG edge)
    reverts       TEXT,                            -- the source changeset id this envelope is the inverse of (NULL unless a revert)
    applied_at    TIMESTAMPTZ,                     -- the commit timestamp; NULL until APPLIED
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT changeset_lifecycle_pkey PRIMARY KEY (id, version),
    -- the closed three-status set (KRD §44): there is NO FAILED — a hard-errored DRAFT is discarded.
    CONSTRAINT changeset_lifecycle_status_enum
        CHECK (status IN ('DRAFT', 'APPLIED', 'REVERTED')),
    -- applied_at is set iff the envelope has been committed (APPLIED or, later, stamped REVERTED).
    CONSTRAINT changeset_lifecycle_applied_at_iff_committed
        CHECK ((status = 'DRAFT') = (applied_at IS NULL))
);

-- changesets.changeset_envelope — a READ-ONLY VIEW joining the S02 envelope body to its S20
-- lifecycle stamp, surfacing the atomic spec+mirror pair together with the status/applied_at/reverts
-- for the /changeset panel and the engine. It introduces NO new write door and stores NO new fact:
-- it projects the head changeset row + its latest lifecycle stamp. Spec and mirror are read out of
-- the ONE body so it is visible they cannot drift.
CREATE OR REPLACE VIEW changesets.changeset_envelope AS
SELECT
    c.id                                   AS id,
    c.body ->> 'label'                     AS label,
    l.status                               AS status,
    l.parent_phase                         AS parent_phase,
    c.body -> 'spec_delta'                 AS spec_delta,
    c.body -> 'mirror_delta'               AS mirror_delta,
    l.reverts                              AS reverts,
    l.applied_at                           AS applied_at,
    l.version                              AS lifecycle_version,  -- the lifecycle stamp version (v1, v2, …)
    c.version                              AS version,
    c.superseded_by                        AS superseded_by
FROM changesets.changeset c
LEFT JOIN changesets.changeset_lifecycle l ON l.id = c.id;

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

-- The wall (CLAUDE.md §2): SELECT-only for the agent role on the new lifecycle table + the view;
-- all writes revoked. The agent reads the envelope lifecycle for /changeset but NEVER writes truth.
GRANT USAGE  ON SCHEMA changesets                       TO aidos_agent;
GRANT SELECT ON changesets.changeset_lifecycle          TO aidos_agent;
GRANT SELECT ON changesets.changeset_envelope           TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON changesets.changeset_lifecycle FROM aidos_agent;

-- The `aidos` writer role: the single door to truth — INSERT + SELECT through an approved ChangeSet
-- (the changeset MCP / the commit-gate). UPDATE/DELETE withheld: the lifecycle log is APPEND-ONLY —
-- a status change (DRAFT→APPLIED, APPLIED→REVERTED) is a NEW lifecycle row (supersedes by version),
-- never an in-place edit (an APPLIED envelope is IMMUTABLE).
GRANT USAGE          ON SCHEMA changesets              TO aidos;
GRANT SELECT, INSERT ON changesets.changeset_lifecycle TO aidos;
GRANT SELECT, INSERT ON changesets.changeset           TO aidos;

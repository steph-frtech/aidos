-- S11: Control-spec + Action-spec AST table baseline migration
-- Expand-only, append-only. Adds the content-addressed `kernel.control` and
-- `kernel.action` tables that store a typed control-spec / action-spec AST (KRD
-- §24.1/§24.2/§94: a button-as-source and the action that binds it to an operation).
-- Applied via Atlas (declarative); this file is the canonical DDL source. It NEVER
-- alters or drops a prior table or GRANT (S01 archive, S02 kernel records, S04 wall
-- grants, S05 mirror_runs, S07 sensor_runs, S08 kernel.expr, S09 kernel.policy all
-- untouched). The S04 PreToolUse hook + the GRANTs below are the wall.
--
-- Each row is content-addressed and append-only (the SAME scheme as S02 records /
-- S08 expr / S09 policy — never a forked hashing path):
--   id            = SHA-256 hex of the canonical body JSONB (records.Hash(Canonicalize))
--   body          = the canonical body JSONB (one control-spec / action-spec)
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at    = insertion time
-- Append-only: a row is NEVER updated or deleted. The head moves by INSERTing a new
-- row and closing the prior row's superseded_by. The `triggers` (control→action) and
-- `binds` (action→operation) links are version-pinned refs INSIDE the body (KRD §23,
-- §28 link types), NOT new tables.
--
-- The agent role gets SELECT only (the wall, CLAUDE.md §2) — it can READ a control /
-- action AST but NEVER write one. Only the privileged `aidos` writer role inserts a
-- control / action AST, via an approved ChangeSet.

-- The kernel schema already exists (S02 created it). Guard for out-of-order apply.
CREATE SCHEMA IF NOT EXISTS kernel;

-- kernel.control — a typed control-spec AST, content-addressed and append-only. KRD §24.1.
CREATE TABLE IF NOT EXISTS kernel.control (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT control_pkey PRIMARY KEY (id),
    -- The content-address invariant, enforced in-database: version == id (both are
    -- the hash of the canonical body). A row whose version drifts from its id is a
    -- non-content-addressed row and is refused.
    CONSTRAINT control_content_addressed CHECK (version = id)
);

-- kernel.action — a typed action-spec AST, content-addressed and append-only. KRD §24.2.
CREATE TABLE IF NOT EXISTS kernel.action (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT action_pkey PRIMARY KEY (id),
    CONSTRAINT action_content_addressed CHECK (version = id)
);

-- The agent DB role (S01 created it as NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- The privileged writer role (S04 created it; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END
$$;

-- ── The wall on kernel.control / kernel.action ───────────────────────────────
-- The agent: USAGE on the schema (already granted by S02/S04) + SELECT ONLY on the
-- new tables. No INSERT/UPDATE/DELETE/TRUNCATE — it cannot write truth here.
GRANT USAGE  ON SCHEMA kernel  TO aidos_agent;
GRANT SELECT ON kernel.control TO aidos_agent;
GRANT SELECT ON kernel.action  TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.control FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.action  FROM aidos_agent;

-- The aidos writer role: the single door to truth — full write through an approved
-- ChangeSet (DELETE withheld: truth is append-only, never destroyed).
GRANT USAGE                  ON SCHEMA kernel  TO aidos;
GRANT SELECT, INSERT, UPDATE ON kernel.control TO aidos;
GRANT SELECT, INSERT, UPDATE ON kernel.action  TO aidos;

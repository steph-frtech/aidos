-- S08: Expr DSL AST table baseline migration
-- Expand-only, append-only. Adds the content-addressed `kernel.expr` table that
-- stores a typed Expr DSL AST (KRD §24.5: lit/ref/call/obj/arr, a closed function
-- catalogue, $-rooted refs). Applied via Atlas (declarative); this file is the
-- canonical DDL source. It NEVER alters or drops a prior table or GRANT (S01
-- archive, S02 kernel records, S04 wall grants, S05 mirror_runs, S07 sensor_runs
-- all untouched). The S04 PreToolUse hook + the GRANTs below are the wall.
--
-- Each row is content-addressed and append-only (same scheme as S02 records):
--   id            = SHA-256 hex of the canonical AST JSONB (expr.Canonicalize)
--   ast           = the canonical AST JSONB (one node tree)
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at    = insertion time
-- Append-only: an AST row is NEVER updated or deleted. The head moves by INSERTing
-- a new row and closing the prior row's superseded_by. The agent role gets SELECT
-- only (the wall, CLAUDE.md §2) — it can READ an Expr AST but NEVER write one.
-- Only the privileged `aidos` writer role inserts an Expr AST, via an approved
-- ChangeSet.

-- The kernel schema already exists (S02 created it). Guard for out-of-order apply.
CREATE SCHEMA IF NOT EXISTS kernel;

-- kernel.expr — a typed Expr DSL AST, content-addressed and append-only. KRD §24.5.
CREATE TABLE IF NOT EXISTS kernel.expr (
    id            TEXT        NOT NULL,
    ast           JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT expr_pkey PRIMARY KEY (id),
    -- The content-address invariant, enforced in-database: version == id (both are
    -- the hash of the canonical AST). A row whose version drifts from its id is a
    -- non-content-addressed row and is refused.
    CONSTRAINT expr_content_addressed CHECK (version = id)
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

-- ── The wall on kernel.expr ──────────────────────────────────────────────────
-- The agent: USAGE on the schema (already granted by S02/S04) + SELECT ONLY on
-- the new table. No INSERT/UPDATE/DELETE/TRUNCATE — it cannot write truth here.
GRANT USAGE  ON SCHEMA kernel TO aidos_agent;
GRANT SELECT ON kernel.expr   TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.expr FROM aidos_agent;

-- The aidos writer role: the single door to truth — full write through an
-- approved ChangeSet (DELETE withheld: truth is append-only, never destroyed).
GRANT USAGE                  ON SCHEMA kernel TO aidos;
GRANT SELECT, INSERT, UPDATE ON kernel.expr   TO aidos;

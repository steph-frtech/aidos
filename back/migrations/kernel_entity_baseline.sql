-- S35: Entity source AST table baseline migration.
-- Expand-only, append-only. Adds the content-addressed `kernel.entity` table that
-- stores a typed entity AST (KRD §23/§26: `kind: entity` = the data model, a SOURCE
-- layer, human / ABOVE the waterline). Applied via Atlas (declarative); this file is
-- the canonical DDL source. It NEVER alters or drops a prior table or GRANT (S01
-- archive, S02 kernel records, S04 wall grants, S08 expr, S09 policy, S11
-- control/action, … all untouched). The S04 PreToolUse hook + the GRANTs below are
-- the wall.
--
-- An entity is a SOURCE above the line: the agent READS it (SELECT-only) and NEVER
-- writes it. Its three emitted outputs — the Go struct, the TS type, the Postgres DDL
-- (back/gen/order-entity/*, front/web/gen/order-entity/*) — are PROJECTIONS below the
-- line, derived from this source, never hand-edited, guarded by S35's mirror.
--
-- Each row is content-addressed and append-only (the SAME scheme as S02 records / S08
-- expr / S09 policy / S11 control — never a forked hashing path):
--   id            = SHA-256 hex of the canonical body JSONB (records.Hash(Canonicalize))
--   body          = the canonical body JSONB { name, attributes:[{name,type,required,
--                   identifier?,multivalued?}] } — attributes ORDERED (order is semantic)
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at    = insertion time
-- Append-only: a row is NEVER updated or deleted. The head moves by INSERTing a new
-- row and closing the prior row's superseded_by.

-- The kernel schema already exists (S02 created it). Guard for out-of-order apply.
CREATE SCHEMA IF NOT EXISTS kernel;

-- kernel.entity — a typed entity AST, content-addressed and append-only. KRD §23/§26.
CREATE TABLE IF NOT EXISTS kernel.entity (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT entity_pkey PRIMARY KEY (id),
    -- The content-address invariant, enforced in-database: version == id (both are the
    -- hash of the canonical body). A row whose version drifts from its id is a
    -- non-content-addressed row and is refused.
    CONSTRAINT entity_content_addressed CHECK (version = id)
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

-- ── The wall on kernel.entity ───────────────────────────────────────────────
-- The agent: USAGE on the schema (already granted by S02/S04) + SELECT ONLY on the
-- new table. No INSERT/UPDATE/DELETE/TRUNCATE — it cannot write truth here: an entity
-- is human-frozen truth above the line (CLAUDE.md §2).
GRANT USAGE  ON SCHEMA kernel TO aidos_agent;
GRANT SELECT ON kernel.entity TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.entity FROM aidos_agent;

-- The aidos writer role: the single door to truth — full write through an approved
-- ChangeSet (DELETE withheld: truth is append-only, never destroyed).
GRANT USAGE                  ON SCHEMA kernel TO aidos;
GRANT SELECT, INSERT, UPDATE ON kernel.entity TO aidos;

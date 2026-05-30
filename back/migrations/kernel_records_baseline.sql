-- S02: KRDCore record schemas baseline migration
-- Expand-only, append-only. Creates the seven content-addressed JSONB record
-- tables in their canonical Postgres schemas. Applied via Atlas (declarative);
-- this file is the canonical DDL source. It never alters or drops a prior table
-- (S01 archive untouched).
--
-- Each row is content-addressed and append-only:
--   id            = SHA-256 hex of the canonical JSONB body (the content address)
--   body          = the canonical JSONB (records.Canonicalize output)
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at    = insertion time
-- Append-only: a row body is NEVER updated or deleted. The head moves by INSERTing
-- a new row and closing the prior row's superseded_by. Below, the agent role gets
-- SELECT only (the wall, CLAUDE.md §2) — it cannot write truth at all here.

-- Canonical truth schemas (above the line; see the schema → holds table in CLAUDE.md §1).
CREATE SCHEMA IF NOT EXISTS ideas;
CREATE SCHEMA IF NOT EXISTS kernel;
CREATE SCHEMA IF NOT EXISTS mirrors;
CREATE SCHEMA IF NOT EXISTS changesets;
CREATE SCHEMA IF NOT EXISTS dag;

-- ideas.idea — candidate-truths (no freeze, no mirror). KRD §118.
CREATE TABLE IF NOT EXISTS ideas.idea (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT idea_pkey PRIMARY KEY (id)
);

-- kernel.truth — frozen, falsifiable Kernel truths with epistemic typing.
CREATE TABLE IF NOT EXISTS kernel.truth (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT truth_pkey PRIMARY KEY (id)
);

-- kernel.layer — the single meta-type from which every truth is built. KRD §21.
CREATE TABLE IF NOT EXISTS kernel.layer (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT layer_pkey PRIMARY KEY (id)
);

-- kernel.link — the six link types; everything points at a version. KRD §41.
CREATE TABLE IF NOT EXISTS kernel.link (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT link_pkey PRIMARY KEY (id)
);

-- mirrors.mirror — the executable proof of a truth (mirror records). KRD §34.
CREATE TABLE IF NOT EXISTS mirrors.mirror (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT mirror_pkey PRIMARY KEY (id)
);

-- changesets.changeset — the atomic reversible transition envelope. KRD §98.
CREATE TABLE IF NOT EXISTS changesets.changeset (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT changeset_pkey PRIMARY KEY (id)
);

-- dag.phase — a stable phase (coherent cut: all links resolve, all sensors green). KRD §43.
CREATE TABLE IF NOT EXISTS dag.phase (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT phase_pkey PRIMARY KEY (id)
);

-- The wall, in-database (CLAUDE.md §2). The agent role exists (S01 created it).
-- On these truth schemas the agent gets SELECT ONLY — no INSERT/UPDATE/DELETE.
-- It may READ a typed truth-record but can NEVER write truth here. Only the
-- privileged aidos CLI role writes, via an approved ChangeSet.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA ideas      TO aidos_agent;
GRANT USAGE ON SCHEMA kernel     TO aidos_agent;
GRANT USAGE ON SCHEMA mirrors    TO aidos_agent;
GRANT USAGE ON SCHEMA changesets TO aidos_agent;
GRANT USAGE ON SCHEMA dag        TO aidos_agent;

-- SELECT only on every record table (the wall). No write of any kind.
GRANT SELECT ON ideas.idea            TO aidos_agent;
GRANT SELECT ON kernel.truth          TO aidos_agent;
GRANT SELECT ON kernel.layer          TO aidos_agent;
GRANT SELECT ON kernel.link           TO aidos_agent;
GRANT SELECT ON mirrors.mirror        TO aidos_agent;
GRANT SELECT ON changesets.changeset  TO aidos_agent;
GRANT SELECT ON dag.phase             TO aidos_agent;

-- Belt-and-braces: revoke any default write the role might inherit, and ensure
-- future objects in these schemas are not silently writable by the agent.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ideas.idea           FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.truth         FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.layer         FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link          FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror       FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON changesets.changeset FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON dag.phase            FROM aidos_agent;

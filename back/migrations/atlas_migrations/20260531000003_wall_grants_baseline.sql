-- S04: The wall, level 2 — Postgres GRANTs deny the agent role any write above
-- the waterline (kernel / mirrors / fitness). Expand-only, append-only; never
-- alters or drops a prior table (S01 archive + S02 kernel records untouched).
--
-- The wall is defense-in-depth (CLAUDE.md §2):
--   level 1 = the PreToolUse Go hook (back/hooks/pretooluse) — refuses the write
--             before it is attempted, with an actionable BlockReason.
--   level 2 = THESE GRANTs — even if level 1 is bypassed, the agent DB role has
--             NO INSERT/UPDATE/DELETE/TRUNCATE on the truth schemas. Only the
--             privileged `aidos` writer role (via an approved ChangeSet) writes
--             truth.
--
-- This migration is idempotent: schemas use IF NOT EXISTS, roles are guarded,
-- GRANT/REVOKE are declarative. It is the canonical DDL source; the Go
-- Testcontainers suite (back/hooks/pretooluse) applies the S01/S02/S04 baselines
-- against a throwaway real Postgres on every `go test`, so the GRANTs are proven
-- end-to-end without requiring the Atlas CLI in CI.

-- The fitness schema (NIVEAU 3: fitness grammar + waterline + definition of
-- "passed"). It is above the line and READ-ONLY to everyone but `aidos` — no loop
-- edits its own fitness (CLAUDE.md §8). S02 created ideas/kernel/mirrors/
-- changesets/dag; fitness lands here, with the wall, because the wall is what
-- makes "read-only fitness" mechanical.
CREATE SCHEMA IF NOT EXISTS fitness;

-- fitness.waterline — the declared frontier between above-the-line (truth, frozen)
-- and below-the-line (projections, free). One content-addressed, append-only row
-- per declared waterline definition. Stored as data so the wall classifier and
-- the Workbench /wall panel read one source. The agent gets SELECT only.
CREATE TABLE IF NOT EXISTS fitness.waterline (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT waterline_pkey PRIMARY KEY (id)
);

-- The agent DB role (S01 created it as NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- The privileged writer role: the `aidos` CLI applies approved ChangeSets through
-- it. It is the ONLY door to truth (CLAUDE.md §2). Guarded create.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END
$$;

-- ── The agent: SELECT-only above the line ───────────────────────────────────
-- USAGE lets the agent SEE the schemas (to read truth for context); it gets
-- SELECT on every existing object and NEVER INSERT/UPDATE/DELETE/TRUNCATE.
GRANT USAGE ON SCHEMA kernel  TO aidos_agent;
GRANT USAGE ON SCHEMA mirrors TO aidos_agent;
GRANT USAGE ON SCHEMA fitness TO aidos_agent;

GRANT SELECT ON ALL TABLES IN SCHEMA kernel  TO aidos_agent;
GRANT SELECT ON ALL TABLES IN SCHEMA mirrors TO aidos_agent;
GRANT SELECT ON ALL TABLES IN SCHEMA fitness TO aidos_agent;

-- Belt-and-braces: revoke any write the role might inherit on existing objects,
-- and on the whole schema, so a bypass of level 1 still hits a permission wall.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA kernel  FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA mirrors FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA fitness FROM aidos_agent;
REVOKE CREATE ON SCHEMA kernel  FROM aidos_agent;
REVOKE CREATE ON SCHEMA mirrors FROM aidos_agent;
REVOKE CREATE ON SCHEMA fitness FROM aidos_agent;

-- Default privileges: any FUTURE table created in these schemas is SELECT-only to
-- the agent, never silently writable. The grantor is the schema owner (the role
-- running migrations), so newly-created tables inherit the wall automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA kernel  GRANT SELECT ON TABLES TO aidos_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA mirrors GRANT SELECT ON TABLES TO aidos_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA fitness GRANT SELECT ON TABLES TO aidos_agent;

-- ── The aidos writer role: full write above the line ─────────────────────────
-- The single door to truth. The CLI applies approved ChangeSets through this role.
GRANT USAGE ON SCHEMA kernel  TO aidos;
GRANT USAGE ON SCHEMA mirrors TO aidos;
GRANT USAGE ON SCHEMA fitness TO aidos;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA kernel  TO aidos;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA mirrors TO aidos;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA fitness TO aidos;

ALTER DEFAULT PRIVILEGES IN SCHEMA kernel  GRANT SELECT, INSERT, UPDATE ON TABLES TO aidos;
ALTER DEFAULT PRIVILEGES IN SCHEMA mirrors GRANT SELECT, INSERT, UPDATE ON TABLES TO aidos;
ALTER DEFAULT PRIVILEGES IN SCHEMA fitness GRANT SELECT, INSERT, UPDATE ON TABLES TO aidos;

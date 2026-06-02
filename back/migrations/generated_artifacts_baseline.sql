-- S34: the emit ledger — runtime.generated_artifacts. Expand-only, append-only,
-- content-addressed by (source_hash, output_hash). Never alters or drops a prior
-- table or GRANT (S01 archive + S02 kernel records + S04 wall grants + S05 mirror
-- runs + S07 sensor runs untouched).
--
-- THE WALL (CLAUDE.md §2, ADR 0014): generated_artifacts is NOT truth — it is the
-- runtime ledger of every emitted projection (one row per emit). It lives in the
-- `runtime` schema BELOW the waterline (created at S05), so the agent role MAY write
-- nothing here directly; the ledger is written by the `aidos` writer role when the
-- /project gesture materializes a projection. The truth schemas (kernel/mirrors/
-- fitness) stay SELECT-only to the agent: the emitter READS the entity AST from
-- kernel and WRITES projections into gen/ / front/web (the filesystem, below the
-- line), recording the emit here through the writer role.
--
-- STALENESS IS COMPUTED (S22 red-wave feed): an artifact whose source_hash no longer
-- equals its entity's current head hash is STALE. The ledger keeps every emit
-- (append-only), so a changed source leaves the prior artifact in place, now stale —
-- the drift is a simple inequality the /emitters panel and S22 read, never hunted.
-- A hand-edited gen/ file is detected by output_hash (ledger) != hash(on-disk bytes).
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative. The Go Testcontainers suite (back/runtime/generators) applies the
-- S02 + S04 + S05 + S34 baselines against a throwaway real Postgres on every
-- `go test`, so the ledger round-trip + GRANTs are proven end-to-end without Atlas
-- in CI.

CREATE SCHEMA IF NOT EXISTS runtime;

-- runtime.generated_artifacts — one immutable row per emitted projection.
--   path        : where the projection lands (back/gen/… for Go/DDL, front/web/… for TS).
--   target      : the emitter target — go-sqlc | pg-ddl | ts-types (the closed set).
--   kind        : the source kind — currently 'entity' (the N3 contract AST, S02).
--   source_hash : the content address of the entity AST it was emitted from
--                 (= records.Hash(records.Canonicalize(body)), S02 reused).
--   output_hash : the content hash of the emitted bytes — proves byte-identical
--                 re-emission and makes a hand-edit of gen/ computable.
--   emitted_at  : when this emit happened (append-only audit).
-- PRIMARY KEY (path, source_hash): re-emitting the SAME source to the SAME path is
-- idempotent (one ledger row); a CHANGED source (new source_hash) APPENDS a new row,
-- leaving the prior (now stale) row in place — append-only, never an in-place update.
CREATE TABLE IF NOT EXISTS runtime.generated_artifacts (
    id          BIGSERIAL   NOT NULL,
    path        TEXT        NOT NULL,
    target      TEXT        NOT NULL CHECK (target IN ('go-sqlc', 'pg-ddl', 'ts-types')),
    kind        TEXT        NOT NULL DEFAULT 'entity',
    source_hash TEXT        NOT NULL,
    output_hash TEXT        NOT NULL,
    emitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT generated_artifacts_pkey PRIMARY KEY (path, source_hash)
);

-- Fast "all emits for an entity" and "head per path" lookups.
CREATE INDEX IF NOT EXISTS generated_artifacts_source_idx
    ON runtime.generated_artifacts (source_hash);
CREATE INDEX IF NOT EXISTS generated_artifacts_path_emitted_idx
    ON runtime.generated_artifacts (path, emitted_at DESC);

-- The agent DB role (S01 created it as NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END $$;

-- THE WALL, restated for the ledger (self-contained, order-independent):
--   - the agent role gets SELECT only on the ledger (it READS its emit history for
--     the /emitters panel — it never writes the ledger directly);
--   - the agent role keeps SELECT only on kernel.* (the entity AST it reads) — the
--     S04 wall_grants migration already revoked its writes; this migration re-states
--     the SELECT so the round-trip test is self-contained.
GRANT USAGE  ON SCHEMA runtime TO aidos_agent;
GRANT SELECT ON runtime.generated_artifacts TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON runtime.generated_artifacts FROM aidos_agent;

-- The `aidos` writer role inserts ledger rows (via the /project gesture). It never
-- updates or deletes a row — the ledger is append-only.
GRANT USAGE  ON SCHEMA runtime TO aidos;
GRANT SELECT, INSERT ON runtime.generated_artifacts TO aidos;
GRANT USAGE  ON ALL SEQUENCES IN SCHEMA runtime TO aidos;

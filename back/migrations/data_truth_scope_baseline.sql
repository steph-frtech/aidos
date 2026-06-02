-- S37: the DataTruthScope record table (KRD §44.3 — "les données ont leur propre
-- inertie"). Expand-only, append-only. Adds runtime.data_truth_scope — the explicit,
-- content-addressed declaration of what a NEW TRUTH does to HISTORICAL DATA: applies_to
-- (the §44.3 closed set), the migration block (required + strategy in the closed set),
-- and the audit block (preserve_old_truth). A change touching existing/historical
-- records REQUIRES such a declaration (the pure RequireMigration guard, back/gen/db);
-- it is NEVER applied silently over historical data.
--
-- It NEVER alters or drops a prior table, value, or GRANT (S01 archive, S02 kernel
-- records, S04 wall grants, S34 generated_artifacts, S35 kernel.entity, S36
-- runtime.api_contract — all untouched). The S04 PreToolUse hook + the GRANTs below are
-- the wall.
--
-- THE WALL (CLAUDE.md §2, KRD §44.3): a DataTruthScope is NOT truth — it lives in the
-- `runtime` schema BELOW the waterline. The agent role MAY write nothing here directly;
-- it READS the entity AST from kernel (SELECT-only) and READS the data-scope here
-- (SELECT-only) to render the /db-projection panel and run the pure RequireMigration
-- guard. The aidos writer role inserts a DataTruthScope row via an approved ChangeSet.
-- The kernel/mirrors/fitness truth schemas stay SELECT-only to the agent.
--
-- CONTENT-ADDRESSED + APPEND-ONLY (S02 substrate, never a forked hashing path):
--   id            = SHA-256 hex of the canonical body JSONB (records.Hash(Canonicalize))
--   body          = the canonical §44.3 body { applies_to:[…], migration:{required,
--                   strategy}, audit:{preserve_old_truth} }
--   entity_ref    = the entity AST the data-scope governs (the db projection's table)
--   migration_ref = the emitted migration the declaration points at (back/gen/db/…), NULL until emitted
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at    = insertion time
-- Append-only: a row is NEVER updated or deleted. The head moves by INSERTing a new row
-- and closing the prior row's superseded_by.
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative. The Go Testcontainers suite (back/gen/db) applies the S02 + S04 + S35 +
-- S37 baselines against a throwaway real Postgres on every `go test`, so the data-scope
-- round-trip, the §44.3 closed-set CHECKs, the content-address invariant, and the GRANTs
-- are proven end-to-end (the dry-run is real, not mocked).

-- The kernel schema already exists (S02). The runtime schema already exists (S07/S34).
CREATE SCHEMA IF NOT EXISTS runtime;
CREATE SCHEMA IF NOT EXISTS kernel;

-- runtime.data_truth_scope — one §44.3 declaration per (entity change). Content-addressed.
CREATE TABLE IF NOT EXISTS runtime.data_truth_scope (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    entity_ref    TEXT        NOT NULL,
    migration_ref TEXT,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT data_truth_scope_pkey PRIMARY KEY (id),
    -- The content-address invariant, enforced in-database: version == id (both are the
    -- hash of the canonical body). A row whose version drifts from its id is refused.
    CONSTRAINT data_truth_scope_content_addressed CHECK (version = id),
    -- The §44.3 closed strategy set: a strategy is never invented (honesty, CLAUDE.md §8).
    CONSTRAINT data_truth_scope_strategy_check CHECK (
        body -> 'migration' ->> 'strategy' IN ('expand_contract', 'backfill', 'dual_read', 'dual_write')
    )
);

-- The agent DB role (S01 created it as NOLOGIN; guard in case this runs first).
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

-- ── The wall on runtime.data_truth_scope ────────────────────────────────────
-- The agent: USAGE on the schema + SELECT ONLY on the data-scope (it READS the
-- declaration to render /db-projection and run RequireMigration — it never writes it).
-- No INSERT/UPDATE/DELETE.
GRANT USAGE  ON SCHEMA runtime TO aidos_agent;
GRANT SELECT ON runtime.data_truth_scope TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON runtime.data_truth_scope FROM aidos_agent;

-- The aidos writer role: inserts a DataTruthScope (via an approved ChangeSet) and may
-- UPDATE superseded_by when the head moves. DELETE withheld: append-only.
GRANT USAGE          ON SCHEMA runtime TO aidos;
GRANT SELECT, INSERT, UPDATE ON runtime.data_truth_scope TO aidos;

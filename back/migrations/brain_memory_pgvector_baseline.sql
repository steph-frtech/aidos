-- S31: Memory adapter (pgvector) — EXPAND the S30 brain.memory_item with the indexable columns
-- and the pgvector ANN index, so a MemoryItem can be RECALLED by similarity across the four
-- indexable KRD memories (episodic/semantic/procedural/structural, KRD §136).
--
-- EXPAND-ONLY, APPEND-ONLY (CLAUDE.md §9). It ADDS the `vector` extension, ADDS columns to the
-- existing brain.memory_item (created at S30), and ADDS one ANN index. It NEVER alters or drops the
-- S30 columns/constraints/GRANTs — the S30 body-only shape and its three CHECK constraints
-- (kind discriminator, no-mirror/no-version, branch agreement) stay intact and are re-asserted. The
-- new columns are nullable-or-defaulted so old rows remain valid (expand-contract).
--
-- THE WALL IS UNCHANGED (CLAUDE.md §2 / S04 / S30): the agent role keeps SELECT + INSERT on
-- brain.memory_item (the /brain store is BELOW the waterline — fuel, writable) and NO grant on the
-- kernel/mirrors/fitness truth schemas. No UPDATE/DELETE grant — a memory is append-only;
-- supersession is a NEW row, expiry is `expires_at`, never an in-place edit. The wall is re-asserted
-- at the foot of this file.
--
-- ADR 0025: embedding dimension = 384 (vector(384), pinned at column creation), index = HNSW,
-- distance = cosine (vector_cosine_ops). A later model change is a deliberate reindex, not an edit.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS brain;

-- The S30 table already exists (id text PK, body jsonb, branch text, created_at). EXPAND it with the
-- recall keys + the embedding. All ADD COLUMN IF NOT EXISTS — idempotent, additive, never a drop.
ALTER TABLE brain.memory_item ADD COLUMN IF NOT EXISTS kind           text;
ALTER TABLE brain.memory_item ADD COLUMN IF NOT EXISTS content        text;
ALTER TABLE brain.memory_item ADD COLUMN IF NOT EXISTS embedding      vector(384);
ALTER TABLE brain.memory_item ADD COLUMN IF NOT EXISTS provenance     text;
ALTER TABLE brain.memory_item ADD COLUMN IF NOT EXISTS validity_scope text;
ALTER TABLE brain.memory_item ADD COLUMN IF NOT EXISTS expires_at     timestamptz;
ALTER TABLE brain.memory_item ADD COLUMN IF NOT EXISTS confidence     double precision;
ALTER TABLE brain.memory_item ADD COLUMN IF NOT EXISTS taint          text[] NOT NULL DEFAULT '{}';

-- The kind discriminator: when set, it must be one of the four INDEXABLE KRD memories — working and
-- evolutionary memory are NOT here (KRD §136). NULL is tolerated for any pre-S31 body-only row.
ALTER TABLE brain.memory_item
    DROP CONSTRAINT IF EXISTS memory_item_indexable_kind_chk;
ALTER TABLE brain.memory_item
    ADD CONSTRAINT memory_item_indexable_kind_chk
    CHECK (kind IS NULL OR kind IN ('episodic', 'semantic', 'procedural', 'structural'));

-- The ANN index: HNSW over cosine distance (ADR 0025). Recall orders by `embedding <=> query`.
CREATE INDEX IF NOT EXISTS memory_item_embedding_hnsw
    ON brain.memory_item USING hnsw (embedding vector_cosine_ops);

-- Recall pushes the kind/branch filters into the WHERE clause — index them.
CREATE INDEX IF NOT EXISTS memory_item_kind_branch_idx
    ON brain.memory_item (kind, branch);

-- ── Roles (guarded) ──────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- ── The /brain store stays BELOW the waterline: SELECT + INSERT, never UPDATE/DELETE ──
-- Re-asserted (unchanged from S30): fuel is writable + appendable, never editable.
GRANT USAGE ON SCHEMA brain TO aidos_agent;
GRANT SELECT, INSERT ON brain.memory_item TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON brain.memory_item FROM aidos_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA brain GRANT SELECT, INSERT ON TABLES TO aidos_agent;

-- ── The wall is UNCHANGED — re-assert SELECT-only on the truth schemas ────────
-- This migration provably does NOT weaken S02/S04/S27/S30: the agent can NEVER write the kernel,
-- mirrors or fitness. Memory is fuel; it can never declare truth.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA kernel  FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA mirrors FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA fitness FROM aidos_agent;
REVOKE CREATE ON SCHEMA kernel  FROM aidos_agent;
REVOKE CREATE ON SCHEMA mirrors FROM aidos_agent;
REVOKE CREATE ON SCHEMA fitness FROM aidos_agent;

-- S30: MemoryFirewall baseline migration — the `/brain` store's memory_item table.
--
-- Expand-only, append-only. It ADDS one schema (brain) and one content-addressed,
-- append-only table (brain.memory_item) plus one GRANT set; it never alters or drops a
-- prior table or GRANT (CLAUDE.md §9, the anti-overwrite rule). The wall (S04) is UNCHANGED
-- and re-asserted below.
--
-- THE `/brain` STORE (KRD §119.1, LIVRE XXIV; back/archive/CONTEXT.md): the engine-side store
-- of the six KRD memories — context FUEL, never truth. A MemoryItem carries content +
-- provenance + validity_scope + expires_at + confidence + taint, is branch-aware, and — BY
-- CONSTRUCTION — has NO `mirror` and NO `version`/freeze column. That double absence is
-- EXACTLY what makes it memory and not a truth: the table literally cannot hold the thing that
-- would make a row a truth.
--
-- THE WALL + THE ASYMMETRY (CLAUDE.md §2 / S04 / KRD §119.1): the `/brain` store is BELOW the
-- waterline, so the agent DB role gets INSERT/SELECT on brain.* (it reads and appends memory
-- freely) — but NO grant whatsoever on the kernel/mirrors/fitness schemas. That asymmetry —
-- writable fuel that can NEVER become truth without the full flow
-- Memory → ContextPack → Idea → Mirror → Goal → Kernel — is exactly what the MemoryFirewall
-- mirrors at the row level. The kernel write at the far end of the flow is the `aidos` CLI
-- writer role via /goal, never the agent and never a memory.
--
-- The id is the content hash of the canonical memory body (S01/S02 content-addressing): the
-- same {content, provenance, validity_scope, expires_at, confidence, taint, branch} always
-- lands at the same address. Append-only: a memory is KEPT, never deleted (no DELETE grant).

CREATE SCHEMA IF NOT EXISTS brain;

CREATE TABLE IF NOT EXISTS brain.memory_item (
    -- id = Hash(Canonicalize(body)) — the content address of the memory body (S01/S02).
    id         text        PRIMARY KEY,
    -- body holds {content, provenance, validity_scope, expires_at, confidence, taint, branch}.
    -- There is NO `mirror` key and NO `version` key in the body — a memory is fuel, not truth.
    body       jsonb       NOT NULL,
    -- branch is the DAG branch the memory was captured on — memory is branch-aware.
    branch     text        NOT NULL,
    -- created_at is the capture timestamp.
    created_at timestamptz NOT NULL
    -- NOTE: deliberately NO `mirror` column and NO `version`/freeze column. By construction a
    -- memory cannot carry the thing that would make it a truth (the type makes it
    -- unrepresentable in Go; the schema makes it unrepresentable in Postgres).
);

-- The body must carry the kind discriminator "memory_item" (content-addressing namespacing)
-- and must NOT carry a `mirror` or `version` key (defense in depth: even a hand-crafted
-- INSERT cannot smuggle a freeze/mirror into a memory row).
ALTER TABLE brain.memory_item
    DROP CONSTRAINT IF EXISTS memory_item_kind_chk;
ALTER TABLE brain.memory_item
    ADD CONSTRAINT memory_item_kind_chk
    CHECK (body ->> 'kind' = 'memory_item');

ALTER TABLE brain.memory_item
    DROP CONSTRAINT IF EXISTS memory_item_no_mirror_no_version_chk;
ALTER TABLE brain.memory_item
    ADD CONSTRAINT memory_item_no_mirror_no_version_chk
    CHECK (NOT (body ? 'mirror') AND NOT (body ? 'version'));

-- The branch column must agree with the body branch (no drift between the content-addressed
-- body and the indexed column).
ALTER TABLE brain.memory_item
    DROP CONSTRAINT IF EXISTS memory_item_branch_agrees_chk;
ALTER TABLE brain.memory_item
    ADD CONSTRAINT memory_item_branch_agrees_chk
    CHECK (body ->> 'branch' = branch);

-- ── Roles (guarded; created at S01/S04) ──────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- ── The /brain store is BELOW the waterline: the agent reads AND appends ──────
-- Unlike the truth schemas (SELECT-only, the wall), brain.* is fuel: the agent INSERTs
-- (captures a memory) and SELECTs (reads it for context). It NEVER gets UPDATE/DELETE — a
-- memory is append-only and kept (KRD: critical history is never destroyed).
GRANT USAGE ON SCHEMA brain TO aidos_agent;
GRANT SELECT, INSERT ON brain.memory_item TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON brain.memory_item FROM aidos_agent;

-- Future tables in brain.* default to SELECT/INSERT for the agent (append-only fuel).
ALTER DEFAULT PRIVILEGES IN SCHEMA brain GRANT SELECT, INSERT ON TABLES TO aidos_agent;

-- ── The wall is UNCHANGED — re-assert SELECT-only on the truth schemas ────────
-- This migration provably does NOT weaken S02/S04/S27: the agent can NEVER write the kernel
-- or mirrors. The asymmetry below IS the MemoryFirewall at the row level — writable brain.*,
-- unwritable kernel/mirrors/fitness. A memory can never declare truth.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA kernel  FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA mirrors FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA fitness FROM aidos_agent;
REVOKE CREATE ON SCHEMA kernel  FROM aidos_agent;
REVOKE CREATE ON SCHEMA mirrors FROM aidos_agent;
REVOKE CREATE ON SCHEMA fitness FROM aidos_agent;

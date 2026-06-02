-- S47: the Release-v0 pack snapshot — fitness.release_pack.
-- Expand-only, append-only, content-addressed by the pack-body hash. Never alters or
-- drops a prior table, GRANT, or the read-only posture of the truth schemas. S04
-- wall_grants created the `fitness` schema SELECT-only to the agent; S41
-- kernel_debt_snapshot (the prior fitness diagnostic) is untouched.
--
-- THE WALL (CLAUDE.md §2, KRD §70). Like kernel_debt_snapshot, the release pack lives
-- in the `fitness` schema, ABOVE the line: fitness is the NIVEAU-3 read-only diagnostic
-- zone (the agent is graded by it, never authors it — §8 anti-Goodhart). So the agent
-- role gets SELECT ONLY here; only the `aidos` CLI writer role records a pack, and only
-- via an APPROVED ChangeSet (S20). This migration adds NO fitness WRITE GRANT to the
-- agent. A recorded pack is a read-only inventory snapshot — it ASSEMBLES what exists,
-- it installs nothing, ships nothing, publishes nothing, and deletes nothing (the pack
-- never drives a deploy).
--
-- APPEND-ONLY + CONTENT-ADDRESSED. id = Hash(Canonicalize(body)) over S01/S02's
-- content-hash scheme (records.Canonicalize + records.Hash, REUSED not forked). body
-- holds the full ReleasePack (cli surface, routes, demo ref, docs index, test
-- inventory, changelog, known limits) + the AdoptionPlan. A new assembly is a NEW ROW,
-- never an UPDATE — the release history cannot be rewritten. kernel_head version-pins
-- the truth head the pack was assembled against, so a recorded release stays
-- inspectable after heads move.
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative.

CREATE SCHEMA IF NOT EXISTS fitness;

-- fitness.release_pack — one immutable row per assembled Release-v0 pack.
--   id          : Hash(Canonicalize(body)) — the content address of the pack.
--   body        : the full ReleasePack (cli_surface, workbench_routes, demo_cell,
--                 docs_index, test_inventory, changelog, known_limits) + the AdoptionPlan.
--   assembled_at: the wall clock the pack was recorded at (passed in — Assemble itself
--                 never reads the clock; this is the recorder's stamp).
--   kernel_head : the truth head the pack was assembled against (version-pinned).
CREATE TABLE IF NOT EXISTS fitness.release_pack (
    id           TEXT        NOT NULL,
    body         JSONB       NOT NULL,
    assembled_at TIMESTAMPTZ NOT NULL,
    kernel_head  TEXT        NOT NULL,
    CONSTRAINT release_pack_pkey PRIMARY KEY (id),
    -- the body must be a JSON object carrying the pack inventory (the pack shape). A
    -- malformed body is rejected in-database (the pack is a record of a real assembly,
    -- never a free-form blob).
    CONSTRAINT release_pack_body_shape_chk
        CHECK (jsonb_typeof(body) = 'object')
);

-- Fast "latest pack" lookup for the /adoption panel (newest assembly first).
CREATE INDEX IF NOT EXISTS release_pack_latest_idx
    ON fitness.release_pack (assembled_at DESC);

-- The agent DB role (S01 created it NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- The aidos CLI writer role (S04 created it; guard for order-independence).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END
$$;

-- ── The wall: the agent is SELECT-only above the line ────────────────────────
-- fitness is read-only to the agent — it READS the assembled pack, never writes it (a
-- pack is recorded by the aidos writer role inside a ChangeSet, S20).
GRANT USAGE  ON SCHEMA  fitness                 TO aidos_agent;
GRANT SELECT ON fitness.release_pack            TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON fitness.release_pack FROM aidos_agent;
REVOKE CREATE ON SCHEMA fitness FROM aidos_agent;

-- ── The aidos CLI writer: append a pack (via an approved ChangeSet) ──────────
-- INSERT + SELECT only — never UPDATE/DELETE/TRUNCATE (the release history is
-- append-only; a pack is immutable once recorded).
GRANT USAGE          ON SCHEMA fitness         TO aidos;
GRANT SELECT, INSERT ON fitness.release_pack   TO aidos;
REVOKE UPDATE, DELETE, TRUNCATE
    ON fitness.release_pack FROM aidos;

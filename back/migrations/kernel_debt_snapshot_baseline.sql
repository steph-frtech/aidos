-- S41: the KernelDebt diagnostic snapshot — fitness.kernel_debt_snapshot.
-- Expand-only, append-only, content-addressed by the snapshot-body hash. Never
-- alters or drops a prior table, GRANT, or the read-only posture of the truth
-- schemas. S04 wall_grants created the `fitness` schema SELECT-only to the agent;
-- S40 mutation_runs (the consumed run) and S06/S12 completeness (the consumed
-- monster notion) are untouched.
--
-- THE WALL (CLAUDE.md §2, KRD §70). Unlike the runtime audit logs (mutation_runs,
-- sensor_runs — runtime schema, BELOW the waterline, agent INSERT+SELECT), the
-- KernelDebt snapshot lives in the `fitness` schema, ABOVE the line: fitness is the
-- NIVEAU-3 read-only diagnostic zone (the agent is graded by it, never authors it —
-- §8 anti-Goodhart). So the agent role gets SELECT ONLY here; only the `aidos` CLI
-- writer role records a snapshot, and only via an APPROVED ChangeSet (S20). This
-- migration adds NO fitness WRITE GRANT to the agent. A recorded snapshot is a
-- read-only diagnostic about rot — it changes NOTHING about the kernel/mirrors, and
-- it deletes nothing. Acting on the debt (a trim) is a separate idea → mirror →
-- /goal → human approval (this table never drives a delete).
--
-- APPEND-ONLY + CONTENT-ADDRESSED. id = Hash(Canonicalize(body)) over S01/S02's
-- content-hash scheme (records.Canonicalize + records.Hash, REUSED not forked).
-- body holds the []DebtItem + the TrimPlan. A new scan is a NEW ROW, never an
-- UPDATE — the debt history cannot be rewritten. kernel_head version-pins the cut
-- the scan was taken against, so a recorded snapshot stays inspectable after heads
-- move. mutation_run_ref is the consumed S40 run (NULL when no run was consumed).
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative.

CREATE SCHEMA IF NOT EXISTS fitness;

-- fitness.kernel_debt_snapshot — one immutable row per debt scan.
--   id              : Hash(Canonicalize(body)) — the content address of the snapshot.
--   body            : the []DebtItem (the ranked rot) + the TrimPlan (suggest-only).
--   scanned_at      : the wall clock the scan was recorded at (passed in — Scan
--                     itself never reads the clock; this is the recorder's stamp).
--   kernel_head     : the truth head the scan was taken against (version-pinned).
--   mutation_run_ref: the consumed S40 mutation run (NULL when none consumed).
CREATE TABLE IF NOT EXISTS fitness.kernel_debt_snapshot (
    id               TEXT        NOT NULL,
    body             JSONB       NOT NULL,
    scanned_at       TIMESTAMPTZ NOT NULL,
    kernel_head      TEXT        NOT NULL,
    mutation_run_ref TEXT,
    CONSTRAINT kernel_debt_snapshot_pkey PRIMARY KEY (id),
    -- the body must be a JSON object carrying the two diagnostic arrays (the report
    -- shape). A malformed body is rejected in-database (the snapshot is a record of
    -- a real scan, never a free-form blob).
    CONSTRAINT kernel_debt_snapshot_body_shape_chk
        CHECK (jsonb_typeof(body) = 'object')
);

-- Fast "latest snapshot" lookup for the /kernel-debt panel (newest scan first).
CREATE INDEX IF NOT EXISTS kernel_debt_snapshot_latest_idx
    ON fitness.kernel_debt_snapshot (scanned_at DESC);

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
-- fitness is read-only to the agent — it READS the debt diagnostic, never writes
-- it (the snapshot is recorded by the aidos writer role inside a ChangeSet, S20).
GRANT USAGE  ON SCHEMA  fitness                       TO aidos_agent;
GRANT SELECT ON fitness.kernel_debt_snapshot          TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON fitness.kernel_debt_snapshot FROM aidos_agent;
REVOKE CREATE ON SCHEMA fitness FROM aidos_agent;

-- ── The aidos CLI writer: append a snapshot (via an approved ChangeSet) ──────
-- INSERT + SELECT only — never UPDATE/DELETE/TRUNCATE (the debt history is
-- append-only; a snapshot is immutable once recorded).
GRANT USAGE          ON SCHEMA fitness               TO aidos;
GRANT SELECT, INSERT ON fitness.kernel_debt_snapshot TO aidos;
REVOKE UPDATE, DELETE, TRUNCATE
    ON fitness.kernel_debt_snapshot FROM aidos;

-- S22: the RedWorkQueue — runtime.red_work_queue. The red wave (vague de rouge,
-- KRD §42/§49.4) after a kernel hash bump, drained into one append-only row per
-- RedWorkItem. Expand-only, append-only, content-addressed by the wave_id (the
-- bump's content hash). Never alters or drops a prior table (S01 archive + S02
-- kernel records + S04 wall grants + S05 mirror_runs + S07 sensor_runs + S12
-- completeness_runs all untouched).
--
-- THE WALL (CLAUDE.md §2, ADR 0014/0020): red_work_queue is NOT truth — it is a
-- Runtime WORKLIST (the journal of every red wave a bump opened). It lives in the
-- `runtime` schema BELOW the waterline (created at S05), the SAME zone as S07's
-- sensor_runs and S12's completeness_runs, so the agent role MAY write its own
-- worklist here WITHOUT breaching the wall. The truth schemas (kernel/mirrors/
-- fitness) stay SELECT-only to the agent (S04 GRANTs unchanged); the
-- PostKernelChange hook computes the wave (redwave.Impact, reusing S17.Resolve)
-- and INSERTs the rows ONLY here. This migration opens NO write door above the line.
--
-- APPEND-ONLY + CONTENT-ADDRESSED: one immutable row per RedWorkItem, the wave
-- content-addressed by wave_id. A re-fired wave APPENDS new rows; S22 NEVER updates
-- a row in place. The agent gets INSERT + SELECT only — NEVER UPDATE/DELETE/TRUNCATE
-- — so the worklist history cannot be rewritten. (The S05 ALTER DEFAULT PRIVILEGES
-- in schema runtime already grant INSERT+SELECT on future tables; this migration
-- re-states the grants explicitly so it is self-contained and order-independent in
-- the Testcontainers suite.)
--
-- THE STATUS TRANSITIONS ARE A LATER STEP (the scheduler, §49.4): S22 only ever
-- INSERTs rows with status='open', owner_agent=NULL, lease_until=NULL. The status
-- column + CHECK + the owner/lease columns EXIST now (the §49.4 shape) but claiming/
-- leasing/resolving an item is the scheduler's job (a later step, with its own role
-- — the agent's INSERT+SELECT-only grant deliberately CANNOT transition a row).
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative. The Go Testcontainers suite (back/hooks/postkernelchange) applies the
-- S02 + S05 + S22 baselines against a throwaway real Postgres on every `go test`.

CREATE SCHEMA IF NOT EXISTS runtime;

-- runtime.red_work_queue — one immutable row per RedWorkItem of a fired red wave.
--   item_id      : per-row id (the row's own identity inside the wave).
--   wave_id      : content address of the bump that opened this wave (the hash).
--   target       : the red layer to turn green — a mirror_id or a projection ref.
--   reason       : why it is red — version_stale | failed_test | incident (§49.4).
--   status       : open | claimed | blocked | resolved (§49.4). S22 writes only open.
--   layer        : the render-grouping hint (mirror | projection | operation_action
--                  | button) so the /red-wave panel groups the wave mirror-first.
--   owner_agent  : the agent that claimed the item — NULL until the scheduler leases it.
--   lease_until  : the lease expiry — NULL until the scheduler leases it.
--   dependencies : the upstream red targets this item depends on (ordered), as JSONB.
--   created_at   : insertion time (append-only audit).
CREATE TABLE IF NOT EXISTS runtime.red_work_queue (
    id           BIGSERIAL   NOT NULL,
    item_id      TEXT        NOT NULL,
    wave_id      TEXT        NOT NULL,
    target       TEXT        NOT NULL,
    reason       TEXT        NOT NULL CHECK (reason IN ('version_stale', 'failed_test', 'incident')),
    status       TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'blocked', 'resolved')),
    layer        TEXT        NOT NULL DEFAULT 'projection',
    owner_agent  TEXT,
    lease_until  TIMESTAMPTZ,
    dependencies JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT red_work_queue_pkey PRIMARY KEY (id)
);

-- Fast "the items of a wave, in insert order" lookup for the /red-wave panel.
CREATE INDEX IF NOT EXISTS red_work_queue_wave_idx
    ON runtime.red_work_queue (wave_id, id);

-- The wall (CLAUDE.md §2, ADR 0020): the agent role gets INSERT + SELECT — it writes
-- its own worklist below the line — but NEVER UPDATE/DELETE/TRUNCATE, so the queue is
-- append-only and a claimed/resolved transition is the scheduler's job, not the agent's.
GRANT USAGE  ON SCHEMA runtime TO aidos_agent;
GRANT INSERT, SELECT ON runtime.red_work_queue TO aidos_agent;
GRANT USAGE  ON SEQUENCE runtime.red_work_queue_id_seq TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.red_work_queue FROM aidos_agent;

-- S07: the PostToolUse sensors run-log — runtime.sensor_runs (+ child
-- runtime.sensor_check_results). Expand-only, append-only, content-addressed by
-- the diff/event hash. Never alters or drops a prior table (S01 archive + S02
-- kernel records + S04 wall grants + S05 mirror_runs untouched).
--
-- THE WALL (CLAUDE.md §2, ADR 0014): sensor_runs is NOT truth — it is a runtime
-- audit log (the journal of every PostToolUse sensor replay). It lives in the
-- `runtime` schema BELOW the waterline (created at S05), so the agent role MAY
-- write its own log here WITHOUT breaching the wall. The truth schemas
-- (kernel/mirrors/fitness) stay SELECT-only to the agent; the sensor hook WRITES
-- only here.
--
-- APPEND-ONLY + CONTENT-ADDRESSED: one immutable row per replay, content-addressed
-- by event_hash (the digest of the changed-file set + ref). A re-run APPENDS a new
-- row, it never updates one in place. The agent gets INSERT + SELECT only — NEVER
-- UPDATE/DELETE/TRUNCATE — so the sensors' history cannot be rewritten. (The S05
-- ALTER DEFAULT PRIVILEGES in schema runtime already grant INSERT+SELECT on future
-- tables; this migration re-states the grants explicitly so it is self-contained
-- and order-independent in the Testcontainers suite.)
--
-- Idempotent: schema + tables use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative. The Go Testcontainers suite (back/hooks/posttooluse) applies the
-- S02 + S05 + S07 baselines against a throwaway real Postgres on every `go test`.

CREATE SCHEMA IF NOT EXISTS runtime;

-- runtime.sensor_runs — one immutable row per PostToolUse sensor replay.
--   run_id      : groups the per-check rows of a single replay.
--   event_hash  : content address of the diff/event this run reflects.
--   target      : the changed-code set (comma-joined changed files).
--   verdict     : the aggregate verdict of THIS run — block | allow. No third.
--   started_at  : when the run happened (append-only audit).
--   ref         : the commit/changeset reference this diff was taken against.
CREATE TABLE IF NOT EXISTS runtime.sensor_runs (
    id          BIGSERIAL   NOT NULL,
    run_id      TEXT        NOT NULL,
    event_hash  TEXT        NOT NULL,
    target      TEXT        NOT NULL DEFAULT '',
    verdict     TEXT        NOT NULL CHECK (verdict IN ('block', 'allow')),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ref         TEXT        NOT NULL DEFAULT '',
    CONSTRAINT sensor_runs_pkey PRIMARY KEY (id),
    CONSTRAINT sensor_runs_run_id_uq UNIQUE (run_id)
);

-- runtime.sensor_check_results — one immutable row per computational sensor per run.
--   run_id      : the sensor_runs.run_id this result belongs to.
--   name        : the sensor name (gofmt | vet | lint | archtest | affected).
--   pass        : the sensor verdict — TRUE green, FALSE red.
--   errored     : the sensor could not produce a verdict (a failure made explicit,
--                 KRD §82 .passthrough() anti-pattern); an errored row has pass=FALSE.
--   output      : the captured tool output digest (for the BlockReason / panel).
--   duration_ms : wall-clock duration of the sensor.
CREATE TABLE IF NOT EXISTS runtime.sensor_check_results (
    id          BIGSERIAL   NOT NULL,
    run_id      TEXT        NOT NULL,
    name        TEXT        NOT NULL,
    pass        BOOLEAN     NOT NULL,
    errored     BOOLEAN     NOT NULL DEFAULT FALSE,
    output      TEXT        NOT NULL DEFAULT '',
    duration_ms BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT sensor_check_results_pkey PRIMARY KEY (id),
    CONSTRAINT sensor_check_results_run_fk
        FOREIGN KEY (run_id) REFERENCES runtime.sensor_runs (run_id),
    -- an errored result is never green (the .passthrough() guard, in-database).
    CONSTRAINT sensor_check_results_errored_chk
        CHECK (NOT (errored AND pass))
);

-- Fast "latest run" and "results for a run" lookups.
CREATE INDEX IF NOT EXISTS sensor_runs_latest_idx       ON runtime.sensor_runs (id DESC);
CREATE INDEX IF NOT EXISTS sensor_check_results_run_idx ON runtime.sensor_check_results (run_id);

-- The agent DB role (S01 created it NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- The agent may USE the runtime schema and APPEND its sensor run-log (INSERT +
-- SELECT), but NEVER UPDATE/DELETE/TRUNCATE — the sensors' history is append-only.
GRANT USAGE ON SCHEMA runtime TO aidos_agent;
GRANT INSERT, SELECT ON runtime.sensor_runs           TO aidos_agent;
GRANT INSERT, SELECT ON runtime.sensor_check_results  TO aidos_agent;
GRANT USAGE, SELECT ON SEQUENCE runtime.sensor_runs_id_seq          TO aidos_agent;
GRANT USAGE, SELECT ON SEQUENCE runtime.sensor_check_results_id_seq TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.sensor_runs          FROM aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.sensor_check_results FROM aidos_agent;

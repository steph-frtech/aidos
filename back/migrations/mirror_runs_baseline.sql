-- S05: the cliquet (ratchet) run-log — runtime.mirror_runs.
-- Expand-only, append-only, content-addressed. Never alters or drops a prior
-- table (S01 archive + S02 kernel records + S04 wall grants untouched).
--
-- THE WALL (CLAUDE.md §2): mirror_runs is NOT truth — it is a runtime run-log
-- (the journal of every mirror replay). It lives in a `runtime` schema BELOW the
-- waterline, so the agent role may write its own log here WITHOUT breaching the
-- wall. The truth schemas (kernel/mirrors/fitness) stay SELECT-only to the agent;
-- the mirror-runner READS the mirror set from `mirrors` and WRITES only here.
--
-- APPEND-ONLY + CONTENT-ADDRESSED: one immutable row per replay. A re-run
-- APPENDS a new row, it never updates one in place. content_hash binds the
-- verdict to the exact mirror that was run. The agent gets INSERT + SELECT only —
-- NEVER UPDATE/DELETE/TRUNCATE — so the cliquet's history cannot be rewritten.
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative. The Go Testcontainers suite (back/mcp/mirror-runner) applies the
-- S02 + S05 baselines against a throwaway real Postgres on every `go test`.

CREATE SCHEMA IF NOT EXISTS runtime;

-- runtime.mirror_runs — one immutable row per mirror replay.
--   run_id          : groups every mirror verdict produced by a single replay.
--   mirror_id       : the mirror that was run (FK-free; mirrors live above the line).
--   mirror_version  : the mirror record version replayed.
--   content_hash    : content address of the exact mirror source replayed.
--   status          : the verdict of THIS run — green | red.
--   baseline_status : the recorded status at the merge base — green | red | NULL
--                     (NULL = no baseline, e.g. a newly-added mirror).
--   regressed       : TRUE iff baseline_status = green AND status = red.
--   ran_at          : when the run happened (append-only audit).
--   ref             : the commit/changeset reference this run was taken against.
CREATE TABLE IF NOT EXISTS runtime.mirror_runs (
    id              BIGSERIAL   NOT NULL,
    run_id          TEXT        NOT NULL,
    mirror_id       TEXT        NOT NULL,
    mirror_version  TEXT        NOT NULL,
    content_hash    TEXT        NOT NULL,
    status          TEXT        NOT NULL CHECK (status IN ('green', 'red')),
    baseline_status TEXT        CHECK (baseline_status IN ('green', 'red')),
    regressed       BOOLEAN     NOT NULL,
    ran_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ref             TEXT        NOT NULL DEFAULT '',
    CONSTRAINT mirror_runs_pkey PRIMARY KEY (id),
    -- regressed is a function of (baseline_status, status): green→red only.
    CONSTRAINT mirror_runs_regressed_chk
        CHECK (regressed = (baseline_status = 'green' AND status = 'red'))
);

-- Fast "latest run per mirror" and "regressed set for a run" lookups.
CREATE INDEX IF NOT EXISTS mirror_runs_mirror_idx ON runtime.mirror_runs (mirror_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS mirror_runs_run_idx    ON runtime.mirror_runs (run_id);

-- The agent DB role (S01 created it NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- The agent may USE the runtime schema and APPEND its run-log (INSERT + SELECT),
-- but NEVER UPDATE/DELETE/TRUNCATE — the cliquet history is append-only.
GRANT USAGE ON SCHEMA runtime TO aidos_agent;
GRANT INSERT, SELECT ON runtime.mirror_runs TO aidos_agent;
GRANT USAGE, SELECT ON SEQUENCE runtime.mirror_runs_id_seq TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.mirror_runs FROM aidos_agent;

-- Future tables in runtime are append-only to the agent by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA runtime GRANT INSERT, SELECT ON TABLES TO aidos_agent;

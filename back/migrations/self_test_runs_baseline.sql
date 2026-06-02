-- S39: the SessionStart meta-meta self-test run-log — runtime.self_test_runs.
-- Expand-only, append-only. Never alters or drops a prior table, GRANT, or the
-- read-only posture of `fitness` (the wall, CLAUDE.md §2/§9). S01 archive + S02
-- kernel records + S04 wall grants (which created the fitness schema, SELECT-only to
-- the agent) + S05 mirror_runs + S07 sensor_runs are untouched.
--
-- THE WALL (CLAUDE.md §2, KRD §70): self_test_runs is NOT truth — it is a runtime
-- audit log (the journal of every harness self-test). It lives in the `runtime`
-- schema BELOW the waterline (created at S05), so the run row is written by the
-- privileged `aidos` writer role; the agent reads it SELECT-only. The truth schemas
-- (kernel/mirrors/fitness) stay SELECT-only to the agent — this step READS the graven
-- NIVEAU 3 fitness baseline and asserts it UNCHANGED; it NEVER writes the fitness
-- schema (writing it would be the very drift the self-test exists to catch).
--
-- APPEND-ONLY: one immutable row per self-test run. A re-run APPENDS a new row, it
-- never updates one in place — the meta-meta history cannot be rewritten.
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative. The Go Testcontainers suite (back/hooks/sessionstart/selftest)
-- applies the S02 + S04 + S07 + S39 baselines against a throwaway real Postgres on
-- every `go test`, so the GRANT (agent SELECT-only on fitness + on the ledger) is
-- proven end-to-end without requiring the Atlas CLI in CI.

CREATE SCHEMA IF NOT EXISTS runtime;

-- runtime.self_test_runs — one immutable row per SessionStart self-test run.
--   at                    : when the run happened (passed in by the runner, never now()).
--   verdict               : green iff every sensor fired ∧ wall refused ∧ fitness unchanged.
--   sensors_fired/total   : the per-sensor fault-injection tally (N/N when green).
--   wall_refused          : the agent write above the line was refused on every schema.
--   fitness_baseline_hash : the graven NIVEAU 3 content-hash (Hash(Canonicalize(rows))).
--   fitness_current_hash  : the recomputed content-hash this run.
--   fitness_unchanged     : current == baseline (no loop edited its own fitness).
--   block_reason          : the actionable BlockReason (S13 shape) when red, else null.
CREATE TABLE IF NOT EXISTS runtime.self_test_runs (
    id                    BIGSERIAL   NOT NULL,
    at                    TIMESTAMPTZ NOT NULL,
    verdict               TEXT        NOT NULL CHECK (verdict IN ('green', 'red')),
    sensors_fired         INT         NOT NULL,
    sensors_total         INT         NOT NULL,
    wall_refused          BOOLEAN     NOT NULL,
    fitness_baseline_hash TEXT        NOT NULL,
    fitness_current_hash  TEXT        NOT NULL,
    fitness_unchanged     BOOLEAN     NOT NULL,
    block_reason          JSONB,
    CONSTRAINT self_test_runs_pkey PRIMARY KEY (id)
);

-- Fast "latest run" lookup for the /meta Workbench panel.
CREATE INDEX IF NOT EXISTS self_test_runs_latest_idx ON runtime.self_test_runs (id DESC);

-- The agent DB role (S01 created it NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- The privileged writer role (S04 created it; guard in case this runs first). Only
-- the `aidos` CLI writer inserts run rows.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END
$$;

-- The agent reads the ledger SELECT-only — it is below the line, but the self-test is
-- written by the privileged role (the meta-meta history is authoritative, not the
-- agent's to append). The agent NEVER UPDATE/DELETE/TRUNCATE here.
GRANT USAGE ON SCHEMA runtime TO aidos_agent;
GRANT SELECT ON runtime.self_test_runs TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON runtime.self_test_runs FROM aidos_agent;

-- The aidos writer role appends run rows (the only writer of the meta-meta ledger).
GRANT USAGE ON SCHEMA runtime TO aidos;
GRANT SELECT, INSERT ON runtime.self_test_runs TO aidos;
GRANT USAGE, SELECT ON SEQUENCE runtime.self_test_runs_id_seq TO aidos;

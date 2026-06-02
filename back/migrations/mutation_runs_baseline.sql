-- S40: the mutation-testing run-log — runtime.mutation_runs (+ child
-- runtime.surviving_mutants). Expand-only, append-only, content-addressed by the
-- run/commit-or-phase hash. Never alters or drops a prior table, GRANT, or the
-- read-only posture of the truth schemas. S01 archive + S02 kernel records + S04
-- wall grants (which created the fitness schema, SELECT-only to the agent) + S05
-- runtime/mirror_runs + S07 sensor_runs + S39 self_test_runs are untouched.
--
-- THE WALL (CLAUDE.md §2, KRD §70): mutation_runs is NOT truth — it is a Runtime
-- audit log (the journal of every mutation/serrage run). It lives in the
-- `runtime` schema BELOW the waterline (created at S05), so the agent role MAY
-- write its own log here WITHOUT breaching the wall. The truth schemas
-- (kernel/mirrors/fitness) stay SELECT-only to the agent; this migration adds NO
-- fitness row and NO fitness write GRANT. The mutation-score THRESHOLD is read
-- SELECT-only from `fitness` (declared above the line, the agent is graded by it
-- and never authors it — §8 anti-Goodhart, KRD §1831/§1893).
--
-- APPEND-ONLY + CONTENT-ADDRESSED: one immutable row per mutation run,
-- content-addressed by commit_or_phase_hash (the cut the densimètre graded). A
-- re-run APPENDS a new row, it never updates one in place — the serrage history
-- cannot be rewritten. The agent gets INSERT + SELECT only — NEVER
-- UPDATE/DELETE/TRUNCATE. (The S05 ALTER DEFAULT PRIVILEGES in schema runtime
-- already grant INSERT+SELECT on future tables; this migration re-states the
-- grants explicitly so it is self-contained and order-independent in the
-- Testcontainers suite.)
--
-- Idempotent: schema + tables use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative.

CREATE SCHEMA IF NOT EXISTS runtime;

-- runtime.mutation_runs — one immutable row per mutation/serrage run.
--   run_id               : groups a run with its surviving-mutant children.
--   scope                : what was mutated — 'go' (gremlins) | 'front' (stryker).
--   commit_or_phase_hash : content address of the cut the densimètre graded.
--   runner               : the frozen tool whose report this was parsed from.
--   killed/survived/timed_out/not_covered/total : the mutant tally.
--   score                : killed/(total-not_covered) in [0,1] (ADR 0030 denominator).
--   threshold_used       : the DECLARED bar read SELECT-only from fitness.
--   verdict              : pass | block — the gate's decision. No third value.
--   block_reason         : the actionable BlockReason (S13 shape) when structurally
--                          blocked (no threshold / unparsable), else null.
--   started_at/finished_at : the run window (append-only audit, passed in).
CREATE TABLE IF NOT EXISTS runtime.mutation_runs (
    id                   BIGSERIAL   NOT NULL,
    run_id               TEXT        NOT NULL,
    scope                TEXT        NOT NULL CHECK (scope IN ('go', 'front')),
    commit_or_phase_hash TEXT        NOT NULL,
    runner               TEXT        NOT NULL,
    killed               INT         NOT NULL DEFAULT 0,
    survived             INT         NOT NULL DEFAULT 0,
    timed_out            INT         NOT NULL DEFAULT 0,
    not_covered          INT         NOT NULL DEFAULT 0,
    total                INT         NOT NULL DEFAULT 0,
    score                NUMERIC     NOT NULL DEFAULT 0,
    threshold_used       NUMERIC     NOT NULL DEFAULT 0,
    verdict              TEXT        NOT NULL CHECK (verdict IN ('pass', 'block')),
    block_reason         JSONB,
    started_at           TIMESTAMPTZ NOT NULL,
    finished_at          TIMESTAMPTZ NOT NULL,
    CONSTRAINT mutation_runs_pkey PRIMARY KEY (id),
    CONSTRAINT mutation_runs_run_id_uq UNIQUE (run_id),
    -- the score the gate graded must be in [0,1] (the rapid property, in-database).
    CONSTRAINT mutation_runs_score_range_chk CHECK (score >= 0 AND score <= 1),
    -- a pass means the score cleared the bar (the gate law, in-database). A block
    -- may be below the bar OR structural (no threshold / unparsable) — so only the
    -- pass direction is constrained here.
    CONSTRAINT mutation_runs_pass_clears_bar_chk
        CHECK (verdict <> 'pass' OR score >= threshold_used)
);

-- runtime.surviving_mutants — one immutable row per surviving mutant per run (the
-- holes to plug). Carried into a blocked run's BlockReason and the panel.
--   run_id   : the mutation_runs.run_id this survivor belongs to.
--   file     : the source file the mutant lived in.
--   line     : the line the mutant lived on.
--   operator : the mutation operator that was not killed.
--   gap      : the missing invariant/fixture (the test gap), for the panel.
CREATE TABLE IF NOT EXISTS runtime.surviving_mutants (
    id          BIGSERIAL   NOT NULL,
    run_id      TEXT        NOT NULL,
    file        TEXT        NOT NULL,
    line        INT         NOT NULL DEFAULT 0,
    operator    TEXT        NOT NULL DEFAULT '',
    gap         TEXT        NOT NULL DEFAULT '',
    CONSTRAINT surviving_mutants_pkey PRIMARY KEY (id),
    CONSTRAINT surviving_mutants_run_fk
        FOREIGN KEY (run_id) REFERENCES runtime.mutation_runs (run_id)
);

-- Fast "latest run" and "survivors for a run" lookups for the /mutation-score panel.
CREATE INDEX IF NOT EXISTS mutation_runs_latest_idx     ON runtime.mutation_runs (id DESC);
CREATE INDEX IF NOT EXISTS surviving_mutants_run_idx     ON runtime.surviving_mutants (run_id);

-- The agent DB role (S01 created it NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- The agent may USE the runtime schema and APPEND its mutation run-log (INSERT +
-- SELECT), but NEVER UPDATE/DELETE/TRUNCATE — the serrage history is append-only.
GRANT USAGE ON SCHEMA runtime TO aidos_agent;
GRANT INSERT, SELECT ON runtime.mutation_runs      TO aidos_agent;
GRANT INSERT, SELECT ON runtime.surviving_mutants  TO aidos_agent;
GRANT USAGE, SELECT ON SEQUENCE runtime.mutation_runs_id_seq     TO aidos_agent;
GRANT USAGE, SELECT ON SEQUENCE runtime.surviving_mutants_id_seq TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.mutation_runs      FROM aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.surviving_mutants  FROM aidos_agent;

-- The threshold itself stays in `fitness`, SELECT-only to the agent. This
-- migration does NOT touch the fitness schema, adds no fitness row, and adds no
-- fitness write GRANT (the wall is unchanged — CLAUDE.md §2/§9).

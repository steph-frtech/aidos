-- S12: the Stop completeness gate run-log — runtime.completeness_runs (+ child
-- runtime.completeness_monster_findings). Expand-only, append-only,
-- content-addressed by the cut hash. Never alters or drops a prior table (S01
-- archive + S02 kernel records + S04 wall grants + S05 mirror_runs + S06 mirror
-- record + S07 sensor_runs all untouched).
--
-- THE WALL (CLAUDE.md §2, ADR 0014/0015): completeness_runs is NOT truth — it is a
-- runtime audit log (the journal of every Stop completeness evaluation). It lives in
-- the `runtime` schema BELOW the waterline (created at S05), so the agent role MAY
-- write its own log here WITHOUT breaching the wall. The truth schemas
-- (kernel/mirrors/fitness) stay SELECT-only to the agent; the Stop hook READS
-- kernel ⋈ mirrors to compute the monster set and WRITES only here. Mirrors S07's
-- sensor_runs shape so the wall's twins stay auditable.
--
-- APPEND-ONLY + CONTENT-ADDRESSED: one immutable row per Stop evaluation,
-- content-addressed by cut_hash (the digest of the sorted mirrors ⋈ kernel cut). A
-- re-run APPENDS a new row, it never updates one in place. The agent gets INSERT +
-- SELECT only — NEVER UPDATE/DELETE/TRUNCATE — so the gate's history cannot be
-- rewritten. (The S05 ALTER DEFAULT PRIVILEGES in schema runtime already grant
-- INSERT+SELECT on future tables; this migration re-states the grants explicitly so
-- it is self-contained and order-independent in the Testcontainers suite.)
--
-- Idempotent: schema + tables use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative. The Go Testcontainers suite (back/hooks/stop) applies the S02 + S05
-- + S06 + S12 baselines against a throwaway real Postgres on every `go test`.

CREATE SCHEMA IF NOT EXISTS runtime;

-- runtime.completeness_runs — one immutable row per Stop completeness evaluation.
--   run_id        : groups the per-finding rows of a single evaluation.
--   cut_hash      : content address of the mirrors ⋈ kernel cut this run reflects.
--   verdict       : the aggregate verdict of THIS run — block | pass. No third.
--   monster_count : the size of the monster set (0 ⇒ pass).
--   started_at    : when the run happened (append-only audit).
--   finished_at   : when the run completed (defaults to started_at for a sync run).
CREATE TABLE IF NOT EXISTS runtime.completeness_runs (
    id            BIGSERIAL   NOT NULL,
    run_id        TEXT        NOT NULL,
    cut_hash      TEXT        NOT NULL,
    verdict       TEXT        NOT NULL CHECK (verdict IN ('block', 'pass')),
    monster_count INTEGER     NOT NULL DEFAULT 0 CHECK (monster_count >= 0),
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT completeness_runs_pkey PRIMARY KEY (id),
    CONSTRAINT completeness_runs_run_id_uq UNIQUE (run_id),
    -- a pass has no monster; a block has at least one (the verdict is computed FROM
    -- the set, never declared independently — anti-Goodhart, in-database).
    CONSTRAINT completeness_runs_verdict_count_chk
        CHECK ((verdict = 'pass' AND monster_count = 0)
            OR (verdict = 'block' AND monster_count >= 0))
);

-- runtime.completeness_monster_findings — one immutable row per monster per run.
--   run_id            : the completeness_runs.run_id this finding belongs to.
--   reason            : no_truth_without_mirror | no_orphan_mirror — no third.
--   kind              : the monster's kernel kind (control | view | …), audit.
--   ref               : the subject — layer_id@version (missing mirror) or mirror_id (orphan).
--   missing_test_kind : the required test_kind the layer lacks (no_truth only).
CREATE TABLE IF NOT EXISTS runtime.completeness_monster_findings (
    id                BIGSERIAL NOT NULL,
    run_id            TEXT      NOT NULL,
    reason            TEXT      NOT NULL
        CHECK (reason IN ('no_truth_without_mirror', 'no_orphan_mirror')),
    kind              TEXT      NOT NULL DEFAULT '',
    ref               TEXT      NOT NULL DEFAULT '',
    missing_test_kind TEXT      NOT NULL DEFAULT '',
    CONSTRAINT completeness_monster_findings_pkey PRIMARY KEY (id),
    CONSTRAINT completeness_monster_findings_run_fk
        FOREIGN KEY (run_id) REFERENCES runtime.completeness_runs (run_id)
);

-- Fast "latest run" and "findings for a run" lookups.
CREATE INDEX IF NOT EXISTS completeness_runs_latest_idx
    ON runtime.completeness_runs (id DESC);
CREATE INDEX IF NOT EXISTS completeness_monster_findings_run_idx
    ON runtime.completeness_monster_findings (run_id);

-- The agent DB role (S01 created it NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- The agent may USE the runtime schema and APPEND its completeness run-log (INSERT
-- + SELECT), but NEVER UPDATE/DELETE/TRUNCATE — the gate's history is append-only.
GRANT USAGE ON SCHEMA runtime TO aidos_agent;
GRANT INSERT, SELECT ON runtime.completeness_runs              TO aidos_agent;
GRANT INSERT, SELECT ON runtime.completeness_monster_findings  TO aidos_agent;
GRANT USAGE, SELECT ON SEQUENCE runtime.completeness_runs_id_seq             TO aidos_agent;
GRANT USAGE, SELECT ON SEQUENCE runtime.completeness_monster_findings_id_seq TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.completeness_runs             FROM aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.completeness_monster_findings FROM aidos_agent;

-- BA29: the INDEPENDENT boundary EFFECT-LOG (gap H2) — runtime.agent_effect captures EACH
-- FS write and EACH MCP call WITNESSED AT THE BOUNDARY, independently of the loop's own
-- AgentRun self-report. BA28 proved a run RE-DERIVES (hash-equality); but hash-equality only
-- proves the RECORD is internally consistent, NOT that the REAL run matched it. A bash
-- side-effect the loop never recorded does not move the recorded hash — yet it is a fidelity
-- breach. This table is the harness-edge's OWN record of what the world saw, so the ledger
-- can RECONCILE it against the run's recorded actions. Expand-only, forward-only, append-only;
-- it ADDS a table + GRANTs and removes nothing (S04 wall_grants, S52 agent_layer, BA26
-- agentrun_replay all untouched).
--
-- BELOW THE WATERLINE, NOT A LAYER (CLAUDE.md §2). An effect is a runtime EVENT (telemetry),
-- never a truth: it carries NO `version` and NO `mirror` column. It is captured by the
-- harness boundary, not authored by the agent's self-report — the whole point of gap H2.
--
-- THE WALL HOLDS (read-only ledger surface). The ledger that READS this table writes no
-- truth. The boundary CAPTURE (the harness edge) records effects append-only: INSERT+SELECT,
-- never UPDATE/DELETE — an effect, once witnessed, is never altered (the audit must be
-- tamper-evident). NO write above the line; this migration grants nothing on kernel/mirrors.
--
-- Idempotent: schema + table + index use IF NOT EXISTS; nothing dropped.

CREATE SCHEMA IF NOT EXISTS runtime;

-- ── runtime.agent_effect — one boundary-witnessed side-effect (below the line) ───────────
-- run     : the AgentRun.id this effect is attributed to (the reconciliation join key).
-- kind    : the closed effect kind (fs_write | mcp_call) — the two observable side-effect
--           classes the harness edge can witness.
-- target  : the path written / the MCP tool called.
-- A run is NOT a foreign key here: an effect may be witnessed for a run the agent role never
-- inserted (precisely the fidelity case — a side-effect attributed to a run that claimed
-- nothing). The ledger reconciles by id; the DB does not pre-judge.
CREATE TABLE IF NOT EXISTS runtime.agent_effect (
    id     bigint GENERATED ALWAYS AS IDENTITY,
    run    text   NOT NULL,
    kind   text   NOT NULL,
    target text   NOT NULL,
    CONSTRAINT agent_effect_pkey PRIMARY KEY (id),
    CONSTRAINT agent_effect_kind_chk CHECK (kind IN ('fs_write', 'mcp_call'))
);

-- the reconciliation lookup is BY run — index it so "every effect of run X" is cheap.
CREATE INDEX IF NOT EXISTS agent_effect_run_idx ON runtime.agent_effect (run);

-- ── GRANTs — append-only, below the line, for both roles ─────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;
GRANT  USAGE          ON SCHEMA runtime          TO aidos_agent;
GRANT  SELECT, INSERT ON runtime.agent_effect    TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.agent_effect FROM aidos_agent;

GRANT  SELECT, INSERT ON runtime.agent_effect    TO aidos;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.agent_effect FROM aidos;

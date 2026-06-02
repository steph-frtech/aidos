-- S51: harness economics — the DECLARED HarnessCostBudget (above the line, read-only)
-- + the ValueCase / economics snapshot (below the waterline, a Runtime diagnostic).
-- Expand-only, append-only, content-addressed. Never alters or drops a prior table,
-- GRANT, or the read-only posture of the `fitness` schema. S04 wall_grants created the
-- `fitness` schema SELECT-only to the agent + the aidos_agent/aidos roles; S41
-- kernel_debt_snapshot lives beside us in fitness; S40 mutation_runs (the consumed
-- run) is untouched.
--
-- THE WALL (CLAUDE.md §2/§8, KRD §66.3/§70). The HarnessCostBudget is the BAR a cell
-- is measured against — a declared, above-the-line cap (§8 anti-Goodhart: weights /
-- thresholds declared, never learned). It lives in `fitness.harness_cost_budget`,
-- ABOVE the line: the agent is SELECT ONLY (it READS the bar, never authors or raises
-- it). Only the `aidos` CLI writer role declares a budget, and only via an APPROVED
-- ChangeSet (S20). Raising a cap is a /goal (reweight/refine of the declared fitness),
-- never a silent edit.
--
-- The ValueCase + the economics snapshot are a Runtime DIAGNOSTIC below the waterline
-- (`runtime.harness_economics_snapshot`): the agent SELECTs it; only the aidos writer
-- records a snapshot (via a ChangeSet). A snapshot is APPEND-ONLY + CONTENT-ADDRESSED:
-- id = Hash(Canonicalize(body)) over S01/S02's scheme (records.Canonicalize +
-- records.Hash, REUSED not forked). A new evaluation is a NEW ROW, never an UPDATE —
-- nothing about the kernel or the declared budget is altered, and nothing is deleted.
-- kernel_head version-pins the cut the eval was taken against. The enum CHECKs pin the
-- declared closed sets {low,medium,high,critical} / {justified,too_expensive,revisit} /
-- {within_budget,over_budget_justified,over_budget_flagged} in-database.
--
-- Idempotent: schema + tables use IF NOT EXISTS; roles are guarded; GRANTs declarative.

CREATE SCHEMA IF NOT EXISTS fitness;
CREATE SCHEMA IF NOT EXISTS runtime;

-- ── fitness.harness_cost_budget — the DECLARED per-cell cap (above the line) ──────
--   id                          : content address of the canonical budget body.
--   cell_ref                    : the cell this budget caps (KRD §66.3, per-cell).
--   the five caps                : declared above the line, read-only to the agent.
--   max_mutation_runtime_seconds: the duration cap as seconds (the AST "5m" → 300).
--   expected_risk_reduction     : the risk level the budget is expected to buy down.
--   declared_at                 : the wall clock the budget was declared at.
CREATE TABLE IF NOT EXISTS fitness.harness_cost_budget (
    id                           TEXT        NOT NULL,
    cell_ref                     TEXT        NOT NULL,
    max_ci_minutes               INTEGER     NOT NULL,
    max_llm_tokens_per_goal      INTEGER     NOT NULL,
    max_mutation_runtime_seconds INTEGER     NOT NULL,
    max_human_review_minutes     INTEGER     NOT NULL,
    expected_risk_reduction      TEXT        NOT NULL,
    declared_at                  TIMESTAMPTZ NOT NULL,
    CONSTRAINT harness_cost_budget_pkey PRIMARY KEY (id),
    -- caps are non-negative (a negative cap is meaningless).
    CONSTRAINT harness_cost_budget_caps_nonneg_chk CHECK (
        max_ci_minutes >= 0 AND max_llm_tokens_per_goal >= 0
        AND max_mutation_runtime_seconds >= 0 AND max_human_review_minutes >= 0
    ),
    -- expected_risk_reduction is in the CLOSED declared enum (KRD §66.3).
    CONSTRAINT harness_cost_budget_risk_chk
        CHECK (expected_risk_reduction IN ('low', 'medium', 'high', 'critical'))
);

-- one declared budget per cell (the latest declaration wins; new declarations are new
-- content-addressed rows, the cell_ref is the lookup key for the panel).
CREATE INDEX IF NOT EXISTS harness_cost_budget_cell_idx
    ON fitness.harness_cost_budget (cell_ref);

-- ── runtime.harness_economics_snapshot — one immutable row per evaluation ────────
--   id              : Hash(Canonicalize(body)) — the content address of the snapshot.
--   body            : the {budget, cost, decision, value_case} report shape.
--   cell_ref        : the cell the evaluation was taken for.
--   risk_if_broken  : the ValueCase risk (NULL when no value case).
--   decision        : the ValueCase decision (NULL when no value case).
--   verdict         : the EconomicsDecision verdict (closed enum, always present).
--   kernel_head     : the truth head the eval was taken against (version-pinned).
--   mutation_run_ref: the consumed S40 mutation run (NULL when none consumed).
--   block_reason    : the advisory BlockReason when flagged (NULL otherwise).
--   scanned_at      : the wall clock the snapshot was recorded at (passed in —
--                     Evaluate never reads the clock; this is the recorder's stamp).
CREATE TABLE IF NOT EXISTS runtime.harness_economics_snapshot (
    id               TEXT        NOT NULL,
    body             JSONB       NOT NULL,
    cell_ref         TEXT        NOT NULL,
    risk_if_broken   TEXT,
    decision         TEXT,
    verdict          TEXT        NOT NULL,
    kernel_head      TEXT        NOT NULL,
    mutation_run_ref TEXT,
    block_reason     JSONB,
    scanned_at       TIMESTAMPTZ NOT NULL,
    CONSTRAINT harness_economics_snapshot_pkey PRIMARY KEY (id),
    -- the body must be a JSON object carrying the report shape (never a free-form blob).
    CONSTRAINT harness_economics_snapshot_body_shape_chk
        CHECK (jsonb_typeof(body) = 'object'),
    -- risk_if_broken is in the closed enum WHEN present.
    CONSTRAINT harness_economics_snapshot_risk_chk
        CHECK (risk_if_broken IS NULL OR risk_if_broken IN ('low', 'medium', 'high', 'critical')),
    -- decision is in the closed enum WHEN present.
    CONSTRAINT harness_economics_snapshot_decision_chk
        CHECK (decision IS NULL OR decision IN ('justified', 'too_expensive', 'revisit')),
    -- verdict is in the closed enum (always present).
    CONSTRAINT harness_economics_snapshot_verdict_chk
        CHECK (verdict IN ('within_budget', 'over_budget_justified', 'over_budget_flagged'))
);

-- Fast "latest snapshot per cell" lookup for the /harness-economics panel.
CREATE INDEX IF NOT EXISTS harness_economics_snapshot_latest_idx
    ON runtime.harness_economics_snapshot (cell_ref, scanned_at DESC);

-- Roles (guarded for order-independence; S01/S04 create them).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END
$$;

-- ── The wall: the agent is SELECT-only on the DECLARED budget (above the line) ───
-- fitness is read-only to the agent — it READS the budget (the bar), never writes it.
GRANT USAGE  ON SCHEMA fitness                       TO aidos_agent;
GRANT SELECT ON fitness.harness_cost_budget          TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON fitness.harness_cost_budget FROM aidos_agent;
REVOKE CREATE ON SCHEMA fitness FROM aidos_agent;

-- The aidos CLI writer declares a budget (via an approved ChangeSet): INSERT + SELECT
-- only — never UPDATE/DELETE/TRUNCATE (a declared budget is content-addressed; a new
-- declaration is a new row).
GRANT USAGE          ON SCHEMA fitness               TO aidos;
GRANT SELECT, INSERT ON fitness.harness_cost_budget  TO aidos;
REVOKE UPDATE, DELETE, TRUNCATE
    ON fitness.harness_cost_budget FROM aidos;

-- ── The Runtime snapshot (below the waterline): agent SELECT, aidos appends ──────
GRANT USAGE  ON SCHEMA runtime                            TO aidos_agent;
GRANT SELECT ON runtime.harness_economics_snapshot        TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON runtime.harness_economics_snapshot FROM aidos_agent;

GRANT USAGE          ON SCHEMA runtime                     TO aidos;
GRANT SELECT, INSERT ON runtime.harness_economics_snapshot TO aidos;
REVOKE UPDATE, DELETE, TRUNCATE
    ON runtime.harness_economics_snapshot FROM aidos;

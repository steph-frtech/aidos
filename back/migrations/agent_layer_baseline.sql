-- S52: the agent as a GOVERNED LAYER — kernel.agent_layer (the SOURCE, above the
-- line) + the runtime.agent_run / agent_action / agent_assignment runtime events
-- (below the waterline, NOT layers). Expand-only, append-only, content-addressed.
-- Never alters or drops a prior table, GRANT, or posture (S02 kernel records, S04
-- wall_grants, the runtime schema from S51 all untouched).
--
-- THE WALL (CLAUDE.md §2/§8, KRD §21/§13.8). A CoucheAgent is a SOURCE/truth: it
-- lives in kernel.agent_layer, ABOVE the line. The agent DB role is SELECT ONLY on
-- it — no agent, whatever its role, writes the kernel (this row is itself governed
-- by the wall it describes). Only the `aidos` CLI writer role declares an agent
-- layer, and only via an APPROVED ChangeSet (S20). The row is content-addressed
-- (id = Hash(Canonicalize(body)) over S01/S02's scheme, REUSED not forked).
--
-- The runtime.agent_* tables are RUNTIME EVENTS below the waterline — append-only
-- telemetry of what an agent DID, NOT truth, NOT layers. They carry NO `version`
-- and NO `mirror` column (by construction a run cannot carry what would make it a
-- layer/truth). The agent gets INSERT/SELECT on runtime.* (it records its own runs,
-- below the line) but NO grant whatsoever on kernel/mirrors/fitness writes — exactly
-- the asymmetry the governance fixture proves.
--
-- Idempotent: schema + tables use IF NOT EXISTS; roles are guarded; GRANTs declarative.

CREATE SCHEMA IF NOT EXISTS kernel;
CREATE SCHEMA IF NOT EXISTS runtime;

-- ── kernel.agent_layer — the CoucheAgent SOURCE (above the line) ──────────────────
--   id            : content address of the canonical agent-layer body.
--   body          : the {kind, spec, bindings/policies, autorite, scope} JSONB shape.
--   version       : == id (content-addressed, S02).
--   superseded_by : closes the prior head when a new version is declared (append-only).
--   created_at    : the wall clock the layer was declared at.
CREATE TABLE IF NOT EXISTS kernel.agent_layer (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agent_layer_pkey PRIMARY KEY (id),
    -- the body must be a JSON object (never a free-form blob).
    CONSTRAINT agent_layer_body_shape_chk CHECK (jsonb_typeof(body) = 'object'),
    -- the layer-kind is pinned inside the body lane to the closed agent triad (S35 add).
    CONSTRAINT agent_layer_kind_chk
        CHECK ((body->>'kind') IN ('agent', 'equipe_agents', 'orchestration'))
);

CREATE INDEX IF NOT EXISTS agent_layer_kind_idx ON kernel.agent_layer ((body->>'kind'));

-- ── runtime.agent_run — one execution (below the line, NOT a layer) ──────────────
--   id          : Hash(Canonicalize(body)) — content address of the run.
--   body        : the {agent, goal, red_work_item, context_pack, actions, result, …} shape.
--   result      : the closed outcome enum (always present).
--   NO version / NO mirror column — a run is unrepresentable as a layer.
CREATE TABLE IF NOT EXISTS runtime.agent_run (
    id         TEXT        NOT NULL,
    body       JSONB       NOT NULL,
    result     TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agent_run_pkey PRIMARY KEY (id),
    CONSTRAINT agent_run_body_shape_chk CHECK (jsonb_typeof(body) = 'object'),
    CONSTRAINT agent_run_result_chk
        CHECK (result IN ('green', 'still_red', 'blocked', 'abandoned'))
);

-- ── runtime.agent_action — one attempted action inside a run (below the line) ────
--   autorisee     : the wall verdict (allowed by the wall?).
--   block_reason  : the S13 BlockReason when refused (NULL when allowed).
CREATE TABLE IF NOT EXISTS runtime.agent_action (
    id           TEXT        NOT NULL,
    body         JSONB       NOT NULL,
    autorisee    BOOLEAN     NOT NULL,
    block_reason JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agent_action_pkey PRIMARY KEY (id),
    CONSTRAINT agent_action_body_shape_chk CHECK (jsonb_typeof(body) = 'object')
);

-- ── runtime.agent_assignment — a lease of a red work item to an agent (below) ────
CREATE TABLE IF NOT EXISTS runtime.agent_assignment (
    id         TEXT        NOT NULL,
    body       JSONB       NOT NULL,
    statut     TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agent_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT agent_assignment_body_shape_chk CHECK (jsonb_typeof(body) = 'object'),
    CONSTRAINT agent_assignment_statut_chk
        CHECK (statut IN ('leased', 'running', 'released', 'expired'))
);

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

-- ── The wall: the agent is SELECT-only on kernel.agent_layer (above the line) ────
-- A CoucheAgent is a SOURCE/truth — the agent READS its own governance, never writes
-- it. (This row is itself governed by the wall it describes.)
GRANT USAGE  ON SCHEMA kernel             TO aidos_agent;
GRANT SELECT ON kernel.agent_layer        TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON kernel.agent_layer FROM aidos_agent;
REVOKE CREATE ON SCHEMA kernel FROM aidos_agent;

-- The aidos CLI writer declares an agent layer (via an approved ChangeSet): INSERT +
-- SELECT + UPDATE (to close superseded_by) — never DELETE/TRUNCATE (append-only truth).
GRANT USAGE                  ON SCHEMA kernel      TO aidos;
GRANT SELECT, INSERT, UPDATE ON kernel.agent_layer TO aidos;
REVOKE DELETE, TRUNCATE ON kernel.agent_layer FROM aidos;

-- ── The runtime events (below the waterline): agent INSERT+SELECT, append-only ───
-- The agent records its OWN runs below the line (runtime telemetry). INSERT+SELECT
-- only — never UPDATE/DELETE (append-only; a run is never altered or deleted).
GRANT USAGE          ON SCHEMA runtime              TO aidos_agent;
GRANT SELECT, INSERT ON runtime.agent_run           TO aidos_agent;
GRANT SELECT, INSERT ON runtime.agent_action        TO aidos_agent;
GRANT SELECT, INSERT ON runtime.agent_assignment    TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.agent_run        FROM aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.agent_action     FROM aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.agent_assignment FROM aidos_agent;

GRANT USAGE          ON SCHEMA runtime              TO aidos;
GRANT SELECT, INSERT ON runtime.agent_run           TO aidos;
GRANT SELECT, INSERT ON runtime.agent_action        TO aidos;
GRANT SELECT, INSERT ON runtime.agent_assignment    TO aidos;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.agent_run        FROM aidos;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.agent_action     FROM aidos;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.agent_assignment FROM aidos;

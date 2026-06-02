-- S26: the curation decision + the QD niche élite — dag.curation_decision and
-- dag.niche_elite. The ArchiveCurationPolicy (KRD §44.4) keeps the version DAG a LIVING
-- MEMORY rather than an infinite dump (a `décharge`) by classifying each node keep /
-- compress / tombstone; the quality-diversity selection (KRD §62, algorithm ②, MAP-Elites)
-- keeps ONE élite per behavioral niche. Expand-only, append-only, ADDITIVE. It NEVER alters
-- or drops a prior table — the S02 dag.phase, S23 dag.stable_phase and the S04/S23 wall
-- GRANTs are UNTOUCHED.
--
-- CRITICAL HISTORY IS NEVER DESTROYED (KRD §44.4, §12): a tombstone is a DECISION ROW in
-- dag.curation_decision — it MARKS a node, it is NOT a DELETE/DROP on a DAG node; a compress
-- is likewise a decision, not a deletion. There is NO DELETE/TRUNCATE granted to anyone on a
-- DAG node here. A new élite is a NEW ROW in dag.niche_elite (append-only) — never an UPDATE
-- of a prior élite, so the niche's élite history stays inspectable.
--
-- THE WALL (CLAUDE.md §2): dag is a TRUTH schema ABOVE the waterline. The agent DB role gets
-- SELECT ONLY on both tables — it READS the verdicts for the /archive-curation panel, but it
-- can NEVER write a decision or an élite. Only the privileged `aidos` CLI writer role INSERTs,
-- via an approved ChangeSet (the S20 changeset commit-gate). This migration opens NO write door
-- above the line for the agent. UPDATE/DELETE/TRUNCATE are withheld from BOTH roles: a decision
-- and an élite are content-addressed / append-only — a new fact is a NEW row, never an in-place
-- edit (KRD §12).
--
-- CONTENT-ADDRESSED: dag.curation_decision.id = SHA-256 of the canonical decision body (S02
-- records.Canonicalize + records.Hash, reused — never forked). {node_id, verdict, reason,
-- policy_version} live in the row; the body is the recorded fact.
--
-- Idempotent: schema + tables use IF NOT EXISTS; roles are guarded; GRANTs are declarative.
-- The Go suite applies the S02 baseline (dag schema + dag.phase) then this baseline against a
-- throwaway real Postgres.

CREATE SCHEMA IF NOT EXISTS dag;

-- dag.curation_decision — one immutable, content-addressed curation verdict per (node, policy).
--   id            : SHA-256 of the canonical decision body (= the decision's content address).
--   node_id       : the DAG node this decision is about (traces to a real node, never invented).
--                   NOTE: a tombstone/compress here MARKS the node — it is NOT a deletion of any
--                   dag.* row. The node referenced stays present (append-only).
--   verdict       : the band — keep | compress | tombstone (CHECK-constrained to the closed set).
--   reason        : the band/predicate that decided the verdict (e.g. "tombstone:unsafe").
--   policy_version: the ArchiveCurationPolicy version that produced this decision (traceability).
--   decided_at    : the decision instant (append-only audit).
CREATE TABLE IF NOT EXISTS dag.curation_decision (
    id             TEXT        NOT NULL,
    node_id        TEXT        NOT NULL,
    verdict        TEXT        NOT NULL,
    reason         TEXT        NOT NULL,
    policy_version TEXT        NOT NULL,
    decided_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT curation_decision_pkey PRIMARY KEY (id),
    CONSTRAINT curation_decision_verdict_chk
        CHECK (verdict IN ('keep', 'compress', 'tombstone'))
);

-- Fast "what is this node's verdict?" lookup for the /archive-curation ledger.
CREATE INDEX IF NOT EXISTS curation_decision_node_idx
    ON dag.curation_decision (node_id);

-- dag.niche_elite — the MAP-Elites placement: one row per recorded niche élite (KRD §62).
--   niche_key     : the DECLARED behavioral descriptor (the niche key) — never a learned embedding.
--   elite_node_id : the variant promoted as this niche's élite (a real DAG node; green-mirror only).
--   fitness       : the ANCHORED fitness snapshot (consumed from the prior fitness steps) as JSONB.
--   recorded_at   : the recording instant — part of the PK so a NEW élite is a NEW ROW (append-only),
--                   never an UPDATE; the niche's élite history stays inspectable.
CREATE TABLE IF NOT EXISTS dag.niche_elite (
    niche_key     TEXT        NOT NULL,
    elite_node_id TEXT        NOT NULL,
    fitness       JSONB       NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT niche_elite_pkey PRIMARY KEY (niche_key, recorded_at)
);

-- Fast "current élite per niche" lookup (latest recorded_at per niche_key).
CREATE INDEX IF NOT EXISTS niche_elite_niche_idx
    ON dag.niche_elite (niche_key, recorded_at DESC);

-- ── Roles (guard in case this migration runs before S01/S04) ──────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END
$$;

-- The wall (CLAUDE.md §2): dag is above the waterline. The agent role gets SELECT ONLY — it
-- reads the curation ledger + the niche grid for /archive-curation, but NEVER writes a decision
-- or an élite. All writes are revoked from the agent.
GRANT USAGE  ON SCHEMA dag                 TO aidos_agent;
GRANT SELECT ON dag.curation_decision      TO aidos_agent;
GRANT SELECT ON dag.niche_elite            TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON dag.curation_decision FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON dag.niche_elite       FROM aidos_agent;

-- The `aidos` writer role: the single door to truth — INSERT + SELECT through an approved
-- ChangeSet (the changeset commit-gate). UPDATE/DELETE withheld: a decision is content-addressed
-- and a niche élite is append-only — a changed verdict / a new champion is a NEW ROW (a new
-- hash / a new recorded_at), never an in-place edit (KRD §12, append-only). A tombstone/compress
-- is a decision row; NEITHER role may DELETE/DROP a DAG node.
GRANT USAGE          ON SCHEMA dag            TO aidos;
GRANT SELECT, INSERT ON dag.curation_decision TO aidos;
GRANT SELECT, INSERT ON dag.niche_elite        TO aidos;

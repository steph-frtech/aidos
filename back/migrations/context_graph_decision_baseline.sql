-- S32: ContextGraphDecision baseline migration — the `context` truth schema's reuse-decision
-- ledger table (KRD §119.2).
--
-- Expand-only, append-only. It ADDS one schema (context) and one content-addressed, append-only
-- table (context.context_graph_decision) plus one GRANT set; it never alters or drops a prior
-- table or GRANT (CLAUDE.md §9, the anti-overwrite rule). The wall (S04) is UNCHANGED and
-- re-asserted below.
--
-- THE `context` SCHEMA (CLAUDE.md §1; KRD §119.2): holds "the derived ContextGraph + the
-- ContextGraphDecision (reuse allowed or not)". A ContextGraphDecision is the DETERMINISTIC,
-- LLM-FREE control-plane verdict on whether a PAST decision/MemoryItem may be REUSED for a new
-- request — it checks EXACTLY four declared dimensions (time / scope / authority / conditions)
-- and is false-dominant. The verdict body is {may_reuse, reason, checked, required_human_review}
-- (KRD §119.2). The LLM does NOT live in this layer.
--
-- THE WALL (CLAUDE.md §2 / S04): `context` is a TRUTH schema ABOVE the waterline (unlike the
-- `brain` store, which is below-the-line fuel and writable). So the agent DB role gets SELECT
-- ONLY on context.context_graph_decision — it reads the reuse ledger for display, it NEVER
-- writes it. Only the `aidos` CLI writer role INSERTs a decision, via an approved ChangeSet
-- (S20). A decision is a ROW, never an UPDATE — a re-evaluation is a NEW row (append-only); the
-- agent gets no UPDATE/DELETE on the table either way.
--
-- The id is the content hash of the canonical decision body (S01/S02 content-addressing): the
-- same {candidate_id, may_reuse, reason, checked, required_human_review} always lands at the
-- same address. Append-only: a decision row is KEPT, never destroyed (no DELETE grant).

CREATE SCHEMA IF NOT EXISTS context;

CREATE TABLE IF NOT EXISTS context.context_graph_decision (
    -- id = Hash(Canonicalize(body)) — the content address of the decision body (S01/S02).
    id                    text        PRIMARY KEY,
    -- candidate_id references the reused past decision / MemoryItem (S15/S16/S31 pinned id).
    candidate_id          text        NOT NULL,
    -- may_reuse is the false-dominant verdict: true iff ALL four declared checks passed.
    may_reuse             boolean     NOT NULL,
    -- reason is the human-readable explanation (names the failing dimension when blocked).
    reason                text        NOT NULL,
    -- checked records which of the four dimensions were evaluated (time/scope/authority/conditions).
    checked               text[]      NOT NULL,
    -- required_human_review is set when the candidate's authority no longer holds.
    required_human_review boolean     NOT NULL,
    -- request_ctx is the new request the candidate's reuse was judged against (scope/domain/facts).
    request_ctx           jsonb       NOT NULL,
    -- decided_at is when the verdict was recorded.
    decided_at            timestamptz NOT NULL
);

-- Defense in depth: `checked` may only carry the EXACTLY FOUR declared dimensions (KRD §119.2);
-- no invented fifth dimension can be persisted, even via a hand-crafted INSERT.
ALTER TABLE context.context_graph_decision
    DROP CONSTRAINT IF EXISTS cgd_checked_dimensions_chk;
ALTER TABLE context.context_graph_decision
    ADD CONSTRAINT cgd_checked_dimensions_chk
    CHECK (checked <@ ARRAY['time', 'scope', 'authority', 'conditions']::text[]);

-- A granted reuse (may_reuse=true) is false-dominant ⇒ it must have evaluated ALL FOUR
-- dimensions. A true verdict with fewer than four checked dimensions is structurally impossible.
ALTER TABLE context.context_graph_decision
    DROP CONSTRAINT IF EXISTS cgd_true_implies_all_four_chk;
ALTER TABLE context.context_graph_decision
    ADD CONSTRAINT cgd_true_implies_all_four_chk
    CHECK (
        may_reuse = false
        OR (
            'time' = ANY (checked)
            AND 'scope' = ANY (checked)
            AND 'authority' = ANY (checked)
            AND 'conditions' = ANY (checked)
        )
    );

-- A granted reuse can never also require human review (the two are mutually exclusive verdicts).
ALTER TABLE context.context_graph_decision
    DROP CONSTRAINT IF EXISTS cgd_reuse_excludes_review_chk;
ALTER TABLE context.context_graph_decision
    ADD CONSTRAINT cgd_reuse_excludes_review_chk
    CHECK (NOT (may_reuse = true AND required_human_review = true));

-- ── Roles (guarded; created at S01/S04) ──────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- ── `context` is a TRUTH schema ABOVE the waterline: the agent reads, NEVER writes ───
-- Unlike brain.* (below-the-line fuel, writable), context.context_graph_decision is truth: the
-- agent gets SELECT ONLY (it renders the reuse ledger). It NEVER gets INSERT/UPDATE/DELETE — a
-- decision is recorded only by the `aidos` writer role via an approved ChangeSet (S20), and a
-- re-evaluation is a new row, never an UPDATE.
GRANT USAGE ON SCHEMA context TO aidos_agent;
GRANT SELECT ON context.context_graph_decision TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON context.context_graph_decision FROM aidos_agent;
REVOKE CREATE ON SCHEMA context FROM aidos_agent;

-- Future tables in context.* default to SELECT-only for the agent (truth, above the line).
ALTER DEFAULT PRIVILEGES IN SCHEMA context GRANT SELECT ON TABLES TO aidos_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA context REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM aidos_agent;

-- ── The wall is UNCHANGED — re-assert SELECT-only on the truth schemas ────────
-- This migration provably does NOT weaken S02/S04/S27/S30: the agent can NEVER write the kernel,
-- mirrors, fitness, or now context. context.* joins the truth side of the wall (SELECT-only).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA kernel  FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA mirrors FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA fitness FROM aidos_agent;
REVOKE CREATE ON SCHEMA kernel  FROM aidos_agent;
REVOKE CREATE ON SCHEMA mirrors FROM aidos_agent;
REVOKE CREATE ON SCHEMA fitness FROM aidos_agent;

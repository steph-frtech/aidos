-- S29: Goal engine baseline migration (the ideas.goal promotion record).
--
-- Expand-only, append-only. It ADDS one table — ideas.goal — and one GRANT set; it
-- never alters or drops a prior table or GRANT (CLAUDE.md §9, the anti-overwrite rule).
--
-- THE GOAL (KRD §56–§59, §63 ①, LIVRE XX): a goal is the promotion record above
-- `product` — the door `idea → mirror → /goal`. It pins the source idea, the DRAFT
-- ChangeSet (S20) it opened (carrying the idea's spec_delta + mirror_delta atomically),
-- the RED SET (the failing mirror refs that ARE the goal, §56) held INSIDE the JSONB
-- body (version-pinned refs, NOT foreign keys — a recorded goal must stay inspectable
-- after heads move), the COMPUTED status (OPEN | CLOSED — never declared by the agent),
-- and the DECLARED budgets (time/turns/tokens, the secondary anti-runaway guard).
--
-- THE WALL (CLAUDE.md §2): the agent DB role gets SELECT ONLY on ideas.goal. Only the
-- `aidos` CLI writer role INSERTS a goal and STAMPS it CLOSED; the DRAFT→APPLIED
-- ChangeSet transition stays owned by S20's commit-gate. The agent NEVER writes truth
-- and NEVER stamps a goal CLOSED — "done" is computed (IsClosed), never declared.
--
-- The id is the content hash of the canonical goal body (S02 content-addressing): the
-- same {idea_ref, changeset_ref, red_set, budgets} always lands at the same address.
-- Status is lifecycle metadata that ADVANCES (OPEN→CLOSED) without changing the id.

CREATE SCHEMA IF NOT EXISTS ideas;

CREATE TABLE IF NOT EXISTS ideas.goal (
    -- id = Hash(Canonicalize(body)) — the content address of the goal body.
    id            text        PRIMARY KEY,
    -- body holds {idea_ref, changeset_ref, red_set, status, budgets}; the red set lives
    -- INSIDE the body as version-pinned mirror refs (not foreign keys).
    body          jsonb       NOT NULL,
    -- idea_ref pins the source candidate-truth (FK-by-ref into ideas.idea, version-pinned).
    idea_ref      text        NOT NULL,
    -- changeset_ref pins the DRAFT ChangeSet (S20) this goal opened (FK-by-ref).
    changeset_ref text        NOT NULL,
    -- status is the COMPUTED lifecycle state — OPEN | CLOSED, nothing else.
    status        text        NOT NULL,
    -- created_at is the goal-opening timestamp; closed_at is set only when CLOSED.
    created_at    timestamptz NOT NULL,
    closed_at     timestamptz NULL
);

-- The status set is CLOSED — OPEN | CLOSED, no third status. Idempotent (drop-then-add)
-- so re-applying the declarative migration is safe (Atlas expand semantics).
ALTER TABLE ideas.goal
    DROP CONSTRAINT IF EXISTS goal_status_chk;
ALTER TABLE ideas.goal
    ADD CONSTRAINT goal_status_chk
    CHECK (status IN ('OPEN', 'CLOSED'));

-- closed_at is set IFF the goal is CLOSED — the computed stop stamp (KRD §57 ①). An OPEN
-- goal has no closed_at; a CLOSED goal has one. This pins the invariant that the agent
-- cannot fabricate a close (it has no UPDATE grant anyway — see GRANTs below).
ALTER TABLE ideas.goal
    DROP CONSTRAINT IF EXISTS goal_closed_at_consistency_chk;
ALTER TABLE ideas.goal
    ADD CONSTRAINT goal_closed_at_consistency_chk
    CHECK (
        (status = 'OPEN'   AND closed_at IS NULL) OR
        (status = 'CLOSED' AND closed_at IS NOT NULL)
    );

-- The status held in the JSONB body must agree with the column (no drift between the
-- content-addressed body and the lifecycle column).
ALTER TABLE ideas.goal
    DROP CONSTRAINT IF EXISTS goal_body_status_agrees_chk;
ALTER TABLE ideas.goal
    ADD CONSTRAINT goal_body_status_agrees_chk
    CHECK (body ->> 'status' = status);

-- GRANTs — the wall (CLAUDE.md §2). The agent role exists from S01/S02.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA ideas TO aidos_agent;

-- SELECT ONLY for the agent on ideas.goal. Unlike ideas.idea (which the agent may
-- INSERT/UPDATE — capture and advance candidate-truths), a GOAL is the promotion record:
-- opening a goal and stamping it CLOSED are TRUTH writes owned by the aidos CLI role via
-- the /goal flow + S20's commit-gate. The agent reads the goal (the Workbench renders it)
-- but NEVER opens or closes it. The asymmetry IS the non-gameable stop in the schema:
-- the agent literally cannot write a CLOSED row.
GRANT SELECT ON ideas.goal TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ideas.goal FROM aidos_agent;

-- The wall is UNCHANGED. Re-assert SELECT-only on the truth schemas so this migration
-- provably does not weaken S02/S04/S27: the agent can NEVER write the kernel or mirrors.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.truth   FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.layer   FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link    FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror FROM aidos_agent;

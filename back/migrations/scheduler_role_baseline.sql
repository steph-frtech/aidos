-- BA20: the SCHEDULER ROLE + fencing — a NEW Postgres role `aidos_scheduler` that
-- alone may TRANSITION a RedWorkItem (open→claimed) by writing
-- runtime.red_work_queue.{status, owner_agent, lease_until, lease_epoch}, and may
-- explicitly SELECT the CoucheAgent SOURCE (kernel.agent_layer) so it can MatchRole
-- (gap E4). Expand-contract, forward-only, append-only audit. Never alters or drops a
-- prior table, GRANT, or posture (S04 wall_grants, S22 red_work_queue, S52
-- agent_layer all untouched).
--
-- WHY A NEW ROLE (CLAUDE.md §2, the wall — unchanged). The S22 migration delivers
-- runtime.red_work_queue WRITE-ONLY to the agent: aidos_agent gets INSERT+SELECT but
-- NEVER UPDATE/DELETE — the agent records its own worklist below the line, but it
-- CANNOT claim/lease/resolve an item. Draining the queue (open→claimed) is the
-- scheduler's job, and the scheduler must be a DISTINCT, fail-closed role so that
-- "drain the queue" is mechanically separable from "be an agent". This migration
-- creates that role and gives it EXACTLY one write door: UPDATE of the four
-- transition columns on runtime.red_work_queue. The agent role is UNTOUCHED here
-- (it stays INSERT+SELECT; the S22 REVOKE of UPDATE/DELETE still holds).
--
-- THE FENCING TOKEN (gap E2). The transition columns gain `lease_epoch` — a monotone
-- per-item counter the scheduler bumps on every (re)lease. The write-path fencing
-- (BA22) refuses any agent write carrying a STALE epoch: an agent A whose lease
-- expired and whose item was re-leased to B (epoch++) cannot lost-update on wake.
-- BA20 only OPENS the column + the role's right to bump it; the planner/enforcer is
-- a later step. lease_epoch defaults to 0 (no lease yet) and is bumped by the
-- scheduler, never by the agent.
--
-- THE SCHEDULER IS NOT A SECOND PRIVILEGED WRITER. The explicit, asserted boundary:
-- aidos_scheduler has NO INSERT/UPDATE/DELETE on ANY truth schema (kernel / mirrors /
-- fitness). It SELECTs kernel.agent_layer (read the CoucheAgent specs for MatchRole)
-- and UPDATEs only runtime.red_work_queue's transition columns — that is its whole
-- surface. The roundtrip+GRANT mirror asserts this GRANT shape end-to-end so
-- "scheduler" never silently grows into a 2nd `aidos` writer role.
--
-- Idempotent: column add uses IF NOT EXISTS; role is guarded; GRANT/REVOKE declarative.
-- Forward-only: it ADDS a nullable-with-default column and a role; it drops nothing.

CREATE SCHEMA IF NOT EXISTS runtime;

-- ── EXPAND: AgentAssignment / RedWorkItem gain a monotone lease_epoch (fencing) ──────
-- The fencing token. 0 = never leased. The scheduler bumps it on every (re)lease;
-- a stale-epoch write is fenced at the write-path (BA22). Forward-only, default 0.
ALTER TABLE runtime.red_work_queue
    ADD COLUMN IF NOT EXISTS lease_epoch BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
    -- the epoch is monotone-nonnegative (a lease count never goes negative).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'red_work_queue_lease_epoch_chk'
    ) THEN
        ALTER TABLE runtime.red_work_queue
            ADD CONSTRAINT red_work_queue_lease_epoch_chk CHECK (lease_epoch >= 0);
    END IF;
END
$$;

-- ── The NEW scheduler role (guarded; NOLOGIN like the agent/aidos roles) ────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_scheduler') THEN
        CREATE ROLE aidos_scheduler NOLOGIN;
    END IF;
END
$$;

-- Roles the wall already created (guarded for order-independent Testcontainers runs).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- ── The scheduler's ONLY write door: UPDATE the four transition columns ──────────────
-- The scheduler claims/leases/fences an item by writing status, owner_agent,
-- lease_until and lease_epoch — and NOTHING else. A column-scoped GRANT is the
-- mechanical "least privilege": the scheduler cannot rewrite target/reason/wave_id/
-- dependencies/created_at (the immutable identity of the work item). SELECT lets it
-- read the queue to plan.
GRANT USAGE  ON SCHEMA runtime TO aidos_scheduler;
GRANT SELECT ON runtime.red_work_queue TO aidos_scheduler;
GRANT UPDATE (status, owner_agent, lease_until, lease_epoch)
    ON runtime.red_work_queue TO aidos_scheduler;

-- The scheduler NEVER inserts new work items (the agent/PostKernelChange does) and
-- NEVER deletes/truncates (append-only audit of the worklist).
REVOKE INSERT, DELETE, TRUNCATE ON runtime.red_work_queue FROM aidos_scheduler;

-- ── The scheduler READS the CoucheAgent SOURCE for MatchRole (gap E4) ────────────────
-- The scheduler must read the agent specs to match a RedWorkItem's layer to an
-- agent's declared Role. It gets SELECT on kernel.agent_layer — and NOTHING WRITABLE
-- above the line. This is the asserted boundary: read truth, never write it.
GRANT USAGE  ON SCHEMA kernel      TO aidos_scheduler;
GRANT SELECT ON kernel.agent_layer TO aidos_scheduler;

-- ── THE WALL HOLDS for the scheduler: NO truth write, ever ───────────────────────────
-- aidos_scheduler is NOT a second privileged writer. It has NO INSERT/UPDATE/DELETE on
-- any truth schema. We REVOKE every write on kernel/mirrors/fitness (and CREATE) so the
-- roundtrip+GRANT mirror can assert it positively. (USAGE on mirrors/fitness is not
-- granted — the scheduler has no business reading the mirror/fitness internals; it
-- only needs the agent specs in kernel.agent_layer.)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.agent_layer FROM aidos_scheduler;
REVOKE CREATE ON SCHEMA kernel  FROM aidos_scheduler;

-- ── The agent role is UNTOUCHED: still INSERT+SELECT, still NO transition ────────────
-- Re-state S22's posture so this migration is self-contained and order-independent:
-- the agent writes its own worklist (INSERT) and reads it (SELECT) but CANNOT claim,
-- lease or fence an item (no UPDATE) — the wall, unchanged.
GRANT  USAGE         ON SCHEMA runtime         TO aidos_agent;
GRANT  INSERT, SELECT ON runtime.red_work_queue TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.red_work_queue FROM aidos_agent;

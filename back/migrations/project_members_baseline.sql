-- project_members_baseline.sql — AIDOS S62 (app-builder EPIC 3).
--
-- PROJECT MEMBERSHIP & OWNERSHIP. The join the roadmap names: (user × project × role
-- owner/editor/viewer). It completes the multi-tenant model — until S62 the S55 RLS keyed
-- only on "the identity GUC is PRESENT"; THIS migration delivers the membership predicate it
-- deferred ("the identity match to a per-project membership row is S62"): a row is in scope
-- iff the propagated identity holds a MEMBERSHIP row in the active project. A VALID,
-- authenticated identity that is NOT a member sees ZERO rows (NOT_A_MEMBER, the third,
-- independent layer — back/runtime/membership is the Go twin).
--
-- AUTH LIVES OUTSIDE THE KERNEL (ROADMAP S61/S62). accounts.project_members is in the
-- `accounts` schema (its own below-the-line zone) — NOT kernel/mirrors/fitness. invite /
-- remove / change-role are below-the-line server actions; the agent role may read/write this
-- table (the store path). The wall on the truth zones is UNCHANGED (re-asserted at the
-- bottom). A membership row is content-addressed and append-only, exactly like a user (S61):
--   id = SHA-256 of {kind:"project_member", identity, project_id, role}
--        (back/runtime/membership.NewMembership)
-- so the same (identity, project, role) is idempotent and a role CHANGE writes a NEW row.
-- Soft-delete only — a removed membership is marked revoked, never physically destroyed.
--
-- project.owner_ref GAINS A REAL OWNER (S53 → S62). S53 carried owner_ref as a free string;
-- S62 makes it resolve to a REAL owner — a project's creator is seeded an OWNER membership,
-- and the only members that may administer (invite/remove/role) are owners.
--
-- EXPAND-CONTRACT, FORWARD-ONLY, APPEND-ONLY, IDEMPOTENT (CLAUDE.md §1/§9). It creates the
-- NEW accounts.project_members table and REPLACES app.in_active_scope to add the membership
-- predicate (CREATE OR REPLACE — re-running is a no-op); it NEVER drops a prior table or
-- weakens the wall.
--
-- DEPENDS ON: accounts_baseline.sql (the accounts schema + users), projects_baseline.sql
-- (projects.project), project_rls_baseline.sql (app.in_active_scope it REPLACES). Run AFTER
-- all three.

CREATE SCHEMA IF NOT EXISTS accounts;

-- ============================================================================
-- (1) accounts.project_members — the (identity × project × role) join. Content-addressed
--     (id = membership.NewMembership), append-only, soft-delete only.
-- ============================================================================
CREATE TABLE IF NOT EXISTS accounts.project_members (
    id          TEXT        NOT NULL,
    identity    TEXT        NOT NULL,
    project_id  TEXT        NOT NULL,
    role        TEXT        NOT NULL,
    body        JSONB       NOT NULL,
    version     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ,
    CONSTRAINT project_members_pkey PRIMARY KEY (id)
);

-- The role is the closed three — no fourth role (the membership.Role gradient).
ALTER TABLE accounts.project_members
    DROP CONSTRAINT IF EXISTS project_members_role_chk;
ALTER TABLE accounts.project_members
    ADD CONSTRAINT project_members_role_chk
    CHECK (role IN ('owner', 'editor', 'viewer'));

-- The content address must equal the version (KRD §12: a head row's id == version).
ALTER TABLE accounts.project_members
    DROP CONSTRAINT IF EXISTS project_members_content_address_chk;
ALTER TABLE accounts.project_members
    ADD CONSTRAINT project_members_content_address_chk CHECK (id = version);

-- One ACTIVE (non-revoked) membership per (identity, project): a role change revokes the old
-- row and inserts a new one, so an identity never holds two live roles in one project.
CREATE UNIQUE INDEX IF NOT EXISTS project_members_identity_project_uq
    ON accounts.project_members (identity, project_id)
    WHERE revoked_at IS NULL;

-- Fast membership lookup (the RLS predicate + the authority's row read).
CREATE INDEX IF NOT EXISTS project_members_project_idx
    ON accounts.project_members (project_id) WHERE revoked_at IS NULL;

-- ============================================================================
-- (2) app.is_member — the membership predicate S55's RLS deferred. A row's project is in
--     scope for the active identity IFF that identity holds a NON-REVOKED membership in it.
--     STABLE, NULL-safe (a missing identity GUC ⇒ the EXISTS is false ⇒ zero rows).
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS app;

-- SECURITY DEFINER: the function runs with the owner's (aidos) rights so the membership
-- read does NOT depend on the agent's table GRANTs (the agent only needs EXECUTE on the
-- function + USAGE on schema app, granted below). search_path is pinned (no shadowing).
CREATE OR REPLACE FUNCTION app.is_member(row_project_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = accounts, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM accounts.project_members pm
        WHERE pm.project_id = row_project_id
          AND pm.identity  = nullif(current_setting('app.identity', true), '')
          AND pm.revoked_at IS NULL
    )
$$;

-- ============================================================================
-- (3) REPLACE app.in_active_scope to ADD the membership predicate. S55 required the active
--     project match + the identity GUC be PRESENT; S62 strengthens "present" to "is a member
--     of this project". A VALID identity that is NOT a member now sees ZERO rows (NOT_A_MEMBER
--     at the RLS layer — the second backstop of the Go authority). STRICTLY tighter than S55
--     (it never widens scope), so it cannot weaken any prior guarantee.
-- ============================================================================
CREATE OR REPLACE FUNCTION app.in_active_scope(row_project_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        -- the active project GUC must be set and equal the row's project (S55)
        nullif(current_setting('app.project', true), '') IS NOT NULL
        AND row_project_id = current_setting('app.project', true)
        -- AND the propagated identity GUC must be set (S55)
        AND nullif(current_setting('app.identity', true), '') IS NOT NULL
        -- AND (S62) the identity must hold a membership row in this project
        AND app.is_member(row_project_id)
$$;

-- ============================================================================
-- (4) GRANTs. The agent/app role may read/write accounts.project_members below the line
--     (invite/remove/role server actions). Soft-delete only — no DELETE/TRUNCATE (the hard
--     GDPR delete is S116). Idempotent; only if the role exists.
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        GRANT USAGE ON SCHEMA accounts TO aidos_agent;
        GRANT SELECT, INSERT, UPDATE ON accounts.project_members TO aidos_agent;
        REVOKE DELETE, TRUNCATE ON accounts.project_members FROM aidos_agent;
        -- The RLS predicate calls app.is_member / app.in_active_scope: the agent needs
        -- USAGE on schema app + EXECUTE on the helpers (is_member is SECURITY DEFINER, so
        -- the membership read itself runs as the owner — the agent never reads the table
        -- directly inside the predicate).
        GRANT USAGE ON SCHEMA app TO aidos_agent;
        GRANT EXECUTE ON FUNCTION app.is_member(text)       TO aidos_agent;
        GRANT EXECUTE ON FUNCTION app.in_active_scope(text) TO aidos_agent;
    END IF;
END
$$;

-- ============================================================================
-- (5) THE WALL — UNCHANGED (CLAUDE.md §2). Membership lives OUTSIDE the kernel; re-assert the
--     truth-zone REVOKEs (no-op if already revoked, skip-if-missing for a minimal fixture).
-- ============================================================================
DO $$
BEGIN
    IF to_regclass('kernel.truth') IS NOT NULL THEN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.truth FROM aidos_agent;
    END IF;
    IF to_regclass('mirrors.mirror') IS NOT NULL THEN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror FROM aidos_agent;
    END IF;
END
$$;

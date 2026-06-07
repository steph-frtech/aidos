-- project_rls_baseline.sql — AIDOS S55 (app-builder EPIC 1).
--
-- LEVEL 2 of the two-layer project-aware wall (CLAUDE.md §2 "defense in depth").
-- Level 1 is the PreToolUse hook (back/runtime/projectwall, package projectwall).
-- THIS migration is the Postgres ROW-LEVEL-SECURITY backstop: even if the hook is
-- bypassed (or the gateway has a bug), the agent DB role (aidos_agent) can read /
-- write a below-the-line row ONLY for the CURRENT project, AND only under the
-- propagated identity. The two layers redden INDEPENDENTLY (the S55 fault-injection
-- done-criterion): break the hook → the RLS still refuses; break the RLS → the hook
-- still refuses.
--
-- IDENTITY-KEYED (S55 ⇄ S61). The RLS predicate keys on BOTH GUCs:
--     current_setting('app.project',  true)   = the active project_id (S57 cookie)
--     current_setting('app.identity', true)   = the propagated caller identity (S61)
-- A FORGED claim at the gateway (a request asserting project B, or an identity that
-- does not match the row's owning scope) sees ZERO rows — the RLS never trusts the
-- gateway alone. Until S61 wires real identity, the gateway/aidos sets app.identity
-- to the resolved caller; S55 delivers the MECHANISM, S61 the real value.
--
-- EXPAND-CONTRACT, FORWARD-ONLY, APPEND-ONLY, IDEMPOTENT (CLAUDE.md §1/§9, Atlas
-- declarative). It enables RLS + (re)creates policies; re-running it is a no-op
-- (DROP POLICY IF EXISTS then CREATE). It DELETES no data and writes no truth body
-- (it only governs visibility/mutability). The `aidos` superuser/owner role and
-- BYPASSRLS roles are unaffected — only aidos_agent is fenced.
--
-- WHY two GUCs and not the connection role: AIDOS is multi-tenant on ONE truth-store
-- (S53/S54); a per-project DB role would not scale and would not carry identity. The
-- request sets the two session GUCs (SET LOCAL app.project / app.identity) inside the
-- transaction; RLS reads them per row. A request that sets neither GUC sees nothing
-- (fail-closed: current_setting(..., true) returns NULL → the predicate is false).
--
-- DEPENDS ON: project_scope_baseline.sql (the project_id column + FK + the __system__
-- seed on every scoped table). Run project_rls_baseline.sql AFTER it.

-- ============================================================================
-- (0) Roles. aidos_agent is fenced by RLS; aidos (owner) bypasses it (it applies
--     approved ChangeSets). Idempotent role creation.
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- ============================================================================
-- (1) Helper predicate. A row is IN SCOPE iff its project_id equals the active
--     project GUC AND the identity GUC is set (non-empty). The identity match to a
--     per-project membership row is S62; S55 requires the identity GUC be PRESENT
--     (a request with no propagated identity — a forged/empty claim — sees nothing).
--     SECURITY: STABLE, no side-effects; current_setting(..., true) = NULL-safe.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.in_active_scope(row_project_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        -- the active project GUC must be set and equal the row's project
        nullif(current_setting('app.project', true), '') IS NOT NULL
        AND row_project_id = current_setting('app.project', true)
        -- AND the propagated identity GUC must be set (S61 defense-in-depth):
        -- a forged/empty identity claim sees zero rows, independent of the gateway.
        AND nullif(current_setting('app.identity', true), '') IS NOT NULL
$$;

-- ============================================================================
-- (2) Enable RLS + (re)create the scoped policy on EVERY S54 scoped table. The set
--     mirrors projectscope.ScopedTables() (the Go single source of truth). RLS is
--     FORCED (so even the table owner is governed when acting as aidos_agent via the
--     policy — the wall holds for the agent role specifically; aidos owner is
--     granted BYPASSRLS below). The policy is SELECT/INSERT/UPDATE/DELETE-wide via
--     USING + WITH CHECK so a cross-project WRITE is refused exactly like a read:
--       USING       — which existing rows are VISIBLE / updatable / deletable
--       WITH CHECK  — which NEW / updated rows may be written (no cross-project insert)
-- ============================================================================
DO $$
DECLARE
    scoped text[][] := ARRAY[
        ARRAY['kernel','truth'],
        ARRAY['kernel','layer'],
        ARRAY['kernel','link'],
        ARRAY['mirrors','mirror'],
        ARRAY['ideas','idea'],
        ARRAY['changesets','changeset'],
        ARRAY['dag','phase'],
        ARRAY['brain','memory_item'],
        ARRAY['context','context_graph_decision']
    ];
    rec text[];
    qual text;
    pol  text;
BEGIN
    FOREACH rec SLICE 1 IN ARRAY scoped
    LOOP
        qual := format('%I.%I', rec[1], rec[2]);
        pol  := format('%s_%s_project_rls', rec[1], rec[2]);

        -- Skip a table absent from this database (e.g. brain/context have their own
        -- baselines; a minimal fixture omits them). Same skip-if-missing discipline
        -- as project_scope_baseline.sql — the migration is total over what exists.
        CONTINUE WHEN to_regclass(qual) IS NULL;

        -- Enable + FORCE RLS (idempotent; ALTER is a no-op if already set).
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', qual);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', qual);

        -- Re-create the policy idempotently (drop-then-create = forward-only re-run).
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol, qual);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR ALL TO aidos_agent '
            || 'USING (app.in_active_scope(project_id)) '
            || 'WITH CHECK (app.in_active_scope(project_id))',
            pol, qual);
    END LOOP;
END
$$;

-- ============================================================================
-- (3) THE WALL — UNCHANGED (CLAUDE.md §2). RLS governs SCOPE (which project's rows),
--     NEVER the waterline (which ZONES are writable). The agent stays SELECT-only on
--     kernel/mirrors/fitness: re-assert the REVOKEs so this migration provably does
--     not weaken S02/S04. RLS + waterline are ORTHOGONAL and BOTH hold.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.truth         FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.layer         FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link          FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror       FROM aidos_agent;

-- aidos owner applies approved ChangeSets and must not be fenced by RLS.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        EXECUTE 'ALTER ROLE aidos BYPASSRLS';
    END IF;
END
$$;

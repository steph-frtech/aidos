-- accounts_baseline.sql — AIDOS S61 (app-builder EPIC 3).
--
-- The AUTH zone of the truth-store. OAuth/OIDC + sessions resolve a caller to a single
-- `accounts.users` row (id, email, identity_provider); that identity propagates into
-- EVERY gateway call AND down to the Postgres RLS GUC app.identity (S55) — auth is never
-- gateway-only (CLAUDE.md §2, ROADMAP S61).
--
-- AUTH LIVES OUTSIDE THE KERNEL (ROADMAP S61). The `accounts` schema is its OWN
-- below-the-line zone — NOT kernel/mirrors/fitness. The agent role may read/write it (a
-- session is created below the line), but the wall on the truth zones is UNCHANGED
-- (re-asserted at the bottom). A user row is content-addressed and append-only, exactly
-- like a project (S53): id = SHA-256 of the canonical body {kind:"user", email,
-- identity_provider} (back/runtime/authn.NewUser), so the same (email, provider) is
-- idempotent and a change writes a NEW row. Soft-delete only — DELETE/TRUNCATE not
-- granted (the hard GDPR delete is S116).
--
-- EXPAND-CONTRACT, FORWARD-ONLY, APPEND-ONLY, IDEMPOTENT (CLAUDE.md §1/§9). It creates
-- the NEW `accounts` schema; re-running it is a no-op. It NEVER alters or drops a prior
-- table.
--
-- DEPENDS ON: nothing above it (a leaf schema). Run AFTER projects_baseline only if you
-- want the FK below; the FK is intentionally OMITTED (a session may reference a project
-- without a hard FK — projects soft-delete; the RLS, not a FK, is the scope enforcer).

CREATE SCHEMA IF NOT EXISTS accounts;

-- accounts.users — the account model the roadmap names (id, email, identity_provider).
-- id is the content address (SHA-256 hex of the canonical body) AND the subject the RLS
-- app.identity GUC + projectwall.Scope.Identity key on — ONE identity, two walls.
CREATE TABLE IF NOT EXISTS accounts.users (
    id                TEXT        NOT NULL,
    email             TEXT        NOT NULL,
    identity_provider TEXT        NOT NULL,
    body              JSONB       NOT NULL,
    version           TEXT        NOT NULL,
    superseded_by     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- A user's content address must equal its version (KRD §12: the version is the licence
-- to change — a head row's id == version).
ALTER TABLE accounts.users
    DROP CONSTRAINT IF EXISTS users_content_address_chk;
ALTER TABLE accounts.users
    ADD CONSTRAINT users_content_address_chk CHECK (id = version);

-- The email must be non-empty (a verified OIDC claim).
ALTER TABLE accounts.users
    DROP CONSTRAINT IF EXISTS users_email_nonempty_chk;
ALTER TABLE accounts.users
    ADD CONSTRAINT users_email_nonempty_chk CHECK (length(email) > 0);

-- A fast lookup by (email, identity_provider) for the session resolve path.
CREATE INDEX IF NOT EXISTS users_email_provider_idx
    ON accounts.users (email, identity_provider);

-- accounts.sessions — an opened session binds a verified user to a token id. Append-only
-- and below the line; the JWT itself is verified by the gateway (not stored). A session is
-- the bridge from the OIDC verification to the propagated identity.
CREATE TABLE IF NOT EXISTS accounts.sessions (
    token_id    TEXT        NOT NULL,
    user_id     TEXT        NOT NULL REFERENCES accounts.users (id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    CONSTRAINT sessions_pkey PRIMARY KEY (token_id)
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON accounts.sessions (user_id);

-- ============================================================================
-- GRANTs. The agent/app role may read/write the AUTH zone below the line (open a
-- session, read a user). Idempotent. Created if the role exists.
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        GRANT USAGE ON SCHEMA accounts TO aidos_agent;
        GRANT SELECT, INSERT, UPDATE ON accounts.users    TO aidos_agent;
        GRANT SELECT, INSERT, UPDATE ON accounts.sessions TO aidos_agent;
        -- Soft-delete only: no DELETE/TRUNCATE (the hard GDPR delete is S116).
        REVOKE DELETE, TRUNCATE ON accounts.users    FROM aidos_agent;
        REVOKE DELETE, TRUNCATE ON accounts.sessions FROM aidos_agent;
    END IF;
END
$$;

-- ============================================================================
-- THE WALL — UNCHANGED (CLAUDE.md §2). Auth lives OUTSIDE the kernel; this migration
-- must not weaken the truth-zone fence. Re-assert the REVOKEs (no-op if already revoked,
-- skip-if-missing for a minimal fixture).
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

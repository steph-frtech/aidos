-- DP02: stack_manifest record kind — additive Atlas baseline.
-- The StackManifest engraved as a first-class Kernel SOURCE (ROADMAP
-- provisioning-deploy EPIC A, unlocked by the DP01 measured GO — ADR 0064).
--
-- One new content-addressed, append-only record table in the kernel schema,
-- the SAME five-column shape as every KRDCore record table (S02):
--   id            = SHA-256 hex of the canonical JSONB body
--                   (records.Hash(records.Canonicalize(body)) — S02 REUSED, never forked)
--   body          = the canonical JSONB AST: {"kind":"stack_manifest", "app":…,
--                   "services":[{name,role,image,internal_port,profile,healthcheck,
--                   depends_on}], "volumes":[{name,device_var}], "network":{name,external},
--                   "connector_scopes":[…]}
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for the head; the head moves by INSERTing a NEW row
--   created_at    = insertion time
-- Append-only: a row body is NEVER updated or deleted.
--
-- The CLOSED sets (roles, profiles) and the pure validation (name required,
-- ≥1 role=server, unique internal ports, UNKNOWN_SERVICE_ROLE /
-- DUPLICATE_INTERNAL_PORT / STACK_HAS_NO_SERVER refusals) are enforced in CODE
-- (back/kernel/stackmanifest.Validate + its rapid property mirror), deliberately
-- NOT by a DB CHECK — the KRDCore convention (§41–§42): the body stays
-- inspectable/replayable JSONB; the validator is the pure, mirrored authority.
--
-- THE WALL (CLAUDE.md §2): stack_manifest is ABOVE-the-line truth. The agent
-- role gets SELECT ONLY — no INSERT/UPDATE/DELETE. Writing a manifest flows
-- through idea → mirror → /goal → human approval (the privileged aidos CLI
-- role), never the agent, never a screen. This migration is expand-only and
-- alters nothing prior (anti-overwrite, CLAUDE.md §9).

CREATE SCHEMA IF NOT EXISTS kernel;

-- kernel.stack_manifest — the declared stack topology of an emitted app (DP02).
CREATE TABLE IF NOT EXISTS kernel.stack_manifest (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stack_manifest_pkey PRIMARY KEY (id)
);

-- Read path for the Workbench /stack-manifest projection: the manifest of an app.
CREATE INDEX IF NOT EXISTS stack_manifest_app_idx
    ON kernel.stack_manifest ((body ->> 'app'));

-- The wall, in-database (CLAUDE.md §2). aidos_agent exists (S01/S02 baselines);
-- the DO-block keeps a fresh environment idempotent.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA kernel TO aidos_agent;
GRANT SELECT ON kernel.stack_manifest TO aidos_agent;

-- Belt-and-braces: the new kind opens NO write door for the agent.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.stack_manifest FROM aidos_agent;

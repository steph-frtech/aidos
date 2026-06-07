-- S53: Project (multi-tenant root scope) baseline migration.
-- Expand-only, append-only. Creates the NEW `projects` schema — the first-rank
-- Kernel concept that scopes every truth (app-builder EPIC 1). It NEVER alters or
-- drops a prior table.
--
-- A project is BELOW the wall (CLAUDE.md §2): the `projects` schema is NOT
-- kernel/mirrors/fitness. Like the Archive content-store, it is content-addressed
-- and append-only, so the Workbench /projects panel may write it directly (a
-- server action via the store path) — the agent role gets INSERT/SELECT/UPDATE
-- here, but the wall on kernel/mirrors/fitness is UNCHANGED (re-asserted at the
-- bottom). Soft-delete only: a row is NEVER physically destroyed (the hard GDPR
-- delete is S116) — DELETE/TRUNCATE are not granted.
--
-- Each row is content-addressed and append-only (mirrors S02):
--   id            = SHA-256 hex of the canonical JSONB body (records.Hash)
--   body          = the canonical JSONB (slug, name, owner_ref, created_at,
--                   lifecycle, kind="project")
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at     = insertion time
-- The lifecycle (active|archived|deleted) lives in the body; a transition writes a
-- NEW row whose id differs (the lifecycle is part of the content address).

CREATE SCHEMA IF NOT EXISTS projects;

-- projects.project — the content-addressed project record.
CREATE TABLE IF NOT EXISTS projects.project (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT project_pkey PRIMARY KEY (id)
);

-- Lifecycle CHECK on the body — the closed three, nothing else (no fourth state).
ALTER TABLE projects.project
    DROP CONSTRAINT IF EXISTS project_lifecycle_chk;
ALTER TABLE projects.project
    ADD CONSTRAINT project_lifecycle_chk
    CHECK (body ->> 'lifecycle' IN ('active', 'archived', 'deleted'));

-- Slug UNIQUE per owner among NON-deleted HEAD rows (defense in depth — the Go
-- Registry enforces the same rule in pure code before insert). A soft-deleted
-- project frees its slug; an archived one still holds it. Only head rows
-- (superseded_by IS NULL) count, so the append-only history of a single project
-- (active → archived → ... ) never trips the uniqueness check.
CREATE UNIQUE INDEX IF NOT EXISTS project_owner_slug_uq
    ON projects.project ((body ->> 'owner_ref'), (body ->> 'slug'))
    WHERE superseded_by IS NULL
      AND body ->> 'lifecycle' <> 'deleted';

-- projects.dag_root — the per-project DAG genesis node (S53: the DAG receives a
-- root node per project). It references the project id (FK) and carries the
-- content-addressed dag.NodeID. It is the project's isolated genesis; branch/
-- checkout/merge stay inside the project frontier (S56). Append-only.
CREATE TABLE IF NOT EXISTS projects.dag_root (
    project_id TEXT        NOT NULL,
    node_id    TEXT        NOT NULL,
    label      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT dag_root_pkey PRIMARY KEY (project_id),
    CONSTRAINT dag_root_project_fk
        FOREIGN KEY (project_id) REFERENCES projects.project (id)
);

-- Below-the-wall GRANTs: the agent role may create/list/advance projects (the
-- store path), like the Archive content-store. The role is created in S01/S02.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA projects TO aidos_agent;

-- INSERT (create / append a lifecycle row), SELECT (list/switch), UPDATE (close a
-- superseded_by head pointer). DELETE/TRUNCATE deliberately NOT granted — soft
-- delete only, append-only (the hard GDPR delete is S116, a separate human-gated op).
GRANT INSERT, SELECT, UPDATE ON projects.project TO aidos_agent;
GRANT INSERT, SELECT         ON projects.dag_root TO aidos_agent;
REVOKE DELETE, TRUNCATE ON projects.project FROM aidos_agent;
REVOKE DELETE, TRUNCATE ON projects.dag_root FROM aidos_agent;

-- The wall is UNCHANGED. Re-assert SELECT-only on the truth schemas so this
-- migration provably does not weaken S02/S04: a project record is below the line,
-- but the agent can NEVER write the kernel / mirrors / fitness here.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.truth   FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.layer   FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link    FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror FROM aidos_agent;

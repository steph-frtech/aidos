-- S54: Project-scope migration of the truth-store (app-builder EPIC 1).
-- Expand-contract, append-only, FORWARD-ONLY. Adds a `project_id` FK to every
-- truth + derived schema that until now held ONE undivided global graph:
--   kernel (truth·layer·link) · mirrors · ideas · changesets · dag · brain · context.
-- It NEVER alters a body, NEVER drops a row, NEVER deletes data — it only ADDS a
-- column and BACKFILLS the existing singleton graph into a seed project.
--
-- DEPENDS ON: kernel_records_baseline.sql (S02), projects_baseline.sql (S53),
-- brain_memory_item_baseline.sql (S31), context_graph_decision_baseline.sql (S15).
--
-- EXPAND-CONTRACT (Atlas / ADR 0003, the `migrate` skill):
--   EXPAND  : add `project_id` NULL (old code keeps working — no project_id yet);
--   BACKFILL: insert the `__system__` seed project (+ its DAG root) and set
--             project_id = the seed id on every pre-existing row (the Order demo);
--   CONTRACT: set `project_id` NOT NULL + a DEFAULT to the seed id, so every NEW
--             below-the-line row lands in __system__ unless the caller scopes it,
--             and add the FK to projects.project. No data is moved or lost.
-- It is re-runnable (idempotent): IF NOT EXISTS / ON CONFLICT guards throughout.
--
-- ZERO LOSS (the done-criterion): append-only — no UPDATE of a body, no DELETE.
-- The ONLY mutation is filling the new project_id column on rows that had none.
-- A row count before == a row count after (proven by migration_roundtrip_test.go).
--
-- THE WALL (CLAUDE.md §2) is UNCHANGED. project_id is a SCOPE column, not a truth
-- body; the agent still has SELECT-only on kernel/mirrors (re-asserted at the
-- bottom). The agent gains NO write here. RLS keyed on the propagated identity is
-- S55; this step adds the column + FK the RLS will key on, plus the deterministic
-- scoped-read helper (back/archive/projectscope) the engine uses.

-- ============================================================================
-- (1) SEED PROJECT  __system__  — the home of the pre-existing singleton graph.
-- ============================================================================
-- Content-addressed exactly like every project (S53 records.Hash scheme). The id
-- is pinned: it is records.Hash(records.Canonicalize(canonical body)) of the body
--   {"kind":"project","slug":"__system__","name":"AIDOS System (Order demo)",
--    "owner_ref":"__aidos__","created_at":"1970-01-01T00:00:00Z","lifecycle":"active"}
-- The pin is asserted byte-for-byte against the Go in projectscope.SystemSeed
-- (project_scope_property_test.go) so the SQL and Go can never drift.
INSERT INTO projects.project (id, body, version, created_at)
VALUES (
    '1a4332ab3616ddfb699b668ae4a4078593231e5f996e6b8f1fd1e44b6a4c5004',
    '{"kind":"project","slug":"__system__","name":"AIDOS System (Order demo)","owner_ref":"__aidos__","created_at":"1970-01-01T00:00:00Z","lifecycle":"active"}'::jsonb,
    '1a4332ab3616ddfb699b668ae4a4078593231e5f996e6b8f1fd1e44b6a4c5004',
    '1970-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

-- The seed's per-project DAG genesis root (S53 dag_root, FK to the seed project).
INSERT INTO projects.dag_root (project_id, node_id, label, created_at)
VALUES (
    '1a4332ab3616ddfb699b668ae4a4078593231e5f996e6b8f1fd1e44b6a4c5004',
    '__system__-genesis',
    'project:__system__@1a4332ab3616ddfb699b668ae4a4078593231e5f996e6b8f1fd1e44b6a4c5004',
    '1970-01-01T00:00:00Z'
)
ON CONFLICT (project_id) DO NOTHING;

-- ============================================================================
-- (2) EXPAND + BACKFILL + CONTRACT, per scoped table.
--     A reusable DO block: add NULL column → backfill seed → set NOT NULL +
--     DEFAULT seed → add FK. Idempotent; never touches a body; never deletes.
-- ============================================================================
DO $$
DECLARE
    seed   text := '1a4332ab3616ddfb699b668ae4a4078593231e5f996e6b8f1fd1e44b6a4c5004';
    -- The full set of truth + derived tables that gain a project scope.
    -- schema.table pairs, in CLAUDE.md §1 order.
    targets text[][] := ARRAY[
        ARRAY['kernel',     'truth'],
        ARRAY['kernel',     'layer'],
        ARRAY['kernel',     'link'],
        ARRAY['mirrors',    'mirror'],
        ARRAY['ideas',      'idea'],
        ARRAY['changesets', 'changeset'],
        ARRAY['dag',        'phase'],
        ARRAY['brain',      'memory_item'],
        ARRAY['context',    'context_graph_decision']
    ];
    t        text[];
    sch      text;
    tbl      text;
    qual     text;
    fkname   text;
    idxname  text;
BEGIN
    FOREACH t SLICE 1 IN ARRAY targets LOOP
        sch := t[1];
        tbl := t[2];
        -- Only act when the table actually exists (brain/context may lag in a
        -- partial test fixture). A missing table is a no-op, never an error.
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = sch AND table_name = tbl
        ) THEN
            CONTINUE;
        END IF;

        qual    := format('%I.%I', sch, tbl);
        fkname  := format('%s_%s_project_fk', sch, tbl);
        idxname := format('%s_%s_project_idx', sch, tbl);

        -- EXPAND: add project_id NULL (old code keeps inserting without it).
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS project_id text', qual);

        -- BACKFILL: every pre-existing row joins the seed (the Order demo). Only
        -- rows whose project_id IS NULL are touched (idempotent re-run). This is
        -- the ONLY data mutation — it fills a brand-new column, it never rewrites
        -- a body and never deletes a row (append-only / zero loss).
        EXECUTE format('UPDATE %s SET project_id = %L WHERE project_id IS NULL', qual, seed);

        -- CONTRACT: default future rows to the seed, then forbid NULL.
        EXECUTE format('ALTER TABLE %s ALTER COLUMN project_id SET DEFAULT %L', qual, seed);
        EXECUTE format('ALTER TABLE %s ALTER COLUMN project_id SET NOT NULL', qual);

        -- FK: project_id resolves to a real project (the done-criterion: all FKs
        -- resolve). Added only once.
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = fkname
        ) THEN
            EXECUTE format(
                'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (project_id) REFERENCES projects.project (id)',
                qual, fkname
            );
        END IF;

        -- Index for the project-scoped read path (projectscope.ScopedSelect).
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (project_id)', idxname, qual);
    END LOOP;
END
$$;

-- ============================================================================
-- (3) THE WALL — UNCHANGED. project_id is a scope column, not a write door.
--     Re-assert SELECT-only on the truth schemas so this migration provably does
--     not weaken S02/S04: the agent can read a scoped truth row but can NEVER
--     write the kernel / mirrors / fitness. (brain/context/dag are below-the-line
--     derived stores; their grants are owned by their own baselines.)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.truth         FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.layer         FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link          FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror       FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ideas.idea           FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON changesets.changeset FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON dag.phase            FROM aidos_agent;

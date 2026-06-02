-- S16: AuthorityGraph — "remplacer « l'humain » par une autorité explicite" (KRD §13.8).
-- Expand-only, append-only, ADDITIVE. Creates ONE new content-addressed JSONB table,
-- kernel.authority_graph, alongside the S02 record tables. Applied via Atlas (declarative);
-- this file is the canonical DDL source. It never alters or drops a prior table — the S02
-- kernel.truth / kernel.layer / kernel.link shapes are untouched.
--
-- CONTENT-ADDRESS (KRD §12, S02 substrate): each row is content-addressed and append-only,
-- the SAME scheme as the S02 record tables (do not fork it):
--   id            = SHA-256 hex of the canonical JSONB body (records.Hash(Canonicalize(body)))
--   body          = the canonical JSONB carrying {domain, truth_kind, approvers, veto, escalation}
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at    = insertion time
-- Append-only: a row body is NEVER updated or deleted. The head moves by INSERTing a new row
-- and closing the prior row's superseded_by. Changing an authority owner ⇒ a new version (a
-- SemanticDiff change_type `reauthorize`, KRD §44.1), never an in-place edit.
--
-- The {domain, truth_kind} keys and the role lists live INSIDE the JSONB body (a single
-- source of truth, content-addressed); this step adds no projected/queryable columns for
-- them — the SELECT-only Workbench panel reads the body. (The S15 kernel.truth.scope column
-- is a projected copy; here the body IS the row.)
--
-- THE WALL (CLAUDE.md §2): the agent role gets SELECT ONLY on kernel.authority_graph and is
-- REVOKEd all writes — the new table opens NO write door. Only the privileged aidos CLI
-- writer role writes truth, via an approved ChangeSet. This migration is AUTHORED here but
-- APPLIED by the migration role; aidos_agent + the SELECT/REVOKE convention come from the
-- S02 records baseline (kernel schema already exists).

-- kernel.authority_graph — the §13.8 AuthorityGraph AST, content-addressed + append-only.
CREATE TABLE IF NOT EXISTS kernel.authority_graph (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT authority_graph_pkey PRIMARY KEY (id)
);

-- The wall (CLAUDE.md §2): SELECT-only for the agent role; all writes revoked. The agent
-- can read the authority graph for the /authorities panel but never write truth.
GRANT SELECT ON kernel.authority_graph TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.authority_graph FROM aidos_agent;

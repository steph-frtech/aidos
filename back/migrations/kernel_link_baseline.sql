-- S17: Versioned links — the six KRD §41 link types (projects_to / derives_from /
-- contracts_with / triggers / binds / mirrors). Expand-only, append-only, ADDITIVE.
-- Creates ONE new content-addressed JSONB table, kernel.link, alongside the S02 record
-- tables and the S16 kernel.authority_graph. Applied via Atlas (declarative); this file is
-- the canonical DDL source. It never alters or drops a prior table — the S02
-- kernel.truth / kernel.layer / kernel.authority_graph shapes are untouched.
--
-- CONTENT-ADDRESS (KRD §12, S02 substrate): each row is content-addressed and append-only,
-- the SAME scheme as the S02 record tables (do not fork it):
--   id            = SHA-256 hex of the canonical JSONB body (records.Hash(Canonicalize(body)))
--   body          = the canonical JSONB carrying {kind: "link", link_kind, from, to}
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at    = insertion time
-- Append-only: a row body is NEVER updated or deleted. The head moves by INSERTing a new row
-- and closing the prior row's superseded_by. Changing a link's pinned target ⇒ a new version,
-- never an in-place edit.
--
-- THE PINNED REFS LIVE INSIDE THE JSONB BODY, deliberately NOT as foreign keys (KRD §41–§42):
-- a link pins its target by version (id@version); a STALE or ABSENT link must remain
-- inspectable so the red wave can show it red. An FK to the target row would FORBID the
-- dangling target — exactly the opposite of what §42 needs (a link to an absent version must
-- be storable and shown red, not refused at insert). So from/to are JSONB fields, not FKs.
--
-- THE WALL (CLAUDE.md §2): the agent role gets SELECT ONLY on kernel.link and is REVOKEd all
-- writes — the new table opens NO write door. Only the privileged aidos CLI writer role
-- writes truth, via an approved ChangeSet. This migration is AUTHORED here but APPLIED by the
-- migration role; aidos_agent + the SELECT/REVOKE convention come from the S02 records
-- baseline (kernel schema already exists).

-- kernel.link — the §41 versioned link AST, content-addressed + append-only.
CREATE TABLE IF NOT EXISTS kernel.link (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT link_pkey PRIMARY KEY (id)
);

-- The wall (CLAUDE.md §2): SELECT-only for the agent role; all writes revoked. The agent can
-- read the link graph for the /link-graph panel but never write truth.
GRANT SELECT ON kernel.link TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link FROM aidos_agent;

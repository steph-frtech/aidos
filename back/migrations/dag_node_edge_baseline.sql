-- S24: the version DAG — dag.node (stable phases) + dag.edge (ChangeSets). KRD §120–§125:
-- the version space is a DAG, not a line. NODES are stable phases (S23, content-addressed),
-- EDGES are ChangeSets (S20). The THREE §121 moves — branch / checkout-ancestor / rebranch —
-- grow this relation APPEND-ONLY with a MUTABLE head. Nothing is ever destroyed: an abandoned
-- line stays as a stepping stone (§123). Expand-only, append-only, ADDITIVE. It NEVER alters or
-- drops a prior table — the S02 dag.phase and S23 dag.stable_phase shapes are UNTOUCHED, and the
-- S02/S04/S23 wall GRANTs are unchanged.
--
-- WHY NEW TABLES (consistent with the S23 named-table pattern): S23's dag.stable_phase records a
-- single `parent` back-reference. S24 lands the FULL DAG — a node may have ≥1 parents (a DAG, not
-- a tree, §120), several parallel heads (§125), the waterline stratum (§124), and a first-class
-- EDGE table referencing the S20 ChangeSet. These are NEW relations over existing content-addressed
-- rows; they do NOT copy a phase or ChangeSet body — dag.node references the S01/S02 content hash,
-- dag.edge references changesets.changeset.id (S20).
--
-- THE WALL (CLAUDE.md §2): dag is a TRUTH schema ABOVE the waterline. The agent DB role gets
-- SELECT ONLY on dag.node / dag.edge — it may READ the DAG for the /version-dag panel + dag_get,
-- but it can NEVER write a node/edge or move a head. Only the privileged `aidos` CLI writer role
-- (via the `dag` MCP, the single door) INSERTs nodes/edges and UPDATEs the `head` flag. A
-- "checkout an ancestor" is an UPDATE of the head flag only (a head-flag move, §120), never a
-- DELETE: the abandoned line is never destroyed. DELETE/TRUNCATE are withheld from BOTH roles on
-- the agent side; the writer role may UPDATE ONLY the head flag (append-only otherwise).
--
-- CONTENT-ADDRESSED: dag.node.id = version = SHA-256 of the canonical node body (S01/S02
-- records.Canonicalize + records.Hash, reused — never forked). The cut/sensor_status/stable/
-- reasons of a recorded stable phase live INSIDE the JSONB body so a node stays inspectable.
--
-- Idempotent: schema + tables use IF NOT EXISTS; roles are guarded; GRANTs are declarative. The Go
-- Testcontainers suite (back/archive/dag) applies the S02 baseline (dag schema + dag.phase), the
-- S20 changesets lifecycle baseline (changesets.changeset for the edge FK), then this baseline
-- against a throwaway real Postgres on every `go test`.

CREATE SCHEMA IF NOT EXISTS dag;

-- dag.node — one immutable, content-addressed node per version (a stable phase, S23).
--   id          : SHA-256 of the canonical node body (= the node's content address).
--   body        : the FULL recorded fact as JSONB — {kind:"phase", parent_ids, stratum, label,
--                 cut, sensor_status, stable, reasons}. References content; copies no foreign body.
--   version     : = id (content address; the node IS its own version).
--   head        : the MUTABLE head flag (§120). Several nodes may be head at once (parallel lines,
--                 §125). The ONLY mutable column — a checkout/branch moves it; nothing else changes.
--   stratum     : the waterline placement (§124): 'above' = human truth, 'below' = evolutionary.
--   label       : the human name of the line.
--   created_at  : insertion time (append-only audit; the temporal ordering that keeps it a DAG).
CREATE TABLE IF NOT EXISTS dag.node (
    id         TEXT        NOT NULL,
    body       JSONB       NOT NULL,
    version    TEXT        NOT NULL,
    head       BOOLEAN     NOT NULL DEFAULT false,
    stratum    TEXT        NOT NULL,
    label      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT node_pkey PRIMARY KEY (id),
    -- content-addressed: the node IS its own version.
    CONSTRAINT node_content_address CHECK (version = id),
    -- the waterline is a closed two-value set (§124).
    CONSTRAINT node_stratum_enum CHECK (stratum IN ('above', 'below'))
);

-- dag.edge — one append-only edge per parentage link. A node may have ≥1 parents (a DAG, not a
-- tree, §120), so parentage is the edge relation (ONE representation — never duplicated on the
-- node). Each edge REUSES an existing S20 ChangeSet id (the DAG references, never copies).
--   from_node : the parent node id (the §120 edge source) — REFERENCES dag.node(id).
--   to_node   : the child node id (the edge target) — REFERENCES dag.node(id).
--   changeset : the existing changesets.changeset.id this edge reuses (S20). The DAG is a relation
--               over existing rows; it never copies the ChangeSet body.
--   created_at: insertion time (append-only).
CREATE TABLE IF NOT EXISTS dag.edge (
    from_node  TEXT        NOT NULL REFERENCES dag.node(id),
    to_node    TEXT        NOT NULL REFERENCES dag.node(id),
    changeset  TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT edge_pkey PRIMARY KEY (from_node, to_node, changeset),
    -- a node never points to itself: an edge is between distinct nodes (no self-loop — DAG, §120).
    CONSTRAINT edge_no_self_loop CHECK (from_node <> to_node)
);

-- Fast ancestry walks (the §120 reachability the navigation uses).
CREATE INDEX IF NOT EXISTS edge_to_node_idx   ON dag.edge (to_node);
CREATE INDEX IF NOT EXISTS edge_from_node_idx ON dag.edge (from_node);
-- Fast "give me the current heads" (§125 — possibly several).
CREATE INDEX IF NOT EXISTS node_head_idx ON dag.node (head) WHERE head;

-- ── Roles (guard in case this migration runs before S01/S04) ──────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END
$$;

-- The wall (CLAUDE.md §2): dag is above the waterline. The agent role gets SELECT ONLY on the new
-- node/edge tables — it reads the DAG for /version-dag + dag_get, but NEVER writes a node/edge or
-- moves a head. All writes are revoked from the agent.
GRANT USAGE  ON SCHEMA dag        TO aidos_agent;
GRANT SELECT ON dag.node          TO aidos_agent;
GRANT SELECT ON dag.edge          TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON dag.node FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON dag.edge FROM aidos_agent;

-- The `aidos` writer role: the single door to truth — INSERT + SELECT through the approved `dag`
-- MCP flow. UPDATE is granted ONLY on the `head` column (a checkout/branch moves the head flag,
-- §120) — never on body/id/version/stratum (a node is content-addressed and IMMUTABLE; a changed
-- node is a NEW node, a new hash). DELETE/TRUNCATE are withheld even from the writer: the DAG is
-- append-only — an abandoned line is NEVER destroyed (§120/§123).
GRANT USAGE          ON SCHEMA dag TO aidos;
GRANT SELECT, INSERT ON dag.node   TO aidos;
GRANT UPDATE (head)  ON dag.node   TO aidos;
GRANT SELECT, INSERT ON dag.edge   TO aidos;

-- FK12: the caused_by causal edge — the SEVENTH versioned link kind (FKE-35.1, ROADMAP FK12),
-- ADDITIVE to the six KRD §41 kinds. The backward causal edge (the inverse of the forward
-- red-wave `impacts` propagation, S22): `A caused_by B` means B is a candidate CAUSE of A's
-- redness. The deterministic upward Trace (back/kernel/causedby) is the substrate the WhyTree
-- (FK13) builds on.
--
-- NO NEW TABLE, NO SCHEMA CHANGE. A caused_by edge is a kernel.link row whose JSONB body carries
-- {"kind":"link","link_kind":"caused_by","from":{id,version},"to":{id,version}} — the SAME
-- content-addressed, append-only kernel.link table the six S17 §41 kinds already use (kernel_link
-- _baseline.sql). The closed kind-set is enforced in CODE (causedby.Validate + links — an unknown
-- link_kind never round-trips), deliberately NOT by a DB CHECK: §41–§42 stores the refs as JSONB
-- (not FKs) precisely so a stale/absent causal edge stays inspectable and the WhyTree is
-- replayable. Constraining link_kind in the DB would fork that decision.
--
-- This migration is therefore a DOCUMENTATION/registration baseline only: it asserts the table
-- exists (idempotent), restates the wall, and records the kind extension for the migration log.
-- It alters NOTHING (expand-only, append-only, anti-overwrite CLAUDE.md §9). Applied via Atlas.
--
-- THE WALL (CLAUDE.md §2): unchanged — the agent role keeps SELECT-only on kernel.link; all
-- writes stay revoked. A new caused_by row flows through the privileged aidos CLI writer role via
-- an approved ChangeSet, never the agent. This migration opens NO new write door.

-- Idempotent guard: kernel.link already exists (S17). caused_by reuses it; we only re-assert the
-- table's presence so a fresh environment that applies migrations in order does not break, and we
-- re-state the wall GRANT for clarity (GRANT is idempotent).
CREATE TABLE IF NOT EXISTS kernel.link (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT link_pkey PRIMARY KEY (id)
);

-- The wall (CLAUDE.md §2): SELECT-only for the agent role; all writes revoked — unchanged by the
-- caused_by extension (a new link_kind opens no new write door).
GRANT SELECT ON kernel.link TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link FROM aidos_agent;

-- An index helping the upward Trace read the caused_by sub-graph fast (the WhyTree query reads
-- all rows whose body->>'link_kind' = 'caused_by'). Partial GIN-free btree on the extracted kind;
-- IF NOT EXISTS keeps it idempotent and additive. It indexes a derived expression, touching no
-- existing column shape.
CREATE INDEX IF NOT EXISTS link_link_kind_idx
    ON kernel.link ((body ->> 'link_kind'));

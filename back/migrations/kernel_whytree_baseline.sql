-- FK13: the WhyTree — the 5-whys REDRESSED (FKE-35.1, ROADMAP FK13). From a RED symptom, `/why`
-- builds a content-addressed, provenanced tree of REPRODUCED candidate causes by walking
-- `caused_by` UPWARD (FK12), terminating OBLIGATORILY in an anti-recurrence mirror (root → /learn
-- → mirror). A WhyTree without a terminal mirror is refused (WHYTREE_NO_MIRROR); a non-reproduced
-- cause is refused (anti-confabulation). The build (back/kernel/whytree) is the substrate.
--
-- NO NEW TABLE, NO SCHEMA CHANGE. A WhyTree is a kernel.link row whose JSONB body carries
-- {"kind":"link","link_kind":"why_tree","symptom":…,"provenance":…,"causes":[…],"root_cause":…,
-- "terminal_mirror":{…}} — the SAME content-addressed, append-only kernel.link table the six S17
-- §41 kinds + FK12's caused_by already use. The closed kind-set + the reproduction gate + the
-- obligatory terminal mirror are enforced in CODE (whytree.Build), deliberately NOT by a DB CHECK:
-- §41–§42 store the refs/tree as JSONB (not FKs) precisely so a stale/absent tree stays inspectable
-- and replayable. Constraining link_kind / the tree shape in the DB would fork that decision.
--
-- This migration is therefore a DOCUMENTATION/registration baseline only: it asserts the table
-- exists (idempotent), restates the wall, and records the why_tree kind extension for the
-- migration log. It alters NOTHING (expand-only, append-only, anti-overwrite CLAUDE.md §9). Atlas.
--
-- THE WALL (CLAUDE.md §2): unchanged — the agent role keeps SELECT-only on kernel.link; all writes
-- revoked. Freezing the terminal anti-recurrence mirror flows through idea → mirror → /learn →
-- /goal → human approval (the aidos CLI writer role), never the agent. This migration opens NO new
-- write door.

-- Idempotent guard: kernel.link already exists (S17, reused by FK12). why_tree reuses it; we only
-- re-assert the table's presence so a fresh environment that applies migrations in order does not
-- break, and we re-state the wall GRANT for clarity (GRANT is idempotent).
CREATE TABLE IF NOT EXISTS kernel.link (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT link_pkey PRIMARY KEY (id)
);

-- The wall (CLAUDE.md §2): SELECT-only for the agent role; all writes revoked — unchanged by the
-- why_tree extension (a new link_kind opens no new write door).
GRANT SELECT ON kernel.link TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link FROM aidos_agent;

-- The link_kind index (created by FK12's caused_by baseline) already helps the WhyTree query read
-- all rows whose body->>'link_kind' = 'why_tree'; IF NOT EXISTS keeps it idempotent and additive.
CREATE INDEX IF NOT EXISTS link_link_kind_idx
    ON kernel.link ((body ->> 'link_kind'));

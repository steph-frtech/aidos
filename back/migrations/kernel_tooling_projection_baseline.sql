-- FK15 part (a): the tooling projections — CLAUDE.md / AGENTS.md / .cursorrules / memory-bank
-- EMITTED from the kernel sources (policy / memory / style / architecture / agent-profile), never
-- hand-edited (hash-protected, drift by source-hash). The ToolingKernel + the emitters + the drift
-- detector (back/kernel/toolproject) are the substrate (FKE-20, ROADMAP FK15).
--
-- THE STORAGE FORK — the SAME one FK14 (lexicon) decided: a ToolingKernel rides INSIDE a
-- content-addressed kernel.link row whose JSONB body carries
-- {"kind":"link","link_kind":"tooling","project":…,"sources":[{"kind":…,"id":…,"title":…,"body":…},…]}
-- — NO new record kind, NO schema change. Rationale: (a) the seven KRDCore kinds stay closed
-- (anti-explosion, KRD §1.3); (b) a tooling source is a binding of declarations into a derived view
-- — a LINK by nature; (c) it reuses the SAME content-addressed, append-only kernel.link table the six
-- S17 §41 kinds + FK12's caused_by + FK13's why_tree + FK14's lexicon already use, so a changed
-- source yields a NEW version (never an in-place mutation, KRD §12). The five closed source kinds +
-- the four closed targets + the three drift kinds are enforced in CODE (toolproject.Validate /
-- toolproject.Emit / toolproject.DetectDrift), deliberately NOT by a DB CHECK: §41–§42 store the body
-- as JSONB precisely so a stale/absent tooling stays inspectable and replayable. The hash-protection
-- (the source-hash) is a CODE invariant (a SHA-256 over the canonical body), not a DB constraint.
--
-- This migration is therefore a DOCUMENTATION/registration baseline only: it asserts the table
-- exists (idempotent), restates the wall, and records the tooling kind extension for the migration
-- log. It alters NOTHING (expand-only, append-only, anti-overwrite CLAUDE.md §9). Atlas.
--
-- THE WALL (CLAUDE.md §2): unchanged — the agent role keeps SELECT-only on kernel.link; all writes
-- revoked. Freezing/updating a ToolingKernel flows through idea → mirror → /goal → human approval
-- (the aidos CLI writer role), never the agent. This migration opens NO new write door.

-- Idempotent guard: kernel.link already exists (S17, reused by FK12/FK13/FK14). tooling reuses it;
-- we only re-assert the table's presence so a fresh environment that applies migrations in order
-- does not break, and we re-state the wall GRANT for clarity (GRANT is idempotent).
CREATE TABLE IF NOT EXISTS kernel.link (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT link_pkey PRIMARY KEY (id)
);

-- The wall (CLAUDE.md §2): SELECT-only for the agent role; all writes revoked — unchanged by the
-- tooling extension (a new link_kind opens no new write door).
GRANT SELECT ON kernel.link TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link FROM aidos_agent;

-- The link_kind index (created by FK12's caused_by baseline) already helps the Tooling query read
-- all rows whose body->>'link_kind' = 'tooling'; IF NOT EXISTS keeps it idempotent and additive.
CREATE INDEX IF NOT EXISTS link_link_kind_idx
    ON kernel.link ((body ->> 'link_kind'));

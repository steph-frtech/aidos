-- FK14: the Lexicon Kernel — a concept NAMED across the 16 layers as a single source (FKE-21,
-- ROADMAP FK14), and the PURE inter-layer linter that detects a symbol OUT of that lexicon, per
-- layer (a language drift made verifiable by computation). The lexicon + the linter
-- (back/kernel/lexicon) are the substrate.
--
-- THE STORAGE FORK — TRANCHÉ ICI (FK14 objective, ADR 0044 "fork de stockage différé"). The grill
-- left a fork open: store a lexicon as its OWN record kind, or as a `kind:layer` body with a layer
-- discriminator (the StackManifest deferred-storage pattern). FK14 decides it HERE the SAME way
-- WhyTree (FK13) and the other link-bodies decided theirs: a Lexicon Kernel rides INSIDE a
-- content-addressed kernel.link row whose JSONB body carries
-- {"kind":"link","link_kind":"lexicon","concept":…,"symbols":[{"layer":…,"symbol":…},…]} — NO new
-- record kind, NO schema change. Rationale: (a) the seven KRDCore kinds stay closed (anti-explosion,
-- KRD §1.3); (b) a lexicon is a binding across layers — a LINK by nature; (c) it reuses the SAME
-- content-addressed, append-only kernel.link table the six S17 §41 kinds + FK12's caused_by + FK13's
-- why_tree already use. The closed 16-layer set + the per-layer drift checks are enforced in CODE
-- (lexicon.Lint / lexicon.Validate), deliberately NOT by a DB CHECK: §41–§42 store the body as JSONB
-- (not FKs) precisely so a stale/absent lexicon stays inspectable and replayable. Constraining
-- link_kind / the lexicon shape in the DB would fork that decision.
--
-- This migration is therefore a DOCUMENTATION/registration baseline only: it asserts the table
-- exists (idempotent), restates the wall, and records the lexicon kind extension for the migration
-- log. It alters NOTHING (expand-only, append-only, anti-overwrite CLAUDE.md §9). Atlas.
--
-- THE WALL (CLAUDE.md §2): unchanged — the agent role keeps SELECT-only on kernel.link; all writes
-- revoked. Freezing/updating a lexicon flows through idea → mirror → /goal → human approval (the
-- aidos CLI writer role), never the agent. This migration opens NO new write door.

-- Idempotent guard: kernel.link already exists (S17, reused by FK12/FK13). lexicon reuses it; we
-- only re-assert the table's presence so a fresh environment that applies migrations in order does
-- not break, and we re-state the wall GRANT for clarity (GRANT is idempotent).
CREATE TABLE IF NOT EXISTS kernel.link (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT link_pkey PRIMARY KEY (id)
);

-- The wall (CLAUDE.md §2): SELECT-only for the agent role; all writes revoked — unchanged by the
-- lexicon extension (a new link_kind opens no new write door).
GRANT SELECT ON kernel.link TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link FROM aidos_agent;

-- The link_kind index (created by FK12's caused_by baseline) already helps the Lexicon query read
-- all rows whose body->>'link_kind' = 'lexicon'; IF NOT EXISTS keeps it idempotent and additive.
CREATE INDEX IF NOT EXISTS link_link_kind_idx
    ON kernel.link ((body ->> 'link_kind'));

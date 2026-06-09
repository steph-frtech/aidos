-- FK15 part (b): the assembled TECH-SPEC projections — the Fiche de Spécification Technique and the
-- Suite de Tests Techniques (FKE-20.1, ROADMAP FK15 part b). Two DETERMINISTIC projections per kernel
-- that ASSEMBLE already-declared technical elements (Contrat F5 + Modèle F4 + the OSI stack + facet
-- specs S1/B1/R1/V1/M1 + linked ADRs + N4/N5 tests) — generated, content-addressed, byte-stable,
-- never hand-edited (hash-protected), never the truth (zero double-typing). The assembler + the
-- zero-new-truth / drift checks (back/runtime/generators/techspec) are pure code.
--
-- THE STORAGE FORK — the SAME FK14 (lexicon) + FK15 part (a) (tooling) decided. A TechKernel rides
-- INSIDE a content-addressed kernel.link row whose JSONB body carries
-- {"kind":"link","link_kind":"techspec","kernel_id":…,"networked":…,"contract":…,"model":…,
-- "osi":[…],"facets":[…],"adrs":[…],"test_groups":[…]} — NO new record kind, NO schema change. The
-- seven KRDCore kinds stay closed (anti-explosion, KRD §1.3); a techspec is a binding over existing
-- declarations — a LINK by nature; it reuses the SAME append-only kernel.link table the S17 §41 kinds
-- + FK12/FK13/FK14 already use. The closed axes (4 OSI layers · 5 facets · 7 test kinds · 2
-- projections) + the zero-new-truth / drift checks are enforced in CODE (techspec.Validate /
-- AssembledRefs / DetectDrift), deliberately NOT by a DB CHECK: §41–§42 store the body as JSONB so a
-- stale/absent techspec stays inspectable and replayable.
--
-- This migration is therefore a DOCUMENTATION/registration baseline only: it asserts the table exists
-- (idempotent), restates the wall, and records the techspec link_kind extension for the migration
-- log. It alters NOTHING (expand-only, append-only, anti-overwrite CLAUDE.md §9). Atlas.
--
-- THE WALL (CLAUDE.md §2): unchanged — the agent role keeps SELECT-only on kernel.link; all writes
-- revoked. Freezing/updating a techspec flows through idea → mirror → /goal → human approval (the
-- aidos CLI writer role), never the agent. This migration opens NO new write door.

-- Idempotent guard: kernel.link already exists (S17, reused by FK12/FK13/FK14). techspec reuses it;
-- we only re-assert the table's presence so a fresh environment applying migrations in order does not
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
-- techspec extension (a new link_kind opens no new write door).
GRANT SELECT ON kernel.link TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.link FROM aidos_agent;

-- The link_kind index (created by FK12's caused_by baseline, reused by lexicon) already helps the
-- TechSpec query read all rows whose body->>'link_kind' = 'techspec'; IF NOT EXISTS keeps it
-- idempotent and additive.
CREATE INDEX IF NOT EXISTS link_link_kind_idx
    ON kernel.link ((body ->> 'link_kind'));

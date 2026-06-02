-- S19: weighted, thresholded red propagation (KRD §112, §114; ADR 0018) — the DECLARED weight
-- ADMISSION truth the propagation engine (back/kernel/propagation) reads. Expand-only, append-only,
-- ADDITIVE. It NEVER alters or drops a prior table — the S02 kernel.layer / kernel.truth, the S17
-- kernel.link, and the S18 kernel.layer_activation / kernel.composes_edge shapes are all untouched.
--
-- Two declared truths this step lands (KRD §112 + ADR 0018 — *weights and thresholds are DECLARED
-- by the human, never learned*); both get SELECT-only for the agent role (the wall, CLAUDE.md §2),
-- only the privileged aidos CLI writer role writes them through an approved ChangeSet:
--
--   1. The §112 weight enum is EXTENDED to three tiers (ADR 0018): cosmetic | load-bearing |
--      critical. The per-edge weight keeps riding INSIDE the existing kernel.link JSONB body (the
--      S17/S18 shape — no ALTER of kernel.link, no second column). S19 adds a `weight_evidence`
--      provenance reference to that same body for `critical` edges.
--
--   2. The ADMISSION rule (§2463 backprop discipline): a `critical` weight is admitted ONLY with
--      weight_evidence (a recorded provenance ref, e.g. an incident id). Rather than ALTER
--      kernel.link in place (forbidden — anti-overwrite), the admission lands as a NEW append-only
--      side table kernel.composes_weight_admission carrying the enum CHECK + the conditional
--      "critical ⇒ weight_evidence NOT NULL" CHECK as inspectable, content-addressed truth.
--
-- COLUMN-PLACEMENT DECISION (ADR 0018, consistent with S18): weight + weight_evidence ride inside
-- the existing kernel.link JSONB body (one pattern, no second shape); the admission record + its
-- CHECKs go to a side table (NOT an ALTER of kernel.link). The activation_threshold keeps living in
-- the S18 kernel.layer_activation side table. Strictly additive; declared truths inspectable.

-- kernel.composes_weight_admission — the DECLARED, content-addressed, append-only admission record
-- for a composes edge's weight (KRD §112 + ADR 0018). The two CHECKs ARE the wall the engine's
-- ValidateWeight mirrors: the enum CHECK pins the closed three-tier set; the conditional CHECK
-- enforces that a `critical` weight cannot exist without weight_evidence. Pinned to the link
-- @version it qualifies. The head moves by INSERTing a new row, never an in-place UPDATE.
CREATE TABLE IF NOT EXISTS kernel.composes_weight_admission (
    id              TEXT        NOT NULL,            -- SHA-256 of the canonical body
    link_id         TEXT        NOT NULL,            -- the composes link id this admission qualifies
    link_version    TEXT        NOT NULL,            -- the link @version it qualifies
    weight          TEXT        NOT NULL,            -- KRD §112 + ADR 0018 declared weight
    weight_evidence TEXT,                            -- provenance ref (e.g. incident id); required iff critical
    body            JSONB       NOT NULL,            -- {kind:"composes_weight_admission", link_id, link_version, weight, weight_evidence}
    version         TEXT        NOT NULL,
    superseded_by   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT composes_weight_admission_pkey PRIMARY KEY (id),
    -- the closed three-tier weight set (KRD §112 pair + the ADR 0018 `critical` extension)
    CONSTRAINT composes_weight_admission_weight_enum
        CHECK (weight IN ('cosmetic', 'load-bearing', 'critical')),
    -- the §2463 admission discipline: a `critical` weight is admitted ONLY with weight_evidence
    CONSTRAINT composes_weight_admission_critical_needs_evidence
        CHECK (weight <> 'critical' OR weight_evidence IS NOT NULL)
);

-- kernel.composes_weight — a READ-ONLY VIEW surfacing the per-edge weight + weight_evidence out of
-- the existing kernel.link JSONB bodies (the S17/S18 substrate). It introduces NO new write door
-- and stores NO new fact: it is a projection of head kernel.link rows whose link_kind is
-- "composes", exposing parent/child/weight/weight_evidence for the /red-propagation panel and the
-- engine. It complements the S18 kernel.composes_edge view by also surfacing weight_evidence.
CREATE OR REPLACE VIEW kernel.composes_weight AS
SELECT
    l.id                                   AS link_id,
    l.body ->> 'link_kind'                 AS link_kind,
    l.body -> 'parent'                     AS parent,
    l.body -> 'child'                      AS child,
    l.body ->> 'weight'                    AS weight,
    l.body ->> 'weight_evidence'           AS weight_evidence,
    l.version                              AS version,
    l.superseded_by                        AS superseded_by
FROM kernel.link l
WHERE l.body ->> 'link_kind' = 'composes';

-- The wall (CLAUDE.md §2): SELECT-only for the agent role on the new declared-truth table + the
-- view; all writes revoked. The agent reads the weighted composition for /red-propagation but never
-- writes truth — only the aidos CLI writer role writes, via an approved ChangeSet.
GRANT SELECT ON kernel.composes_weight_admission TO aidos_agent;
GRANT SELECT ON kernel.composes_weight           TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.composes_weight_admission FROM aidos_agent;

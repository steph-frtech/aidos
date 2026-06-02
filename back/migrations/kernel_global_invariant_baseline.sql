-- S48: GlobalInvariant — "un invariant transverse est une exception coûteuse, pas le mode
-- normal" (KRD §49.1). Expand-only, append-only, ADDITIVE. Creates ONE new content-addressed
-- JSONB table, kernel.global_invariant, alongside the S02 record tables and the S16
-- kernel.authority_graph. Applied via Atlas (declarative); this file is the canonical DDL
-- source. It never alters or drops a prior table — the S02 kernel.truth / kernel.layer /
-- kernel.link and the S16 kernel.authority_graph shapes are untouched.
--
-- A GlobalInvariant spans MORE THAN ONE cell (bounded context) — distinct from the per-truth
-- S15 kernel.truth.scope column (which scopes a SINGLE truth's reach). It declares the three
-- FROZEN KRD §49.1 enums: scope ∈ {local_cell, contract_pair, federation_policy}, blast_radius
-- ∈ {small, bounded, global}, approval_required ∈ {cell_owner, both_contract_owners,
-- architecture_owner} — never a fourth value.
--
-- CONTENT-ADDRESS (KRD §12, S02 substrate): each row is content-addressed and append-only, the
-- SAME scheme as the S02 record tables (do not fork it):
--   id            = SHA-256 hex of the canonical JSONB body (records.Hash(Canonicalize(body)))
--   body          = canonical JSONB carrying {name, scope, cells, predicate, blast_radius, approval_required}
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at    = insertion time
-- Append-only: a row body is NEVER updated or deleted. The head moves by INSERTing a new row
-- and closing the prior row's superseded_by. Changing scope/cells ⇒ a `rescope`; the
-- blast_radius weight class ⇒ a `reweight`; approval_required ⇒ a `reauthorize` SemanticDiff
-- (KRD §44.1) — each a NEW version, never an in-place edit.
--
-- ENUM CHECKS (defense in depth alongside the pure globalinvariant.Validate boundary check):
-- the three §49.1 enums are pinned BOTH inside the JSONB body AND as CHECK constraints on a
-- JSONB-path expression, so an out-of-enum value cannot be persisted. The lists are EXACTLY
-- the frozen §49.1 members — no invented value.
--
-- THE WALL (CLAUDE.md §2): the agent role gets SELECT ONLY on kernel.global_invariant and is
-- REVOKEd all writes — the new table opens NO write door. Only the privileged aidos CLI writer
-- role writes truth, via an approved ChangeSet. This migration is AUTHORED here but APPLIED by
-- the migration role; aidos_agent + the SELECT/REVOKE convention come from the S02 records
-- baseline (kernel schema already exists).

-- kernel.global_invariant — the §49.1 GlobalInvariant AST, content-addressed + append-only.
CREATE TABLE IF NOT EXISTS kernel.global_invariant (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT global_invariant_pkey PRIMARY KEY (id)
);

-- The three FROZEN KRD §49.1 enums, pinned as CHECK constraints on the JSONB body path so an
-- out-of-enum value cannot be persisted (defense in depth alongside globalinvariant.Validate).
ALTER TABLE kernel.global_invariant
    DROP CONSTRAINT IF EXISTS global_invariant_scope_enum;
ALTER TABLE kernel.global_invariant
    ADD CONSTRAINT global_invariant_scope_enum CHECK (
        body->'global_invariant'->>'scope' IN (
            'local_cell',
            'contract_pair',
            'federation_policy'
        )
    );

ALTER TABLE kernel.global_invariant
    DROP CONSTRAINT IF EXISTS global_invariant_blast_radius_enum;
ALTER TABLE kernel.global_invariant
    ADD CONSTRAINT global_invariant_blast_radius_enum CHECK (
        body->'global_invariant'->>'blast_radius' IN (
            'small',
            'bounded',
            'global'
        )
    );

ALTER TABLE kernel.global_invariant
    DROP CONSTRAINT IF EXISTS global_invariant_approval_required_enum;
ALTER TABLE kernel.global_invariant
    ADD CONSTRAINT global_invariant_approval_required_enum CHECK (
        body->'global_invariant'->>'approval_required' IN (
            'cell_owner',
            'both_contract_owners',
            'architecture_owner'
        )
    );

-- The wall (CLAUDE.md §2): SELECT-only for the agent role; all writes revoked. The agent can
-- read the cross-cell invariants for the /global-invariants panel but never write truth.
GRANT SELECT ON kernel.global_invariant TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.global_invariant FROM aidos_agent;

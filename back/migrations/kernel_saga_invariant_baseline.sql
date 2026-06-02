-- S49: SagaInvariant + CoherenceTest — "un changement dans une cellule ne bloque ni ne corrompt
-- la fédération" (KRD §49.2). Expand-only, append-only, ADDITIVE. Creates ONE new content-
-- addressed JSONB table, kernel.saga_invariant, alongside the S02 record tables, the S16
-- kernel.authority_graph and the S48 kernel.global_invariant. Applied via Atlas (declarative);
-- this file is the canonical DDL source. It never alters or drops a prior table — the S02
-- kernel.truth / kernel.layer / kernel.link, the S16 kernel.authority_graph and the S48
-- kernel.global_invariant shapes are untouched.
--
-- A SagaInvariant is a CROSS-CELL distributed-transaction invariant (KRD §49.2): it binds named
-- participants (order, payment, shipping) to a property that must hold across the fédération, each
-- participant carrying its compensation step. Per §49.1 a saga is transverse by definition — its
-- scope is one of {contract_pair, federation_policy}, NEVER local_cell (which is deliberately
-- EXCLUDED from the scope CHECK so a saga cannot be declared cell-local). The mirror cert_language
-- ∈ {statechart, pact, tla+}.
--
-- CONTENT-ADDRESS (KRD §12, S02 substrate): each row is content-addressed and append-only, the
-- SAME scheme as the S02 record tables (do not fork it):
--   id            = SHA-256 hex of the canonical JSONB body (records.Hash(Canonicalize(body)))
--   body          = canonical JSONB carrying {name, scope, participants, property, mirror, coherence_test}
--   version       = the same hash (KRD §12: the version is the licence to change)
--   superseded_by = NULL for a head row; set to the id of the row that replaces it
--   created_at    = insertion time
-- Append-only: a row body is NEVER updated or deleted. The head moves by INSERTing a new row and
-- closing the prior row's superseded_by. Changing scope/participants ⇒ a `rescope`; the property
-- ⇒ a `refine`; the compensation/contract refs ⇒ a `reweight` SemanticDiff (KRD §44.1) — each a
-- NEW version, never an in-place edit.
--
-- ENUM CHECKS (defense in depth alongside the pure sagas.Validate boundary check): the scope and
-- mirror.cert_language enums are pinned BOTH inside the JSONB body AND as CHECK constraints on a
-- JSONB-path expression, so an out-of-enum value cannot be persisted. The scope list is EXACTLY
-- the two transverse scopes — local_cell is EXCLUDED (a saga can never be cell-local). The
-- participant lists, the property AST, the pinned compensation/contract refs live INSIDE the JSONB
-- body (version-pinned refs, not foreign keys — a stale/absent target must stay inspectable so it
-- can be shown red, never forbidden by an FK).
--
-- THE WALL (CLAUDE.md §2): the agent role gets SELECT ONLY on kernel.saga_invariant and is REVOKEd
-- all writes — the new table opens NO write door. Only the privileged aidos CLI writer role writes
-- truth, via an approved ChangeSet. aidos_agent + the SELECT/REVOKE convention come from the S02
-- records baseline (kernel schema already exists).

-- kernel.saga_invariant — the §49.2 SagaInvariant AST, content-addressed + append-only.
CREATE TABLE IF NOT EXISTS kernel.saga_invariant (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT saga_invariant_pkey PRIMARY KEY (id)
);

-- The scope CHECK constraint pins EXACTLY the two transverse scopes — local_cell is EXCLUDED so a
-- saga can never be declared cell-local (KRD §49.1: a saga is transverse by definition).
ALTER TABLE kernel.saga_invariant
    DROP CONSTRAINT IF EXISTS saga_invariant_scope_enum;
ALTER TABLE kernel.saga_invariant
    ADD CONSTRAINT saga_invariant_scope_enum CHECK (
        body->'saga_invariant'->>'scope' IN (
            'contract_pair',
            'federation_policy'
        )
    );

-- The cert_language CHECK constraint pins the frozen §49.2 three-set.
ALTER TABLE kernel.saga_invariant
    DROP CONSTRAINT IF EXISTS saga_invariant_cert_language_enum;
ALTER TABLE kernel.saga_invariant
    ADD CONSTRAINT saga_invariant_cert_language_enum CHECK (
        body->'saga_invariant'->'mirror'->>'cert_language' IN (
            'statechart',
            'pact',
            'tla+'
        )
    );

-- The wall (CLAUDE.md §2): SELECT-only for the agent role; all writes revoked. The agent can read
-- the saga invariants for the /sagas panel but never write truth.
GRANT SELECT ON kernel.saga_invariant TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.saga_invariant FROM aidos_agent;

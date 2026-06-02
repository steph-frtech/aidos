-- S36: the API projection ledger extension + Pact contract record. Expand-only,
-- append-only. (1) extends S34's emit-ledger target CHECK to ADMIT 'api' (expand-
-- contract: add the value, never drop the prior ones), so an api artifact's
-- source_hash/output_hash are tracked and staleness stays COMPUTED; (2) adds
-- runtime.api_contract — the Pact-contract record for a projected route. It NEVER
-- alters or drops a prior table, value, or GRANT (S01 archive, S02 kernel records,
-- S04 wall grants, S05 mirror runs, S07 sensor runs, S34 generated_artifacts, S35
-- kernel.entity all untouched). The S04 PreToolUse hook + the GRANTs below are the wall.
--
-- THE WALL (CLAUDE.md §2, ADR 0026): neither the ledger nor api_contract is truth —
-- both live in the `runtime` schema BELOW the waterline. The agent role MAY write
-- nothing here directly; it READS operations from kernel (SELECT-only), READS contracts
-- here (SELECT-only), and authors NEITHER. The aidos writer role inserts/updates a
-- contract row via an approved ChangeSet. The kernel/mirrors/fitness truth schemas stay
-- SELECT-only to the agent.
--
-- THE PACT CONTRACT (the "Pact between cells" slot): runtime.api_contract pins, per
-- route, the operation content-address the contract was frozen from + the Pact-v3 JSON
-- body + the last verification time (set by the pact-verifier MCP when a verification
-- PASSES). PRIMARY KEY (method, route, operation_hash): re-pinning the SAME route from
-- the SAME operation is idempotent; a CHANGED operation (new operation_hash) is a NEW
-- contract row, the prior left in place (append-only — the staleness feed, S22).
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANTs are
-- declarative. The Go Testcontainers suite (back/runtime/generators) applies the S02 +
-- S04 + S34 + S36 baselines against a throwaway real Postgres on every `go test`, so the
-- ledger 'api' value + the contract round-trip + the GRANTs are proven end-to-end.

CREATE SCHEMA IF NOT EXISTS runtime;

-- (1) Expand the emit-ledger target CHECK to admit 'api' (S34 had go-sqlc|pg-ddl|ts-types).
-- Expand-contract: drop the OLD constraint and re-add it with the SUPERSET — no prior
-- value is removed; existing rows still satisfy it. Guarded so it is idempotent and safe
-- when generated_artifacts does not yet exist (out-of-order apply).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'runtime' AND table_name = 'generated_artifacts'
    ) THEN
        ALTER TABLE runtime.generated_artifacts
            DROP CONSTRAINT IF EXISTS generated_artifacts_target_check;
        -- Re-create the column CHECK under a stable name with the expanded value set.
        ALTER TABLE runtime.generated_artifacts
            ADD CONSTRAINT generated_artifacts_target_check
            CHECK (target IN ('go-sqlc', 'pg-ddl', 'ts-types', 'api'));
    END IF;
END
$$;

-- (2) runtime.api_contract — one Pact contract per projected route.
--   route          : the HTTP route the operation projects to (e.g. /orders).
--   method         : the HTTP method (e.g. POST).
--   operation_hash : the content address of the operation ⊕ entity the contract was
--                    pinned from (= records.Hash(Canonicalize(...)), S02 reused).
--   pact_json      : the Pact-v3 contract body (the consumer expectation).
--   last_verified_at : when the pact-verifier MCP last PASSED provider verification
--                    (NULL until first verified) — the contract-test status surfaced
--                    in the /api-projection panel.
--   created_at     : insertion time (append-only audit).
CREATE TABLE IF NOT EXISTS runtime.api_contract (
    route            TEXT        NOT NULL,
    method           TEXT        NOT NULL,
    operation_hash   TEXT        NOT NULL,
    pact_json        JSONB       NOT NULL,
    last_verified_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT api_contract_pkey PRIMARY KEY (method, route, operation_hash)
);

-- The agent DB role (S01 created it as NOLOGIN; guard in case this runs first).
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

-- ── The wall on runtime.api_contract ────────────────────────────────────────
-- The agent: USAGE on the schema + SELECT ONLY on the contract (it READS the contract
-- to render the /api-projection panel — it never writes it). No INSERT/UPDATE/DELETE.
GRANT USAGE  ON SCHEMA runtime TO aidos_agent;
GRANT SELECT ON runtime.api_contract TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON runtime.api_contract FROM aidos_agent;

-- The aidos writer role: inserts a contract (via an approved ChangeSet) and UPDATEs
-- last_verified_at when the pact-verifier passes. DELETE withheld: append-only.
GRANT USAGE          ON SCHEMA runtime TO aidos;
GRANT SELECT, INSERT, UPDATE ON runtime.api_contract TO aidos;

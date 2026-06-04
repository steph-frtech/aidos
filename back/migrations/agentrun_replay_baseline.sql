-- BA26: the REPLAY extension of runtime.agent_run (gap A2) — the AgentRun schema gains
-- `impl` (the content-hash of its AgentImplementation), `seed` (declared in BA01, or the
-- derived Hash(impl‖pack‖item)) and `provider_transcript` (the ref replay re-feeds), so a
-- run can be deterministically REPLAYED (BA28). Expand-only, forward-only, append-only.
-- Never alters or drops a prior table, GRANT, or posture (S52 agent_layer_baseline, BA20
-- scheduler_role_baseline all untouched).
--
-- SUPERSEDE-VIA-VERSION, NOT A SILENT HASH MUTATION (anti-overwrite §9). The run body is
-- JSONB and the three replay keys live INSIDE it, so this is an ANNOUNCED extension of the
-- content-address into a NEW @version of the run body, NOT an in-place mutation of any
-- existing run's hash. A LEGACY (seedless) run omits all three keys — agentrun.Record
-- (canonicalBody) excludes an empty replay field, so the legacy body is byte-identical to
-- the pre-BA26 shape and its content-hash is UNCHANGED. agentrun.LegacyID proves it: for a
-- seedless run, Record(r).ID == LegacyID(r). The roundtrip mirror (agentrun_replay_property
-- _test.go, Testcontainers-ready) pins both the read-back and the legacy-hash stability.
--
-- THE WALL HOLDS (CLAUDE.md §2, unchanged). runtime.agent_run stays BELOW the waterline —
-- it is a runtime EVENT, not a layer/truth: it carries NO `version` and NO `mirror` column,
-- exactly as S52 declared. The agent role keeps INSERT+SELECT only (append-only telemetry);
-- this migration adds NO write surface and grants NOTHING above the line. The transcript is
-- a REF here; its redaction (gap H1: the ledger is not a secret store) is enforced at
-- BA28 before persistence — this migration only opens the schema, it stores no raw secret.
--
-- Idempotent: schema + index use IF NOT EXISTS; the constraint is guarded; nothing dropped.
-- Forward-only: it ADDS a partial index over the JSONB seed lane; it removes nothing.

CREATE SCHEMA IF NOT EXISTS runtime;

-- ── EXPAND: assert the run body may carry the three replay keys (documentation + shape) ──
-- The body is JSONB; the replay fields are JSONB keys, so no column ADD is needed — the
-- existing agent_run_body_shape_chk (body is an object) already admits them. We add a
-- partial index so replay can look a run up BY its seed without a full scan, and so the
-- "a new run carries a seed" discipline is queryable. The index is partial (only rows that
-- actually carry a seed) so legacy seedless rows cost nothing.
CREATE INDEX IF NOT EXISTS agent_run_seed_idx
    ON runtime.agent_run ((body->>'seed'))
    WHERE body ? 'seed';

-- An index on the impl hash, for "every run produced by this AgentImplementation" lookups
-- (the replay/observability join in BA27/BA28). Partial, so legacy rows are free.
CREATE INDEX IF NOT EXISTS agent_run_impl_idx
    ON runtime.agent_run ((body->>'impl'))
    WHERE body ? 'impl';

-- ── A guarded CHECK pinning the supersede-via-version discipline at the storage edge ─────
-- When the body carries a `provider_transcript`, it MUST also carry an `impl` and a `seed`
-- — a transcript with nothing to replay against would be a partial (un-replayable) run.
-- This makes the three replay keys a COHERENT unit at the DB edge (defense in depth atop
-- the agentrun.Record helpers). Legacy seedless rows (none of the three keys) pass freely.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agent_run_replay_coherent_chk'
    ) THEN
        ALTER TABLE runtime.agent_run
            ADD CONSTRAINT agent_run_replay_coherent_chk CHECK (
                NOT (body ? 'provider_transcript')
                OR ((body ? 'impl') AND (body ? 'seed'))
            );
    END IF;
END
$$;

-- ── The agent role is UNTOUCHED: still INSERT+SELECT, still append-only, still below ─────
-- Re-state S52's posture so this migration is self-contained and order-independent: the
-- agent records its OWN runs (INSERT) and reads them (SELECT) but NEVER UPDATE/DELETE
-- (append-only; a run is never altered or deleted). NO write above the line — the wall,
-- unchanged. The replay extension widens what a run RECORDS, never what the agent may WRITE.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;
GRANT  USAGE          ON SCHEMA runtime        TO aidos_agent;
GRANT  SELECT, INSERT ON runtime.agent_run     TO aidos_agent;
REVOKE UPDATE, DELETE, TRUNCATE ON runtime.agent_run FROM aidos_agent;

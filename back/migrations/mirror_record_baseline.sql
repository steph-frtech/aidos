-- S06: the typed Mirror record — mirrors.mirror_record.
-- Expand-only, append-only, content-addressed. Never alters or drops a prior
-- table (S01 archive + S02 kernel records + S04 wall grants + S05 mirror_runs
-- untouched; in particular the generic mirrors.mirror store from S02 is left as
-- is — this table is the TYPED projection of a mirror, carrying the five KRD §34
-- fields explicitly so the completeness join can read them as columns).
--
-- THE BICEPHALOUS BODY (KRD §29, §33, §34): a Mirror is the proof head of a
-- truth (a kernel.layer). Each row carries the five typed fields:
--   reflects_layer_id + reflects_version  → the kernel layer it proves @version
--                                           (the `mirrors` link, KRD §41)
--   test_kind      ∈ acceptance|e2e|property|fixture|contract|schema|unit|snapshot|meter
--   cert_language  ∈ gherkin|xstate|fast-check|rapid|zod|pact|type-check|k6|fixture|
--                    snapshot|unit|prose
--   authority      ∈ above|below   (test-as-goal vs test-as-means, KRD §15)
--   liveness       ∈ alive|dead    (a non-executable/orphan mirror is dead = red)
--
-- THE WALL (CLAUDE.md §2): mirrors is ABOVE the waterline (truth). The agent role
-- gets SELECT ONLY — NO INSERT/UPDATE/DELETE/TRUNCATE. The completeness package
-- (back/kernel/mirror/records) READS this table to compute the monster set and
-- writes NOTHING. Only the privileged `aidos` writer role writes a mirror record,
-- via an approved ChangeSet (the single door to truth, KRD §98).
--
-- APPEND-ONLY + CONTENT-ADDRESSED: id = version = content_hash = the SHA-256 hex
-- of the canonical mirror body (KRD §12, matches records.Hash / contentstore).
-- Re-pointing a mirror (a new reflects @version, a liveness flip) APPENDS a new
-- immutable row and closes the prior row's superseded_by to the new id — it never
-- mutates a row in place. The head is mutable; history is not.
--
-- Idempotent: schema + table use IF NOT EXISTS; roles are guarded; GRANT/REVOKE
-- are declarative. It is the canonical DDL source; a Go Testcontainers suite
-- (back/kernel/mirror/records) applies the S02 + S06 baselines against a throwaway
-- real Postgres on every `go test`, proving append-only + the wall end-to-end.

CREATE SCHEMA IF NOT EXISTS mirrors;

-- mirrors.mirror_record — one immutable, content-addressed row per typed mirror.
CREATE TABLE IF NOT EXISTS mirrors.mirror_record (
    id                 TEXT        NOT NULL,  -- content address (= version = content_hash)
    reflects_layer_id  TEXT        NOT NULL,  -- the kernel layer it proves
    reflects_version   TEXT        NOT NULL,  -- @version of that layer (the `mirrors` link)
    test_kind          TEXT        NOT NULL
        CHECK (test_kind IN ('acceptance','e2e','property','fixture','contract','schema','unit','snapshot','meter')),
    cert_language      TEXT        NOT NULL
        CHECK (cert_language IN ('gherkin','xstate','fast-check','rapid','zod','pact','type-check','k6','fixture','snapshot','unit','prose')),
    authority          TEXT        NOT NULL CHECK (authority IN ('above','below')),
    liveness           TEXT        NOT NULL CHECK (liveness IN ('alive','dead')),
    content_hash       TEXT        NOT NULL,  -- SHA-256 hex of the canonical body
    version            TEXT        NOT NULL,  -- the licence to change (= id = content_hash)
    superseded_by      TEXT,                  -- NULL for a head row; set when the head moves
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT mirror_record_pkey PRIMARY KEY (id),
    -- Content-addressed: id, version and content_hash are the same digest.
    CONSTRAINT mirror_record_content_addressed_chk CHECK (id = version AND id = content_hash)
);

-- Fast "living mirrors reflecting layer X" and "head rows" lookups for the
-- completeness join (mirrors ⋈ kernel).
CREATE INDEX IF NOT EXISTS mirror_record_reflects_idx
    ON mirrors.mirror_record (reflects_layer_id, reflects_version);
CREATE INDEX IF NOT EXISTS mirror_record_head_idx
    ON mirrors.mirror_record (id) WHERE superseded_by IS NULL;

-- The agent DB role (S01 created it NOLOGIN; guard in case this runs first).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- The privileged writer role (S04 created it; guard).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos') THEN
        CREATE ROLE aidos NOLOGIN;
    END IF;
END
$$;

-- ── The wall: the agent gets SELECT only on the typed mirror record ──────────
GRANT USAGE ON SCHEMA mirrors TO aidos_agent;
GRANT SELECT ON mirrors.mirror_record TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON mirrors.mirror_record FROM aidos_agent;

-- ── The aidos writer: append + close-head only (append-only, no destructive) ─
-- INSERT a new row; UPDATE is permitted ONLY to close superseded_by on a prior
-- head (the head moves by pointing the old row at the new id) — Postgres has no
-- column-scoped GRANT, so the append-only discipline of the BODY is enforced by
-- the application (the aidos CLI only ever writes superseded_by) and proven by
-- the Testcontainers append-only test. DELETE/TRUNCATE are never granted.
GRANT USAGE ON SCHEMA mirrors TO aidos;
GRANT SELECT, INSERT, UPDATE ON mirrors.mirror_record TO aidos;
REVOKE DELETE, TRUNCATE ON mirrors.mirror_record FROM aidos;

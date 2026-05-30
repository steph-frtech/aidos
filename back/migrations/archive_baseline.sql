-- S01: Archive baseline migration
-- Expand-contract, append-only. No UPDATE/DELETE granted on content/history.
-- Applied via Atlas (declarative). This file is the canonical DDL source.

-- Schema: archive
CREATE SCHEMA IF NOT EXISTS archive;

-- content: immutable content-addressed objects. PK = SHA-256 hex digest.
-- Once a row exists, it is never updated or deleted (append-only enforced via GRANT).
CREATE TABLE IF NOT EXISTS archive.content (
    hash        TEXT        NOT NULL,
    data        BYTEA       NOT NULL,
    byte_size   BIGINT      NOT NULL GENERATED ALWAYS AS (octet_length(data)) STORED,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT content_pkey PRIMARY KEY (hash)
);

-- head: mutable pointer from a named key to a content hash.
-- Upserted on every SetHead call.
CREATE TABLE IF NOT EXISTS archive.head (
    key         TEXT        NOT NULL,
    hash        TEXT        NOT NULL REFERENCES archive.content(hash),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT head_pkey PRIMARY KEY (key)
);

-- history: append-only log of every head move.
-- parent_hash is NULL for the first move on a key.
CREATE TABLE IF NOT EXISTS archive.history (
    id          BIGSERIAL   NOT NULL,
    key         TEXT        NOT NULL,
    hash        TEXT        NOT NULL REFERENCES archive.content(hash),
    parent_hash TEXT        REFERENCES archive.content(hash),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT history_pkey PRIMARY KEY (id)
);

-- Index for fast history lookups by key, ordered oldest-first.
CREATE INDEX IF NOT EXISTS history_key_created_idx ON archive.history (key, created_at ASC);

-- Append-only enforcement (the wall, in-database).
-- The agent role may INSERT/SELECT on content/history but is NEVER granted
-- UPDATE or DELETE there: content and history are append-only. The head pointer
-- is the only mutable surface, so UPDATE on head is allowed for the upsert.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA archive TO aidos_agent;

-- content: append-only — INSERT + SELECT only (no UPDATE, no DELETE).
GRANT INSERT, SELECT ON archive.content TO aidos_agent;

-- history: append-only — INSERT + SELECT only (no UPDATE, no DELETE).
GRANT INSERT, SELECT ON archive.history TO aidos_agent;
GRANT USAGE, SELECT ON SEQUENCE archive.history_id_seq TO aidos_agent;

-- head: the single mutable pointer — INSERT/SELECT/UPDATE, still no DELETE.
GRANT INSERT, SELECT, UPDATE ON archive.head TO aidos_agent;

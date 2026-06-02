-- S43: RealityMirror baseline migration — the `incidents` schema (reality as a sensor)
-- and the minimal `telemetry` landing the telemetry-reader MCP reads.
--
-- Expand-only, append-only. It ADDS two schemas (incidents, telemetry) and their tables
-- plus one GRANT set; it never alters or drops a prior table or GRANT (CLAUDE.md §9, the
-- anti-overwrite rule). The wall (S04) is UNCHANGED and re-asserted below.
--
-- THE EXTERNAL LOOP (boucle ③, KRD §53/§67/§117/§1099; back/runtime/CONTEXT.md): reality is
-- a SENSOR that READS the world and PROPOSES. An Incident is REALITY — a recurring failure /
-- breached budget that NO existing fixture covers (the kernel was incomplete, "faux par
-- omission"). It carries a signal + a cause SKETCH (a hypothesis, never a falsifiable
-- assertion) + the incident_derived taint, and — BY CONSTRUCTION — has NO `mirror` and NO
-- `version`/freeze column. That double absence is EXACTLY what makes it reality and not a
-- truth: an incident PROPOSES a mirror, it is not one. The table literally cannot hold the
-- thing that would make a row a truth.
--
-- THE WALL + THE ASYMMETRY (CLAUDE.md §2 / S04 / KRD §1099): reality is BELOW the waterline,
-- so the agent DB role gets INSERT/SELECT on incidents.* (it observes and appends incidents
-- freely) and SELECT on the telemetry store (observing reality is allowed) — but NO grant
-- whatsoever on the kernel/mirrors/fitness schemas. That asymmetry — observable reality that
-- can NEVER become truth without the full flow Incident → /learn → Idea → Mirror → Goal →
-- Kernel — is exactly what the RealityMirror's ToKernel gate mirrors at the row level. The
-- only outward edge is → the S27 idea-intake door (the already-granted ideas.* capture path);
-- the kernel write at the far end of the flow is the `aidos` CLI writer role via /goal, never
-- the agent and never an incident.
--
-- The incident id is the content hash of the canonical body (S01/S02 content-addressing): the
-- same {ref, signal, cause_sketch, taint, linked_branches} always lands at the same address.
-- Append-only: an incident is KEPT, never deleted (no DELETE grant); re-observing increments
-- recurrence and is kept (history is never destroyed). The `idea_id` is set (UPDATE) once
-- /learn has handed the incident to the S27 door (the loop traced back) — it is the ONLY
-- mutable column and is excluded from the content address.

CREATE SCHEMA IF NOT EXISTS incidents;

CREATE TABLE IF NOT EXISTS incidents.incident (
    -- id = Hash(Canonicalize(body)) — the content address of the incident body (S01/S02).
    id             text        PRIMARY KEY,
    -- body holds {kind:"incident", ref, signal, cause_sketch, taint, linked_branches}.
    -- There is NO `mirror` key and NO `version` key in the body — an incident is reality,
    -- never a truth.
    body           jsonb       NOT NULL,
    -- taint is the closed-enum provenance-quality marker set; it always CONTAINS
    -- incident_derived (S30 vocabulary). Indexed column mirrors body->'taint'.
    taint          text[]      NOT NULL,
    -- linked_branches are the DAG branches the incident relates to (KRD §927). May be empty.
    linked_branches text[]     NOT NULL,
    -- idea_id is the draft idea /learn produced (the loop traced back). NULL until /learn has
    -- run — a FK-by-value to ideas.idea (S27). The ONLY mutable column; excluded from the
    -- content address (lifecycle metadata, not identity).
    idea_id        text,
    -- first_seen is when the incident was first observed.
    first_seen     timestamptz NOT NULL,
    -- created_at is the row insertion timestamp.
    created_at     timestamptz NOT NULL
    -- NOTE: deliberately NO `mirror` column and NO `version`/freeze column. By construction an
    -- incident cannot carry the thing that would make it a truth (the Go type makes it
    -- unrepresentable; the schema makes it unrepresentable in Postgres).
);

-- The body must carry the kind discriminator "incident" (content-addressing namespacing)
-- and must NOT carry a `mirror` or `version` key (defense in depth: even a hand-crafted
-- INSERT cannot smuggle a freeze/mirror into an incident row).
ALTER TABLE incidents.incident
    DROP CONSTRAINT IF EXISTS incident_kind_chk;
ALTER TABLE incidents.incident
    ADD CONSTRAINT incident_kind_chk
    CHECK (body ->> 'kind' = 'incident');

ALTER TABLE incidents.incident
    DROP CONSTRAINT IF EXISTS incident_no_mirror_no_version_chk;
ALTER TABLE incidents.incident
    ADD CONSTRAINT incident_no_mirror_no_version_chk
    CHECK (NOT (body ? 'mirror') AND NOT (body ? 'version'));

-- The taint column must contain incident_derived (reality always carries the taint).
ALTER TABLE incidents.incident
    DROP CONSTRAINT IF EXISTS incident_taint_incident_derived_chk;
ALTER TABLE incidents.incident
    ADD CONSTRAINT incident_taint_incident_derived_chk
    CHECK ('incident_derived' = ANY (taint));

-- ── The telemetry landing the telemetry-reader MCP reads (OpenTelemetry → Postgres) ──
-- The minimal read path: spans/metrics the OTel collector lands here so `telemetry_query`
-- has real signal to read and reflect back as incidents. Full operation-level emission is
-- out of scope (S43): this is just the READ side the external loop needs. The agent role is
-- SELECT-ONLY on this store (it observes reality, it does not forge telemetry).
CREATE SCHEMA IF NOT EXISTS telemetry;

CREATE TABLE IF NOT EXISTS telemetry.span (
    -- trace_id / span_id are the OpenTelemetry identifiers (hex).
    trace_id   text        NOT NULL,
    span_id    text        NOT NULL,
    -- name is the operation/journey the span covers (e.g. "createOrder").
    name       text        NOT NULL,
    -- status is the OTel span status ("OK" | "ERROR").
    status     text        NOT NULL,
    -- attributes holds the OTel attributes (error code, budget, etc.) as JSONB.
    attributes jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- started_at / ended_at bound the span.
    started_at timestamptz NOT NULL,
    ended_at   timestamptz NOT NULL,
    PRIMARY KEY (trace_id, span_id)
);

CREATE TABLE IF NOT EXISTS telemetry.metric (
    -- name is the metric (e.g. "createOrder.error_rate", "checkout.p99_latency_ms").
    name        text        NOT NULL,
    -- value is the observed measurement.
    value       double precision NOT NULL,
    -- attributes holds the OTel attributes (budget threshold, etc.) as JSONB.
    attributes  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- observed_at is when the measurement landed.
    observed_at timestamptz NOT NULL,
    PRIMARY KEY (name, observed_at)
);

-- ── Roles (guarded; created at S01/S04) ──────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aidos_agent') THEN
        CREATE ROLE aidos_agent NOLOGIN;
    END IF;
END
$$;

-- ── Reality is BELOW the waterline: the agent observes (INSERT) and reads (SELECT) ──
-- incidents.* is observable reality: the agent INSERTs (observes an incident) and SELECTs
-- (reads it for the loop), and UPDATEs ONLY to set idea_id once /learn has run (the loop
-- traced back). It NEVER gets DELETE — an incident is append-only and kept (history is never
-- destroyed). The recurrence increment is a re-observe (a kept content-addressed row).
GRANT USAGE ON SCHEMA incidents TO aidos_agent;
GRANT SELECT, INSERT, UPDATE ON incidents.incident TO aidos_agent;
REVOKE DELETE, TRUNCATE ON incidents.incident FROM aidos_agent;

-- Future tables in incidents.* default to SELECT/INSERT for the agent (observable reality).
ALTER DEFAULT PRIVILEGES IN SCHEMA incidents GRANT SELECT, INSERT ON TABLES TO aidos_agent;

-- telemetry.* is reality the agent only READS (observing the world is allowed); it never
-- forges telemetry. SELECT-only — the OTel collector (a separate role) writes it.
GRANT USAGE ON SCHEMA telemetry TO aidos_agent;
GRANT SELECT ON telemetry.span, telemetry.metric TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON telemetry.span, telemetry.metric FROM aidos_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA telemetry GRANT SELECT ON TABLES TO aidos_agent;

-- ── The wall is UNCHANGED — re-assert SELECT-only / no-write on the truth schemas ────
-- This migration provably does NOT weaken S02/S04/S27: the agent can NEVER write the kernel
-- or mirrors. The asymmetry above IS the RealityMirror at the row level — observable
-- incidents.* + readable telemetry.*, unwritable kernel/mirrors/fitness. Reality cannot
-- declare truth.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA kernel  FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA mirrors FROM aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA fitness FROM aidos_agent;
REVOKE CREATE ON SCHEMA kernel  FROM aidos_agent;
REVOKE CREATE ON SCHEMA mirrors FROM aidos_agent;
REVOKE CREATE ON SCHEMA fitness FROM aidos_agent;

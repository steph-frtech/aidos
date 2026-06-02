# ADR 0027 — S37 DB projection: explicit prior-shape diff + DataTruthScope guard

- Status: Accepted
- Date: 2026-06-01
- Step: S37 (Runtime — DB projection, Atlas migration emitted from the entity, expand-contract) + DataTruthScope (KRD §44.3)
- Supersedes: none. Extends: ADR 0012 (Atlas versioned migrations), S34/S35 emitter discipline, S13 BlockReason, S21 SemanticDiff.

## Context

KRD line 532 makes `db = migrations (expand-contract)` a PROJECTION of `entity` (ai / below the waterline). S37 must (1) emit, from the entity AST, the expand-contract / forward-only Atlas migration that brings the schema to the new entity head, and (2) land DataTruthScope (§44.3): the explicit declaration of what a new truth does to historical data, so a historical-impact change requires a declared migration. The done criterion: the emitted migration dry-runs valid (real Postgres) ∧ a historical-impact change requires a declared migration.

Two genuine choices arose within the frozen slots (Atlas migrations; sqlc+pgx; Testcontainers (Go) with real Postgres; rapid for properties — all FIXED):

### Decision 1 — how the `prior` head shape is obtained for the diff

Options (≤3, May 2026):
1. **Explicit prior input** — `EmitMigration(entity, prior *EntitySource)`. The caller passes the prior head (the entity's prior version, read from the kernel's append-only history). The emitter computes the column-set diff (added / dropped) purely.
2. Atlas declarative introspection — connect to a live DB, let Atlas diff desired-vs-current. Rejected: makes the emitter impure (I/O, a live DB), breaks determinism and the "pure/total/deterministic" contract; couples emit-time to a running engine.
3. A stored prior-DDL string input — same as (1) but lower-level (raw SQL). Rejected: re-parses SQL the entity AST already pins; (1) reuses the typed source directly.

**Chosen: (1) explicit prior `*EntitySource`.** It keeps `EmitMigration` pure/total/deterministic (no clock, no RNG, no DB), reuses the entity AST the kernel already stores (no SQL re-parse), and lets Atlas/Testcontainers validate the EMITTED SQL by an ephemeral apply (engine-validated by construction at dry-run, not at emit). `prior == nil` ⇒ the full CREATE TABLE (reusing S35 `EmitDDL` verbatim, never re-typed).

### Decision 2 — expand-contract splitting shape

- An additive change (added columns, no drops) ⇒ a single **EXPAND** step: `ALTER TABLE … ADD COLUMN IF NOT EXISTS … ` (NULLable — no in-place rewrite/drop of historical rows).
- A narrowing change (any dropped column) ⇒ an **EXPAND → BACKFILL → CONTRACT** forward-only plan: expand adds any new columns; backfill is a declared, human-gated placeholder (NOT executed in the emitted file — silently rewriting historical data is forbidden); contract drops the removed columns in a separate guarded forward step (`DROP COLUMN IF EXISTS`). A single destructive DROP is never emitted as one silent step. The contract step is gated by a declared DataTruthScope at the `RequireMigration` guard.

## Decision (DataTruthScope + RequireMigration)

- `DataTruthScope` (KRD §44.3 verbatim): `applies_to` (closed set: new_records | existing_records | historical_records), `migration{required, strategy}` (strategy closed set: expand_contract | backfill | dual_read | dual_write), `audit{preserve_old_truth}`. Content-addressed: `id == version == Hash(Canonicalize(body))` (S02 reused, never forked); applies_to is canonically ordered so the address is order-independent.
- `RequireMigration(change) → (required bool, BlockReason?)`, pure/total/deterministic: a change touching existing/historical records with no declared migration ⇒ `Blocked(HISTORICAL_IMPACT_REQUIRES_MIGRATION)`; an unknown strategy ⇒ `Blocked(UNKNOWN_MIGRATION_STRATEGY)`; a required migration must carry `preserve_old_truth:true`; a new-records-only change ⇒ allowed (no migration required).
- Two BlockReason codes ADDED to S13's closed enum (additive enum extension, change_type: refine — a guardrail ADDED, never removed): `HISTORICAL_IMPACT_REQUIRES_MIGRATION`, `UNKNOWN_MIGRATION_STRATEGY`. Recorded by this ADR + a ChangeSet + SemanticDiff (truth-write to the enum's home is the prior contract's; the agent adds the code constants below the wall, the kernel/mirrors stay SELECT-only).
- Persistence: `runtime.data_truth_scope` (id PK = hash, body jsonb, entity_ref, migration_ref NULL, version, superseded_by NULL, created_at). Expand-only/append-only; never alters/drops a prior table or GRANT. Agent role SELECT-only; only the aidos writer inserts via an approved ChangeSet (the wall). A §44.3 strategy CHECK enforces the closed set in-database.

## Consequences

- The emitter stays pure; the dry-run (Testcontainers Postgres) is the real engine validation (done criterion half 1, proven green). The historical-impact rule is the pure `RequireMigration` guard the aidos writer's existing wall/completeness gate (S04/S12) calls — NOT a new hook (a hook that never fires is dead, §5 hook-honesty).
- Out of scope (OpenQuestions, never built here): a callable migrate/apply MCP op (later persistence-runner step); backfill/dual-read/dual-write EXECUTION (declared only); multi-entity / foreign-key migrations; the human-gated forward-only APPLICATION/commit to a live truth DB; the red-wave wiring (a missing required migration FEEDS S22, never recomputed here).
- Doltgres target (ADR 0006): the emitted Postgres-dialect migration is reusable by both the Postgres and Doltgres targets (same dialect, same sqlc/pgx/Atlas) — no MySQL, no second dialect. The OS truth-store stays Postgres.

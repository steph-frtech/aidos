---
name: s02-content-address
description: S02 KRDCore records — pure content-addressed JSONB substrate; verified-green pattern for round-trip + wall mirrors
metadata:
  type: project
---

S02 (`back/kernel/records`) defines the seven KRDCore record kinds as a PURE, content-addressed (`id == version == SHA-256(Canonicalize(body))`), append-only JSONB substrate. No DB calls in the package; persistence is reached later via sqlc/pgx.

**Why:** every later step reads a typed truth-record; the wall needs tables to forbid agent writes to.

**How to apply (verification):**
- The round-trip + wall proof is `migration_roundtrip_test.go` (Testcontainers, real Postgres 16): seven tables round-trip, then `aidos_agent` is given LOGIN and every INSERT/UPDATE/DELETE must fail with "permission denied". Docker was available — RUN it, don't trust the report.
- The property mirror (`records_property_test.go`) is a real [[determinism-repro-mirror]]: Canonicalize stable under key reorder + any content change ⇒ new hash. Fault-injection (constantifying `Hash`) was confirmed to go red.
- Godog steps assert id==hash==version per kind, not just count — matches [[assert-semantics-not-count]].
- UI `/records` respects the wall correctly: `ProposeControl` is PRESENT but disabled/`data-available=false`, marked « à venir S20 » — read-only projection, no truth-write from screen. This is the right ui-completeness-under-the-wall pattern for any pre-S20 truth route.
- The Atlas versioned migration (`atlas_migrations/2026...02_kernel_records_baseline.sql`) is byte-identical to `kernel_records_baseline.sql` (closes ADR 0012). Atlas CLI is NOT installed — `.sum` integrity can't be checked locally; non-blocking (Testcontainers proves the SQL applies).

**OpenQuestions (forward-deps, NOT residual):** mirrors not yet persisted to `mirrors` Postgres schema (S06); propose→ChangeSet write path disabled (S20/S27); no gremlins mutation run wired (mutation-score gate not yet a pipeline step — `replaceable` in stack).

---
status: accepted
---

# Atlas runs the Archive baseline as a versioned, forward-only migration

S01 stands up the `archive` truth-store schema (`content` / `head` / `history`).
The frozen stack (ADR 0003) names **Atlas** as the migration tool on Postgres
(a `replaceable` slot). This ADR records the one genuinely open sub-choice S01
faced: **how Atlas applies the baseline** — declarative `schema apply` vs
versioned `migrate apply`.

## Decision

Use Atlas **versioned migrations** (`atlas migrate apply`), not declarative
`schema apply`, for the Archive baseline.

- The canonical DDL is `back/migrations/archive_baseline.sql` (human-readable,
  one file, the source the Go Testcontainers suite reads).
- It is mirrored byte-for-byte into the Atlas versioned dir
  `back/migrations/atlas_migrations/` (one timestamped file + `atlas.sum`
  integrity hash), driven by `back/migrations/atlas.hcl` (env `local`).
- Apply: `atlas migrate apply --dir file://atlas_migrations --url $AIDOS_ARCHIVE_DSN`.
- `atlas migrate validate` is clean (exit 0); a real apply against
  Postgres 16 lands all 11 statements (3 tables + index + role + 5 grants).

## Considered Options

- **Declarative `atlas schema apply` (rejected).** Atlas's HCL/SQL schema state
  models tables/columns/indexes but **not roles and GRANTs**. The S01 wall is
  enforced by least-privilege GRANTs (the `aidos_agent` role gets no UPDATE/DELETE
  on `content`/`history`). A declarative diff would silently drop that grant
  logic from the managed state — the very mechanism that makes the store
  append-only. Versioned migrations run the SQL verbatim, GRANTs included.
- **Raw `psql`/exec only, no Atlas (rejected).** Loses the frozen-stack tool and
  the integrity sum / forward-only guarantees; the done-criterion is literally
  "Atlas migration applies on Postgres".
- **Atlas versioned migrations (chosen).** Verbatim SQL (keeps the GRANT wall),
  forward-only + expand-contract (CLAUDE.md §9 anti-overwrite), integrity-summed,
  and the Go Testcontainers suite applies the same SQL on every `go test` so the
  migration is proven end-to-end without requiring the Atlas CLI in CI.

## Consequences

- `back/migrations/atlas.hcl` + `atlas_migrations/` are the reproducible Atlas
  artifacts; `archive_baseline.sql` stays the readable source of truth and must
  be kept in sync with the versioned copy (a later step may add a CI check).
- Future schema changes are **new** versioned migrations (forward-only,
  expand-contract), never edits to an applied one — consistent with the
  append-only truth-store law.
- The append-only wall is proven in-database by `TestAppendOnlyWall`
  (the `aidos_agent` role's destructive writes are rejected `permission denied`).

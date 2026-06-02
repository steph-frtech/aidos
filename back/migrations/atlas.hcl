# Atlas project config — AIDOS truth-store migrations (S01 Archive, S02 Kernel
# records, S04 wall grants, S05 mirror_runs run-log).
#
# Migrations are Atlas-managed, versioned, expand-contract and forward-only
# (CLAUDE.md §3 frozen stack: Atlas on Postgres; §9 anti-overwrite: append-only).
# Each step's canonical DDL (archive_baseline.sql, kernel_records_baseline.sql) is
# mirrored, byte-for-byte, into the versioned dir at migrations/atlas_migrations/
# (one timestamped file per step, integrity-hashed in atlas.sum).
#
# Apply against a running Postgres:
#   atlas migrate apply \
#     --dir   "file://atlas_migrations" \
#     --url   "$AIDOS_ARCHIVE_DSN" \
#     --env   local
#
# The Go Testcontainers suites (back/archive/contentstore for S01,
# back/kernel/records for S02) apply the same SQL against a throwaway real
# Postgres on every `go test`, so each migration is proven to apply end-to-end
# without requiring the Atlas CLI in CI.

variable "url" {
  type    = string
  default = getenv("AIDOS_ARCHIVE_DSN")
}

env "local" {
  url = var.url
  migration {
    dir = "file://atlas_migrations"
  }
  # Dev database Atlas uses to plan/lint diffs (a throwaway Postgres).
  dev = "docker://postgres/16/dev?search_path=public"
}

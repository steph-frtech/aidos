---
name: project-s95-data-migrate
description: S95 verification — per-deployed-app breaking DATA migration planner (expand-backfill-contract, DataTruthScope-gated); verified green zero corrections
metadata:
  type: project
---

# S95 — emitted-app breaking DATA migration planner (EPIC10, DP15/DP26)

PURE driver-neutral planner `back/runtime/datamigrate` Build(Change)->Plan over the DATA of a DEPLOYED emitted app (real rows), DISTINCT from OS truth-store migration (back/migrations). Three breaking kinds (closed set rename/split/cardinality 1-N→N-N) each staged EXPAND→BACKFILL→CONTRACT forward-only; breaking-with-no-backfill REFUSED BREAKING_MIGRATION_NO_BACKFILL. Reuses db.RequireMigration (§44.3 closed strategy/applies_to sets — fed a "breaking"/AppliesExistingRecords Change so the gate validates the declaration the SAME way as truth-store path) + db.EmitMigration scalar set (knownScalar probes a one-field EntitySource — single source of truth for type set). preservesAllData = PURE check every contract preceded by a backfill. content-address = S02 records.Canonicalize+Hash. Writes NOTHING (wall).

**Done-crit (4) each proven by Godog scenario AND property/fixture, ALL RAN green:**
- rename-with-backfill preserves every row (UPDATE old→new before DROP)
- split ventilates rows into new table without loss (INSERT...SELECT)
- 1-N→N-N cardinality migrates without loss (join table backfilled from inline FK)
- emission reproducible (byte-identical Plan/ID)

**Verification (zero corrections):**
- go test -count=1 datamigrate 0.044s + BDD 5/5 scenarios RAN (not skipped) 32 steps + 4 rapid props (Reproducible/NoLoss/BreakingNoBackfillAlwaysRefused/HashSensitive) + 7 fixtures; mcp + blockreason green; gofmt/vet clean; broad `go build ./...` exit 0 prior-green intact
- blockreason CodeBreakingMigrationNoBackfill additive (enum decl :351, registry :892 severity blocking + non-empty 3-item how_to_fix, codeOrder :948)
- MCP aidos-datamigrate 3 PURE tools (plan/kinds/gate) write NOTHING; wall-grep CLEAN across .go/.ts/panel (DDL strings = emitted-app SQL plan output, NOT OS truth writes)
- TS twin vitest 6/6; front id = FNV-1a DISPLAY-ONLY digest, Go records.Hash AUTHORITATIVE (e2e tests id1==id2 reproducibility which display digest satisfies — known-acceptable not-byte-pinned pattern)
- tsc clean for datamigrate files (pre-existing behavior-capture.test.ts `Cannot find name Kind` is untracked S77 NOT-S95); biome exit 0, 3 optional-chain WARNINGS only (non-blocking, `!scope||!scope.x` intentional)
- /data-migrate route action-capable: kind selector + per-kind body fields + backfill-toggle + plan-button + step-${stage} testids + preserves badge + block-code refusal; nav WorkbenchHeader:155 {href:/data-migrate,k:dataMigrate}; i18n fr4439==en4439 EXACT structural parity dataMigrate ns both sides
- e2e 5/5 RAN GREEN live :3000 (incl no-backfill refusal + plan-id reproducibility)
- docs 3-layer (Implémentation·Méta·Méta-méta) docs.json:registered mint validate PASS; HEAD==origin/main 6c323e7 pushed

**OQ (forward-deps, NOT residual):** OQ-S95-apply real APPLY (pulumi up + Atlas apply, Testcontainers seeded-Postgres no-loss proof) = S96 deploy pipeline (S95 GATES it); Linear MCP unauthenticated (OAuth) by-design; mintlify search reindex lag.

VERDICT: passed, zero corrections.

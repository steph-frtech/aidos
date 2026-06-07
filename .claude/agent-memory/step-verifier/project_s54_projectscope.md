---
name: project-s54-projectscope
description: S54 verification — project-scope migration of the truth-store (multi-tenant foundation, EPIC 1); threads project_id FK through 9 tables, backfills singleton graph into __system__ seed
metadata:
  type: project
---

S54 (app-builder EPIC 1, follows S53 project record): the expand-contract migration that SCOPES the truth-store to a project. Threads `project_id` (text, FK→projects.project) through 9 truth+derived tables (kernel.truth/layer/link, mirrors.mirror, ideas.idea, changesets.changeset, dag.phase, brain.memory_item, context.context_graph_decision) and BACKFILLS the pre-S54 singleton graph (Order demo) into the reserved seed project `__system__`.

- Seed content-addressed via S01/S02 records.Hash REUSED (id==version==1a4332ab3616ddfb699b668ae4a4078593231e5f996e6b8f1fd1e44b6a4c5004); pinned byte-for-byte Go↔SQL (TestSeedPinnedInMigrationSQL re-hashes the embedded body). Seed built DIRECTLY from canonical body (slug `__system__` deliberately not user-creatable, bypasses S53 slug regex).
- Migration EXPAND(NULL col)→BACKFILL(UPDATE WHERE project_id IS NULL — the ONLY mutation, fills new col, never rewrites body, never DELETE)→CONTRACT(DEFAULT seed + NOT NULL)→FK→INDEX; DO-block over targets ARRAY skips missing table (idempotent); ON CONFLICT DO NOTHING on seed+dag_root. Re-asserts REVOKE INSERT/UPDATE/DELETE/TRUNCATE on kernel.truth/layer/link+mirrors.mirror+ideas+changesets+dag (wall unchanged).
- ScopedTables() = single source of truth (closed ordered set); migration AND read-path read it. ScopedSelect always `WHERE project_id = $1`, refuses off-set table (ErrUnknownScopedTable, no fabricated scope). EmitMigration() reproducible byte-identical DDL from ScopedTables+SystemSeed.
- DONE-CRITERIA ALL MET: TestZeroLossBackfill (count before==after, backfill to seed) · TestAllFKsResolve (real seed inserts, unknown project_id refused) · TestCrossProjectIsolation (A-scoped ScopedSelect returns 0 B rows, b==0) · TestEmitMigrationReproducible. Testcontainers RAN (go test 11.7s).
- Sensors: gofmt/vet clean, full back build clean, MCP projectscope builds (4 tools scope_tables/scope_select_sql/scope_seed/scope_migration_sql), tsc clean, vitest 6/6, biome S54-files clean, e2e 5/5 :3000, i18n 3272==3272 zero orphans nav both, route 200, panel action-capable (buildScopedSelect button EXECUTES, wall respected — pure read projection no truth write). Docs d15a07a HEAD==origin/main 3 layers mint-validate-passed.
- OQ (forward-deps, NOT residual): RLS keyed on propagated identity=S55 (S54 lays the column/FK it keys on); live HTTP gateway UI→MCP=S58 (source:"demo" but real deterministic values); owner=S62; hard GDPR delete=S116 (S54 soft/append-only); Testcontainers exercises 7 baseline tables (brain/context have own baselines, DO-block proven to skip missing). Linear MCP unauthenticated (OAuth) — best-effort OQ.
- SCAR pre-existing not S54: WorkbenchHeader.tsx:279 ineffective biome-ignore suppression (a11y/useKeyWithClickEvents) — S54's only edit to that file added 2 nav entries near line 23, line 279 untouched. See [[feedback-biome-clean-report-lie]].
- verified-green ZERO corrections.

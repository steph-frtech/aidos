---
name: s98-env-rollback
description: S98 verification — per-app ENVIRONMENTS ladder + ROLLBACK-to-phase by re-projection (EPIC10/DP28/ADR0043); verdict + corrections + recurring patterns
metadata:
  type: project
---

S98 = per-app ENVIRONMENTS (preview→staging→prod closed ladder, declared Rank) + ROLLBACK-to-phase (EPIC10/DP28/ADR0043). PURE Promote(env←phase Stop-gate-FIRST IsDeployable INHERITED from deploy.IsDeployable S96 else ENV_PROMOTE_NOT_STABLE before any re-emit) + Rollback(env→EARLIER stable phase: target must (a) differ from served, (b) precede in DAG lineage=pure set-membership contains(), (c) be stable else ROLLBACK_NOT_EARLIER / ENV_PROMOTE_NOT_STABLE if red; re-projects via preview.EmittedAppHash S94 = fresh re-emit of N-1 NEVER stale sandbox artifact; reconciles datastore datamigrate.Build S95 inverse breaking-no-backfill delegated-refused; records provenance{actor·reason·from·to} append-only content-addr records.Hash). RollbackProducesReProjection PURE code-judges servedHash==dec.ReProjectedAppHash==fresh-re-emit, rejects stale. LadderInOrder declared rank never map-iter.

**Why:** the S98/DP28 done-criterion is « promote N → incident → rollback to N-1 → prod serves app RE-ÉMISE depuis N-1 avec vert antérieur intact, action provenancée, rien supprimé ni restauré comme artefact stale ». Verified the Godog scenario (envrollback.feature:32-40) pins EXACTLY this incl stale-rejection via RollbackProducesReProjection + provenance + append-only(both phases preserved). rapid 5 props (PromoteReproducible, NonStableAlwaysRefused, RollbackReproducibleAndReProjects, NonAncestorAlwaysRefused, ProvenanceSensitivity env/actor/reason→distinct id).

**How to apply:** done-crit MET. go test envrollback/mcp/blockreason green (uncached after fix). 2 new blockreason codes additive CodeEnvPromoteNotStable :386 CodeRollbackNotEarlier :397 registry :992/:1011 non-empty FR Explanation+HowToFix, codeOrder :1068-1069 property-mirror auto-covers. MCP 4 PURE tools (promote/rollback/check_served/ladder) write-NOTHING wall-grep CLEAN (matches=comments only, no Exec/INSERT/db). prior-green preview/deploy/datamigrate/phases intact. TS twin lib/env-rollback.ts reuses lib/deploy (isDeployable/emittedAppHash/subdomainOf) digest=FNV-1a DISPLAY-ONLY Go-records.Hash-authoritative vitest 5/5. /env-rollback action-capable useActionState→promoteAction/rollbackAction, panel defaults actor=alice reason="incident checkout 500s" (e2e asserts contain alice/incident PASS), red-toggle proves ENV_PROMOTE_NOT_STABLE, same/noAncestor toggles prove ROLLBACK_NOT_EARLIER, serves-fresh/rejects-stale data-ok badges, wall-respected(comment-documents propose→ChangeSet). nav:158 i18n fr4529==en4529 EXACT (flatten+diff-sets both empty). e2e 6/6 RAN live:3000 + route 200. docs 3-layer (4 layer-markers) docs.json 2 entries mint validate PASS HEAD==origin/main 59c18e2.

**OpenQuestions (by-design, non-blocking):** sibling /env-rollback route NOT editing S96 /deploy (anti-overwrite §9, DP29 finalizes combined cockpit); Doltgres as-of opt-in reconciliation back-fills on S88/S89 spike outcome; Linear MCP unauthenticated (only authenticate tool); Mintlify search reindex lag.

**CORRECTIONS APPLIED (3):**
1. gofmt -w envrollback.go — var-block ErrNoProject/ErrUnknownEnv alignment (RECURRING gofmt var/struct-tag-align, same as S96/S87/S84 — ALWAYS run gofmt -l on new Go files, executor keeps missing var-block alignment).
2. biome useImportType actions.ts:12 `import { type PromoteView, type RollbackView }` → `import type {...}` (RECURRING biome-on-twins: type-only imports must use `import type`).
3. biome organizeImports — lib/env-rollback.ts export order (type-exports before value-exports) + test.ts import sort via biome --write (RECURRING biome-on-twins assist/source/organizeImports error-level FIXABLE; executor leaves export/import ordering unsorted).

verified-green AFTER 3 corrections (1 gofmt + 2 biome). All error-level, all in S98's OWN new files, all mechanical/safe; tsc clean for S98 (only pre-existing behavior-capture S77 err excluded).

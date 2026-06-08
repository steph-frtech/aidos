---
name: project-s96-deploy
description: S96 phase-keyed deploy pipeline verification — PURE re-projection deploy gated on stable phase
metadata:
  type: project
---

S96 = per-app PHASE-KEYED DEPLOY pipeline (EPIC10/DP26/ADR0043). PURE BuildPlan(Input)->DeployPlan, STOP-GATE FIRST: IsDeployable = phases.IsStable (S23) ∧ Gate{mutation≥threshold, 0 monster} else refuse PHASE_NOT_STABLE BEFORE any re-emission (fail-closed). Re-emits via preview.EmittedAppHash (S94)=re-projection property (deployed hash==phase emitted hash, never stale sandbox). Forward-only migration delegated to datamigrate.Build (S95) EXPAND→BACKFILL→CONTRACT; breaking-no-backfill→BREAKING_MIGRATION_NO_BACKFILL inherited. URL=d-+12alnum subdomain (DNS-safe, distinct from preview p-), `pulumi up`/`destroy`, content-addr id via records.Hash S02. DeployedMatchesPhase + MigrationIsForwardOnly = PURE comparisons code-judges.

DONE-CRIT 3 ALL RAN: Godog 5 scenarios (stable re-projected/forward-only migration/red-mirror refused/sub-threshold mutation refused/reproducible) + rapid 5 props (reproducible/re-projection/Stop-gate always refuses non-stable+emits no plan/content-addr sensitivity/forward-only holds) + fixture 12 cases (3 OK + 9 refusals incl PHASE_NOT_STABLE/BREAKING_MIGRATION_NO_BACKFILL delegated/OUT_OF_SCOPE). go test runtime/deploy+mcp/deploy+blockreason green; broad runtime/...+archive/phases prior-green intact.

New BlockReason CodePhaseNotStable='PHASE_NOT_STABLE' additive enum :363, registry :923 non-empty FR how_to_fix (make_the_phase_stable/recompute_the_phase/never_deploy_a_stale_artifact), codeOrder :980; blockreason property auto-covers via Codes(). reused-fns-real: phases.IsStable:100 + Version:176 + Reasons:74, preview.EmittedAppHash:203, datamigrate.Build:226 + Plan/PreservesAllData:156.

MCP aidos-deploy 4 PURE tools (plan/gate/check_served/forward_only) write-NOTHING wall-grep CLEAN (no INSERT/UPDATE/WriteFile/Exec). TS twin lib/deploy.ts vitest 6/6 digest=FNV-1a DISPLAY-ONLY (Go records.Hash authoritative) tsc clean-for-deploy biome clean 6 files. /deploy action-capable: project/phase inputs, withMigration+unstable toggles (proves PHASE_NOT_STABLE), deploy-url/emitted-app-hash/plan-id/boot/teardown + PROBE served-match badge + forward-only badge + migration steps. nav:156 WorkbenchHeader {href:/deploy,k:deploy} i18n fr4467==en4467 deploy ns 27==27. e2e deploy.spec 6/6 RAN live :3000.

docs 3-layer (Implémentation·Méta·Méta-méta) concept+internals s96-deploy.mdx, docs.json 2 refs, mint validate PASS, pushed steph-frtech/docs main HEAD==origin/main 19fff97 (not ahead).

OQ (by-design fwd-dep, NOT residual): OQ-S96-apply = real `pulumi up` against live target + rollback-by-re-projection = downstream/S98 effect (plan is driver-neutral content-addressed). Linear-server MCP unauthenticated (OAuth non-interactive) = best-effort §11. Mintlify CDN reindex async lag (pages pushed+validated).

ONE CORRECTION: gofmt -w deploy.go (var block error-name alignment ErrNoProject/ErrNoServer/... not padded) — RECURRING gofmt-on-touched. verified-green AFTER 1 gofmt fix.

---
name: s55-projectwall
description: S55 project-aware wall — two-layer defense-in-depth (Go hook + Postgres RLS keyed on identity) completing multi-tenant isolation; all 4 done-criteria mirror-proven
metadata:
  type: project
---

S55 = the project-aware wall, completing the multi-tenant isolation begun S53/S54 (app-builder EPIC 1). ORTHOGONAL to the S04 waterline wall: S04 answers "may the agent write this ZONE?" (kernel/mirrors/fitness→never); S55 answers "is this below-the-line write/read inside the CURRENT project scope?" → cross-tenant leak refused with AGENT_CROSS_PROJECT_WRITE.

**Two-layer defense-in-depth, reddens INDEPENDENTLY:**
- Layer 1 hook: `back/runtime/projectwall/projectwall.go` — pure total `Classify(Scope, Target)→Decision`, keyed on (identity, project). Predicate: allow iff scope non-zero AND effective-identity==scope.identity AND target.ProjectID==scope.ActiveProject. Empty target.ProjectID = not project-scoped → passes through (S04 governs zone). Fail-closed on zero scope.
- Layer 2 RLS: `back/migrations/project_rls_baseline.sql` — `app.in_active_scope(project_id)` keys on current_setting('app.project') AND current_setting('app.identity') (both via nullif(...,'') IS NOT NULL). FORCE RLS + FOR ALL policy (USING+WITH CHECK) on 9 ScopedTables; idempotent (DROP IF EXISTS+CREATE, skip-if-missing CONTINUE WHEN to_regclass IS NULL — same brain-schema fix as S54); re-asserts REVOKE kernel.truth/layer/link+mirrors.mirror; aidos owner BYPASSRLS.

**Done-criteria all mirror-proven:**
1. fault-injection hook+RLS independent: hook via property(7)+fixture; RLS via TestRLSFaultInjectionIndependent (drop policy+DISABLE RLS re-opens cross-project read — note: dropping ONLY policy on FORCE table DENIES all, the executor's 2nd bug found+fixed → must DISABLE too).
2. property ContextPack A has zero B nodes: TestProperty_ProjectIsolation over 4 sections + TestProperty_SingletonNoFence (backward-compat). crossProject fence = FIRST rule in all 5 router.go loops (Layer×2, Mirror, Contract, Memory). crossProject(g,n)=g!=""&&n!=""&&g!=n (singleton/__system__ seed unfenced).
3. fixture forged-identity refused by RLS: TestRLSForgedIdentityRefused (app.project set, app.identity UNSET→0 rows) + hook twin TestForgedIdentityDenied.
4. routeur=algorithme: Compile pure total fn, crossProject pure predicate, reproducibility pinned.

**Sensors:** gofmt/vet/build clean; Go runtime+kernel tests GREEN (prior intact); RLS Testcontainers 6/6 RAN green 14.3s; TS twin lib/projectWall.ts byte-faithful, vitest 9/9, tsc clean; e2e 5/5 :3000 (route 200, presets same/cross/forged each click→Classify via Server Action, ui-completeness); i18n 3296==3296 projectWall ns both; docs e42a4b3 HEAD==origin/main 3 layers registered docs.json.

**SCAR (pre-existing, NOT S55):** biome WorkbenchHeader.tsx:280 useKeyWithClickEvents suppression warning = commit 295112eb (2026-06-03 nav-drawer), NOT c0bb9b9 (S55). Same scar as S54 (was :279). S55 only added a nav entry.

**OQ (forward-dep, non-blocking §6):** app.identity placeholder until S61 (real OAuth/OIDC); live MCP/gateway path=S58; identity-to-membership match=S62; Linear MCP unauth (best-effort).

verified-green, ZERO corrections.

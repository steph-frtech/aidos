---
name: project-s112-kernel-garden
description: S112 verification — per-project KernelDebt gardening + /trim (KRD §82.4), PURE COMPOSITION extending S41 debt + S51 economics; verified green after 1 cosmetic biome fix
metadata:
  type: project
---

S112 « jardinage du KernelDebt + /trim par projet » (KRD §82.4) — VERIFIED PASS.

**What it is:** NEW pure read-only pkg `back/runtime/debt/garden` (CLAUDE.md §9 anti-overwrite: CONSUMES S41 `debt.Scan` + S51 `economics.Evaluate` untouched/authoritative, never re-derives). `Tend(ProjectSnapshot, now)` surfaces FIVE rots: 3 CONSUMED from S41 (orphan_mirror/stale_fixture/surviving_mutant) + 2 §82.4 adds — `dead_liveness` (mirror LivenessDead still pinning a LIVE truth = dead proof, DISTINCT from orphan which reflects nothing live; counts only dead-on-live so each rot under exactly one kind) + `low_value_constraint` (cell over_budget_flagged from economics.Evaluate, never re-derives §66.3). Project-scoped (every GardenItem tagged ProjectRef, no cross-project leak). SuggestGardenTrim → 1 open_idea_* per item (Requires==TheDoor "idea → mirror → /goal → human approval"). AcceptProposal → OpenIdea{OpensIdea:true, Deletes:false}. Writes NOTHING.

**Reused symbols verified-exist:** debt.Scan/Snapshot/TruthRow/MirrorRow/MutationRow/Kind* ; mrec.LivenessDead:122/LayerRef.LayerID ; economics.Evaluate:228/VerdictOverBudgetFlagged:118/HarnessCostBudget/MeasuredCost/ValueCase/OverAxes ; krec.Canonicalize+Hash (content-addr id reused S01/S02).

**Done-crit PROVEN:** (1) /trim never auto-deletes — AcceptProposal Deletes:false, fixture+property+e2e pin it. (2) accept opens idea→mirror→/goal — Door==TheDoor surfaced in panel. (3) UI to triage debt — /kernel-garden ranks 5 rots by severity, project-scoped.

**Sensors:** gofmt CLEAN (no fix needed this time), go vet clean, go test garden+mcp 0.07s + prior-green debt/economics intact, broad `go build ./...` exit0. Wall-grep CLEAN (all INSERT/Delete hits = assertions/comments/`Deletes:false`). MCP aidos-kernel-garden 3 PURE tools (tend/suggest/accept) main_test 6 green, fixedNow const keeps tools pure. TS twin lib/kernel-garden reuses lib/economics evaluate (display-only synthetic id project:kind:target NOT Go-hash, fine — panel renders) vitest 7/7, tsc clean. Panel useActionState 3 controls (project-select + tend-submit + per-item accept-submit) testids match e2e, suggestOnly text contains "ne supprime rien"/"deletes nothing", opensIdea "OUVRE UNE IDÉE"/neverDeletes "NE SUPPRIME JAMAIS" match e2e regexes. i18n fr4928==en4928, kernelGarden 25==25, nav:188 additive. Playwright 4/4 live:3000 route-200.

**Docs:** 3-layer internals (Impl:9/Méta:49/Méta-méta:57) + concept, docs.json:291-292, mint validate PASS, HEAD f342055==origin/main.

**Correction applied:** 1 cosmetic — biome formatter line-width wrap on tests/e2e/kernel-garden.spec.ts (scoped-project toHaveText wrapped to 3 lines). RECURRING biome-format scar — biome check --write fixes mechanically, non-blocking. ZERO logic corrections.

**OQ (by-design, non-blocking):** Linear MCP unauth (OAuth+restart needed) — S112 issue not moved programmatically; Mintlify search-index reindex lag (pages committed/pushed/registered/validate-clean). Recorded snapshot persistence rides fitness.kernel_debt_snapshot (SELECT-only, written by CLI via ChangeSet S20) — forward-dep.

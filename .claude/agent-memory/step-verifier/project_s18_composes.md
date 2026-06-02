---
name: s18-composes
description: S18 composes (7th link) recursive aggregate — parent GREEN iff own mirror ∧ all children green; pure Go core + TS port; verified-green
metadata:
  type: project
---

S18 — `composes`, the 7th KRD §108 link (mereology: whole contains part, version-pinned + weighted load-bearing|cosmetic), making the completeness law RECURSIVE (§109).

- `back/kernel/composes/composes.go`: pure `Aggregate(tree, root) → Result{Verdict, DrillDown}` — GREEN ⟺ own_mirror==GREEN ∧ ∀ child via composes: Aggregate(child)==GREEN. CONSUMES S06 own_mirror (never re-derives). Total on DAG, deterministic, cycle → typed `*CycleError`. `Activation`/`ReopensOnChange` for §112 weighted threshold (the signal S19 consumes). `SerializeComposesBody` reuses S02 records hash.
- Mirrors: fixture (5 rows) + rapid property (law-at-every-node, monotone reddening, cosmetic isolation, totality, cycle) + Gherkin journey. TS port `front/web/lib/truth-tree.ts` + fast-check vitest (9/9). Done criterion = red load-bearing child reddens parent + drill-down names it (fixture row 2 + property + Playwright).
- Migration `kernel_composes_baseline.sql`: expand-only — NEW `kernel.layer_activation` (declared threshold, CHECK ≥0) + read-only VIEW `kernel.composes_edge` (weight from kernel.link JSONB body, no ALTER). Wall proven by 4 Testcontainers tests (round-trip, threshold table, expand-only-prior-untouched, agent-role-select-only).
- UI `/truth-tree`: read-only (truth-writes via propose→ChangeSet) so ui-completeness vacuous; scenario toggle all-green/red-control/cosmetic; Playwright 6/6.
- OpenQuestions (by-design forward deps, non-blocking): two prior-contract ChangeSets (S06 flat→recursive, S12 Stop input) DRAFT until S20 ChangeSet engine + S21 SemanticDiff; no truth-tree MCP fetch yet; full §112 weighted propagation is S19.

VERIFIER FIX: the four `truthTree.scenario*` i18n keys (scenarioHeading/AllGreen/RedControl/Cosmetic) were missing from messages/{fr,en}.json while page.tsx called them via t() → next-intl errors on missing key. Added FR/EN. See [[feedback-i18n-keys-missing]].

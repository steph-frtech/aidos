---
name: s18-composes-aggregate
description: S18 composes — 7th KRD link, recursive compositional-truth aggregate; verified green
metadata:
  type: project
---

S18 composes = SEVENTH KRD §108 link (mereology whole-contains-part, version-pinned + WEIGHTED load-bearing|cosmetic). PURE Aggregate(Tree,rootID)→Result GREEN⟺own_mirror(L)==GREEN ∧ ∀child:Aggregate(child)==GREEN (THE done criterion: red load-bearing child reddens parent + drill-down §110 names it). §112 weighted/thresholded Activation Σweight(changed children) + ReopensOnChange (cosmetic 0.0 below threshold doesn't reopen) — INDEPENDENT of §109 verdict. CONSUMES S06 own_mirror (never re-derives), generalizes S06 flat→recursive, feeds S12 Stop + S19 propagation (additive, no in-place rewrite). Cycle guard→typed *CycleError (no infinite recursion). Absent node→RED (dangling unprovable, mirrors S17). PURE no DB/clock/rng.

Migration kernel_composes_baseline.sql EXPAND-ONLY: weight rides INSIDE existing S17 kernel.link JSONB body (no ALTER, matches S17), activation_threshold in NEW append-only side table kernel.layer_activation (not ALTER kernel.layer), READ-ONLY VIEW kernel.composes_edge over link bodies. GRANT SELECT + REVOKE INSERT/UPDATE/DELETE/TRUNCATE on layer_activation = wall; view inherits S17 link revokes (no separate revoke needed). SerializeComposesBody REUSES records.Hash content-addr id==version.

VERIFIED GREEN: gofmt clean, go vet clean, go test ./kernel/composes/... 9.287s GREEN (fixture Row1-5 + rapid 6 props TestLawHoldsAtEveryNode/StatusRange/MonotoneReddening/CosmeticIsolation/ActivationCosmeticZero/CycleTypedError + Testcontainers roundtrip + activation table + expand-only + AgentRoleSelectOnly INSERT permission-denied). Full go build ./... rc0 (prior green intact). Front lib/truth-tree.ts byte-faithful twin (same §109/§112) vitest 9/9 (fast-check law+monotone+cosmetic+cycle+4 fixture rows), tsc rc0, biome clean 5 files. /truth-tree READ-ONLY ui-completeness VACUOUS (truth-write via ChangeSet, scenario toggle writes no truth) — §114 chain product→journey→view→control+cosmetic helptext (5 nodes), testids tree-node/edge-weight/root-aggregate/root-verdict/drill-step/tutorial/example, nav:104. e2e truth-tree.spec.ts 6 scenarios incl done-criterion (red-control→RED+drill names checkout-button). i18n 3441==3441 truthTree 28==28. Docs concept+internals 3 layers (Implémentation·Méta·Méta-méta) docs.json:105-106 mint validate PASSED clone 0-ahead pushed clean.

OQ by-design: cosmetic/load-bearing seed weights+threshold EXAMPLE-only (KRD §114 shape, real ones human-declared above line); no truth-tree MCP fetch yet (panel renders §114 seed)=deferred; mirrors Postgres persist=S06 (fixture materialized valid pre-S06); Linear-unauth. verified-green ZERO corrections.

---
name: fk05-proof-type
description: §FK05 verification — N0-N5→E0-E7 evidence mapping (expand half of FKE-16 migration), pure declared table, double-étiquetage additif, added types E4/E6/E7 gated; verified-green after 1 biome unused-import fix
metadata:
  type: project
---

§FK05 (after FK01-FK04, FKE-piste) the EXPAND half of the E0-E7 evidence migration (KRD FKE-16 "remplacer test par evidence", expand-contract; contract/schema-switch is FK16 post-S117 = by-design forward-dep OQ). back/kernel/mirror/prooftype PURE write-NOTHING.

**Core**: N0-N5 (V-slices Livre IV §14) → E0-E7 evidence ladder. MapNToE CLOSED DECLARED table (N0/N2/N3→E3, N1→E5, N4→E1,E2, N5→E3,E4), PURE/TOTAL (unknown N→empty set not panic), DETERMINISTIC sorted-ascending fresh-copy. FacetEvidence facet→ADDED-E table: S→E4(sécurité gosec/gitleaks), R→E6(runtime/rollback), V→E6, I→E5, B→E5, M→E1; F adds nothing (its evidence IS base mapping), X SOFT §13.6 adds NO hard E (absent from facetToE by design). ContractFor=UNION(MapNToE ∪ ΣfacetEvidence ∪ E7-iff-RequiresFormal) sorted/dedup/order-independent iterates facets.Facets() canonical order. Tag=double-étiquetage additif {N preserved verbatim, E derived contract} — E is CACHE proven by ContractFor like truthlevel stored_level parity.

**3 done-crit PROVEN**: (1) property même miroir→même E mapping total (rapid inv1 total&deterministic&sorted + inv2 order-independent + fast-check twin); (2) evidence E-typée affichée (fixture Case 8 N4+S+R→{E1,E2,E4,E6} exact + UI contract section FromN/FromFacets/Required + e2e N4→E1,E2 displayed); (3) zéro miroir N existant modifié (Tag copies N verbatim, fixture Case 7 + property inv3 ∀ Tag.N==in.N). Added-types gated property inv4: E4⇔S, E6⇔(R∨V), E7⇔RequiresFormal exact-iff.

**Verified**: facets symbols ALL exist (FacetSecurity/Reliability/Invariants/Budgets/Evolvability/Maintainability/Experience/Functional + Facets()). gofmt CLEAN vet clean go test prooftype+mcp green. PROPERTY robust -count=2 -rapid.checks=3000 0.089s (RUN FROM PKG DIR — from back/ `.` mis-parses no-Go-files-FAIL, recurring scar). broad build ./... exit0 prior-green facets/grid intact (NOTE grid is at kernel/grid NOT kernel/mirror/grid). WALL grep CLEAN no INSERT/Exec/pgx/db/GRANT. MCP aidos-prooftype 2 PURE read-only tools (map_n_to_e/tag) main_test 6/6.

**TS twin** lib/prooftype reuses grid FacetLetter, Go-authoritative, vitest 5/5 fast-check reproducibility. tsc only 1 PRE-EXISTING behavior-capture.test:101 'Kind' (S64-S77, NOT FK05). panel /proof-type useActionState TAG-THE-KERNEL writesTruth-absent (pure derivation read-only correct) testids match e2e (n-level/tag-submit/facet-S/formal-toggle/preserved-n[data-n]/from-n/from-facets/required/e-N). i18n fr5166==en5166 proofType 23==23 title "L'expand E0-E7"/"The E0-E7 expand" matches e2e h1 regex nav:202. Playwright 4/4 RAN GREEN live:3000 route-200.

**Docs** concept(81L 8 sections)+internals(3-layer Implémentation:9/Méta:40/Méta-méta:48) docs.json:463-464 mint-validate PASS HEAD e843b7f==origin/main SYNCED.

OQ by-design: schema-switch FK16-post-S117 / Linear-unauth(only mintlify MCP resolved) / mintlify-hosted-reindex-lag.

CORRECTION applied: removed unused `contractFor` import from app/proof-type/actions.ts (biome unused-import warning — only tag+mapNToE used). After fix biome clean. RECURRING note: executor copy-imports the whole twin surface into actions.ts, leaving unused symbols → biome flags. verified-green AFTER 1 biome import fix.

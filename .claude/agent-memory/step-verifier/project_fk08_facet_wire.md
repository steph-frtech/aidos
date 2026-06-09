---
name: fk08-facet-wire
description: §FK08 verification — WireColumn/WireSkeleton wires the 5 non-functional facets S/R/V/M/X as parallel 6-pair skeleton columns, each reusing an existing sensor, judged by FK07 docmirror-style structural set-comparison
metadata:
  type: project
---

§FK08 (after FK07, FKE-1.3 — les 6 tables de facettes) WIRES the 5 NON-FUNCTIONAL facets S/R/V/M/X as PARALLEL COLUMNS of the SAME 6-pair skeleton (rungs 1-spec/2-behaviour/3-scenarios/4-model/5-contract/6-evidence), each reusing a NAMED existing sensor (ADR0007, no new judge). back/kernel/mirror/facetwire PURE write-NOTHING.

**What it is:** facetSensor closed map S→gv-gosec-gitleaks-policy / R→chaos-failover-restore-breaker-outbox / V→migrate-expand-contract-backfill-restore / M→arch-fitness-go-arch-lint-depguard / X→experience-claim. F handled by docmirror(FK07), I by invariant plane — NOT FK08 columns. WireColumn = SAME docmirror structural set-comparison: per rung Declared∧!Proven→PairBroken / !Declared∧Proven→PairUndeclared, sortDivergences(rung-rank,kind), last-wins on dup rungs (total). HARD facet(S/R/V/M) Verdict red iff len(divs)>0; SOFT X(IsSoft) runs IDENTICAL comparison but divs→Advisories, Verdict ALWAYS green (§13.6 informs never clicks ratchet hard, §13.4 over-constraint forbidden). WireSkeleton judges all 5 in NonFunctionalColumns octuor order, overall red iff any HARD column red (X excluded), content-addr Bytes=records.Canonicalize(json sans Bytes/Hash) Hash=records.Hash. Unknown/non-FK08 facet→green no sensor.

**Done-crit ALL PROVEN:** (1) par facette fault-injection — TestColumn_BreakPairRedensThatColumn loops S/R/V/M break-evidence→RED+pair_broken-on-right-rung+NOT-advisory; orthogonality TestSkeleton_BreakOneColumnLeavesOthersGreen break-S-contract→S red others green (FKE-1.4). (2) X reste advisory — TestColumn_XStaysAdvisory break-X→green+advisory surfaced + skeleton-only-X-broken stays green; property TestProp_XNeverBlocks ∀ rung states→X green+0 hard divs. (3) property chaque facette=6-paires sous son angle — TestProp_WireColumn_Deterministic + InvariantUnderReordering(shuffle) + SkeletonHash_Deterministic(reverse cols→byte-id hash) + OneSidedStructuralIsAlwaysRedForHard. Plus fixture ProvenButUndeclared structural / EachFacetReusesAnExistingSensor / Empty-green.

**Sensors:** gofmt CLEAN vet clean go test facetwire green PROPERTY -count=2 -rapid.checks=3000 0.342s; broad build ./... exit0; prior-green derivedoc(runtime/generators/derivedoc + mcp/derivedoc)/docmirror/facetcomplete/facets intact; WALL grep CLEAN (no INSERT/UPDATE/DELETE/Exec/pgx/sql.Open/GRANT). MCP aidos-facet-wire 2 PURE tools facet_wire+facet_skeleton write-nothing, main_test 6/6 incl TestMCPServer_Registers.

**TS twin** front/web/lib/facetwire.ts Go-authoritative mirrors-faithfully (wireColumn/wireSkeleton/sortDivergences/isSoft identical); vitest 5/5 — twin CARRIES OWN fast-check property (same-input→same-verdict + reverse-invariant + X-never-blocks) so NO unused-fc-import (FK07 RECURRING already handled by executor here). tsc clean (0 facetwire errors). biome clean 7 files. i18n fr5231==en5231 facetWire 22==22 nav facetWireNav both langs (Câbler les facettes / Wire the facets). WorkbenchHeader:205 nav wired.

**UI** /facet-wire action-capable useActionState CÂBLER bound to wireSkeleton twin, writesTruth ABSENT (pure read-only projection CORRECT — report below waterline, no propose→ChangeSet needed). fixtures.ts SEPARATE module (use-server exports only async actions) 4 scenarios aligned/break-security/break-reliability/break-experience. testids scenario-select/wire-submit/report/verdict-badge/determinism-badge/column(data-facet/data-verdict/data-soft)/column-verdict/divergence(data-rung/data-kind/data-advisory) ALL match e2e. h1 t("title") matches regex /câbler les facettes|wire.*facets/i. next route ƒ. Playwright 4/4 RAN GREEN live:3000 7.5s incl S-fault-injection-orthogonality + X-advisory.

**Docs** 3-layer Implémentation:9/Méta:27/Méta-méta:39 docs.json:469-470 mint validate PASS HEAD e11a8e8==origin/main pushed steph-frtech/docs main.

**OQ by-design:** Linear-unauth (only authenticate/complete surfaced — file FK08 issue when OAuth restored); Mintlify search index re-crawl lag (pages live+validated); Declared(FK02 facet-set)↔Proven(living sensor verdicts) real kernel-join wiring owned by FK09 conscience aggregator (FK08 supplies per-facet aggregable verdict shape).

**Verdict: verified-green ZERO corrections.** Executor handled the FK07-RECURRING twin-property pattern itself (twin carries own fast-check, no unused import). Clean step.

---
name: project-fk03-grid
description: FK03 the grille — niveau×facette two-axes (FKE-1.4) — verified-green ZERO corrections
metadata:
  type: project
---

§FK03 the GRILLE (FKE-1.4 two axes, after FK02 facets/FK01 truth-level) — every truth carries TWO coordinates and resolves to ONE deterministic Cell. back/kernel/grid PURE write-NOTHING.

**Two axes:** VERTICALE = Rung (7 §23 source rungs product→journey→view→control→action→operation→entity, the LATERAL/COUPLING axis) REUSES besoin Level order VERBATIM (rungOrder mirrors besoin.Level top-down, verified order matches spec.go:37-74 — one ladder, anti-overwrite §9) × FACETTE = facets.Facet (FK02 octuor F/I/S/B/R/V/M/X, the ORTHOGONAL/SEPARATING axis).

**Three laws = 3 done-criteria PROVEN:**
- LAW 1 Resolve(rung,facet)→Cell PURE TOTAL deterministic content-addressed (Cell.Hash SHA-256 of `<rung>:<facet>` JSON), refuses out-of-ladder rung (ErrUnknownRung) / out-of-octuor facet (ErrUnknownFacet); transversal bands (invariant/policy) REFUSED as rungs — an invariant is the I FACET of a source rung, NOT a rung (keeps grid clean 7×8).
- LAW 2 MarkStale(changed)→source rungs strictly ABOVE (smaller depth, top-down), NEVER the changed rung, NEVER below, NEVER a band; product(summit)→empty; AffectedCells holds facet CONSTANT across StaleCells (verticale couples upward, facet held).
- LAW 3 facet orthogonality: AffectedCells UntouchedFacets = the 7 OTHER facets; Project(truths,facet) re-reads ONE column independently → byte-identical under any foreign-facet change (the facets do not interact).

**Verification (ZERO corrections, verified-green):** gofmt -l CLEAN, vet clean, go test grid+mcp green; PROPERTY ROBUST -count=2 -rapid.checks=3000 0.427s (5 invariants: Resolve deterministic+injective; MarkStale exactly-above top-down; AffectedCells facet-constant+others-untouched; Project invariant under foreign-facet; Build deterministic); fixture 12 done-criteria cases; broad-build ./... exit0; prior-green facets+besoin intact; WALL grep CLEAN (no INSERT/UPDATE/Exec/pgx/db — grid writes nothing). MCP back/mcp/grid (aidos-grid) 4 PURE read-only tools (resolve/mark/affected/rungs) pure pass-through, no LLM/http/db (only comment hit), main_test 6/6. TS twin lib/grid.ts matches Go semantics (cellHash display-string `rung×facet`, Go SHA-256 authoritative) vitest 7/7 fast-check reproducibility; tsc clean (only PRE-EXISTING behavior-capture.test.ts 'Kind' S64-S77 unrelated); biome 6 files clean. Panel /grid useActionState RESOLVE&MARK control writesTruth=false, testids match e2e (rung-select/facet-select/resolve-submit/resolved-cell/stale-{rung} data-facet/untouched-{letter}/stale-empty); i18n grid ns fr27==en27 nested rung(7)+facet(8) keys present; nav:200 /grid link; Playwright 4/4 live:3000 (LAW1+2 entity×S marks 6 above facet-held; LAW3 7 others untouched; product marks nothing). Docs 3-layer (Implémentation:9/Méta:31/Méta-méta:41) docs.json:459-460 mint validate PASS HEAD 823fe74==origin/main SYNCED.

OQ (non-blocking by-design): ContextRouter S33 scope-by-cell wiring belongs to router step (forward-dep); Linear MCP unauth (only GitHub+Mintlify surfaced).

---
name: s100-cell-federation
description: S100 cell (bounded-context federation) verification — pure Partition/CellPack/CheckCrossCellAccess/Ships, verified green zero corrections
metadata:
  type: project
---

S100 = cell = bounded-context FEDERATION primitive (app-builder EPIC 11, KRD §43–§51). PURE total functions in back/kernel/cell/cell.go: Partition (split project Kernel by bounded_context, unassigned node→ErrUnassignedNode), CellPack (per-cell frontier = own layers/mirrors/contracts + ONLY contracted neighbors' PUBLIC contracts, all else Excluded tagged neighbor-internal|no-contract), CheckCrossCellAccess (CROSS_CELL_NO_CONTRACT unless from==to or HONORED contracts_with link), Ships/ShippableCells (§43 fractal: green cell ships despite red sibling). content-addr via records.Hash(Canonicalize) reused from S02. Writes NOTHING (the wall) — Context-Map persists via ChangeSet at S101 (by-design fwd-dep).

OPEN-QUESTION E11 RESOLVED in code: cell = FIRST-RANK partition reusing bounded_context (S33/S55 ContextGraph nodes + S48 globalinvariant.CellRef), NOT a 6th TruthScope dimension. Documented in cell.go pkg doc + both mdx.

DONE-CRITERIA (both halves, RAN): (1) CellPack excludes neighbor internals — PackHasNeighborInternal always false; fixture TestCheckoutPackExcludesBillingInternals (checkout pack carries ck-* + bl-pact, excludes bl-op/bl-mir + cat-pact); rapid TestCellPackExcludesNeighborInternals. (2) cross-cell access without contract refused — fixture TestCrossCellRefusedWithoutContract (checkout→catalog refused, checkout→billing allowed, own-cell allowed, un-honored contract→closed door); rapid TestCrossCellAccessGate. Plus repro + fractal-shipping props.

VERIFIED GREEN, ZERO corrections. go test cell+mcp ok, vet/gofmt clean, broad go build ./... ok, records+cell prior-green intact. MCP back/mcp/cell 4 PURE tools (partition/cell_pack/check_access/shippable) write nothing, wall-grep CLEAN. TS twin lib/cell-federation matches Go authoritative (no byte-hash in twin — Go records.Hash authoritative), vitest 6/6, tsc clean for cell-federation (only PRE-EXISTING behavior-capture.test.ts S-prior error, NOT S100). biome 2 WARN = RECURRING idiomatic-twin noNonNullAssertion (n!.cell in test) non-blocking. Route /cell-federation action-capable: 3 controls (partition+ship / cell pack / check access) bound to pure twin via useActionState Server Actions, wall-respected (projects+checks, Context-Map via ChangeSet S101). nav entry WorkbenchHeader:159 {href:/cell-federation,k:cellFederation}. i18n fr4567==en4567 EXACT structural parity. h1=t("title")="Cellules : la grande app..." matches e2e /Cellules|Cells/. Playwright e2e 5/5 covers both done-criteria + fractal + allowed/refused. Docs: concept+internals s100-cell-federation.mdx, internals has 3 layers Implémentation/Méta/Méta-méta, docs.json:267-268 registered, .aidos-docs HEAD f9bf2a6 == origin/main (0/0 ahead/behind, pushed).

OQ (by-design, non-blocking): Context-Map persist + Pact-verified contract pairs = S101 (fwd-dep); Linear MCP unauth; mintlify hosted index re-crawl lag.

PATTERN confirmed: pure-kernel-primitive step reusing S02 records.Hash + bounded_context identity space — verify the named done-criterion mirrors RAN, twin reproduces Go (not byte-pinned), wall-grep CLEAN on kernel+mcp, biome noNonNullAssertion on twins is WARN-not-error.

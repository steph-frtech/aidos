---
name: s102-arch-fitness
description: S102 verification — STRUCTURAL RATCHET (second cliquet §47) over inter-cell dep graph; reuses S100 wall + S02 hash; verified green ZERO corrections
metadata:
  type: project
---

S102 = the STRUCTURAL RATCHET ("le second cliquet", KRD §47, app-builder EPIC 11) — ORTHOGONAL to S05's behavioural ratchet. Prevents "tests verts, système pourri". PURE total fns in back/kernel/mirror/archfitness/archfitness.go.

**Done-criterion (the fault-injection):** a NEW boundary violation OR a NEW inter-cell cycle reddens the structural ratchet (BROKEN + STRUCTURAL_REGRESSION BlockReason) and BLOCKS THE CUT, INDEPENDENT of (green) behavioural mirrors.

**What verified green, ZERO corrections:**
- Measure(DepGraph)→StructuralMetric: 4 "lower-is-better" metrics — BoundaryViolations (cell.CheckCrossCellAccess S100 wall LIFTED per cross-cell edge, ONE wall not a 2nd gate), InterCellCycles (Tarjan SCC over cell-level digraph, sorted/deterministic), InterBCEdges (dedup distinct cross-cell edges), MaxCellComplexity (max cell node count) + concrete witnesses. Hash = records.Hash(Canonicalize) REUSED not forked. PURE.
- Ratchet(baseline,candidate)→RatchetVerdict: HELD iff EVERY metric non-increasing component-wise, else BROKEN naming each MetricClimb. Reflexive. Done-criterion at the gate.
- Propose(g,baseline,label,parent)→changeset.Open DRAFT (spec delta=metric, mirror delta=Ratchet verdict) — writes NOTHING (the wall). changeset.Open(label,parentPhase,spec,mirror) sig confirmed; SpecDelta+MirrorDelta both set.
- Mirrors RAN: fixture 9 (clean cut / boundary-violation witness / Tarjan 2-cell cycle [billing checkout] / held-improve / 3 BROKEN-blocks: new-violation+new-cycle+complexity-growth / DRAFT envelope). property rapid 4 (Measure reproducible same-input→same-metric+hash / Ratchet monotone HELD-iff-non-increasing / reflexive / BoundaryViolationsMatchWall = no fabricated/missed witness, count==len). go test archfitness+mcp ok; go build ./... clean; vet/gofmt clean.
- Prior-green INTACT: cell/changeset/records/contextmap go test ok.
- Wall grep CLEAN (no exec/os/WriteFile/sql/pgx) in pkg + MCP.
- MCP back/mcp/arch-fitness: 4 PURE tools measure/ratchet/gate/propose write NOTHING. main_test TestGateTool_NewViolationBlocksCut proves a new uncontracted edge → BROKEN blocks cut. go test ok.
- TS twin lib/arch-fitness.ts: verbatim Tarjan + measure/ratchet/propose, Go authoritative (twin display-only). vitest 9/9. tsc clean (no arch-fitness errors). biome clean 6 files.
- /arch-fitness action-capable: 4 controls (measure/ratchet/gate-with-violation|cycle|clean selector/propose) bound to pure twin via useActionState Server Actions. Wall respected (propose returns DRAFT, no direct truth write). Panel renders all e2e testids (measure-submit/ratchet-submit/gate-submit/propose-submit/gate-scenario/ratchet-verdict data-state+data-code/metric-* data-value/climb-*/proposed-changeset data-status/proposed-target). h1=t("title")="Cliquet structurel : tenir ou s'améliorer" matches e2e /ratchet|cliquet/i. nav:161 {href:/arch-fitness,k:archFitness}. i18n fr4631==en4631 EXACT, archFitness 33==33. Playwright e2e 7/7 covering done-criterion (violation+cycle BROKEN+blocks) + clean HELD + DRAFT.
- WorkbenchHeader diff = ONLY the one nav-entry add (additive, no existing route touched).
- Docs: concept+internals s102-arch-fitness.mdx, internals has 3 layers Implémentation:9/Méta:48/Méta-méta:56, docs.json:271-272 registered, mint validate PASS, .aidos-docs HEAD 9bf8dc0 == origin/main (0/0 ahead/behind, pushed).

**OQ (by-design, NON-blocking, NOT residual):** metric/verdict persist only as DRAFT ChangeSet envelope — wiring a structural-baseline projection into mirrors/dag + a CI hook running `gate` on every cut = later steps (changeset engine S20 path used). Linear MCP unauthenticated (§11 best-effort). Mintlify hosted search index re-crawl lag.

PATTERN (confirmed again): additive ratchet/measurement step over earlier partition — verify the NEW capability (structural metrics + monotone gate + propose) has its OWN mirrors AND REUSES the earlier wall (cell.CheckCrossCellAccess) lifted to the whole edge set rather than forking a 2nd gate. Twin reproduces Go verbatim but Go is authoritative (no byte-hash assertion in twin).

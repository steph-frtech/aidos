---
name: fn05-callgraph-index
description: FN05 call-graph index of emitted Go — pure AST walk, content-addressed, + AffectedSubgraph dependents-closure the ContextRouter consumes; verified-green.
metadata:
  type: project
---

FN05 adds `agentloop.CallGraphIndex(filename, src) → CallGraph{Package, Nodes []CallNode{Name,Calls}, Hash}` in back/runtime/agentloop/callgraphindex.go — a PURE/TOTAL AST walk over one emitted Go file, reusing FN04's closed intra-file node set (same graph as `firstCallCycleNode`). Content-addressed via `records.Hash(records.Canonicalize(...))` (S01/S02 scheme). `AffectedSubgraph(index, changed)` is the ContextRouter (S33) selector: dependents-closure over reversed edges; terminates because FN04 guarantees acyclic. Out-of-scope (no AIDOS marker) or unparseable → empty index (fail-closed).

**Why:** done criterion = miroir property "même code → même graphe (→ même hash)" ∧ router can consume the index to target the affected sub-graph. Both halves proven: `TestCallGraphIndex_Reproducible` + `TestAffectedSubgraph_*`.

**How to apply (verifying FN0x emitted-code steps):**
- Front twin in lib/emitters.ts (`callGraphIndex`/`affectedSubgraph`) is a LINE-BASED scan, not a Go AST walk, and uses a hand-built JSON.stringify + plain sha256 — so the TS hash is NOT byte-equal to the Go `records.Hash`. This is fine: done criterion is per-plane reproducibility, NOT Go↔TS hash equality. Don't flag the hash divergence as a gap unless a test asserts cross-plane byte-equality (it doesn't).
- The /emitters go-sqlc artifact is a function-free struct → 0 call nodes; the e2e only asserts `data-callgraph-nodes` matches `\d+`. The ripple (c→{a,b,c}) is proven by the Go/TS fixtures, not the UI. ui-completeness still holds (control reachable + executable, renders content-addressed index).
- MCP `agentloop_callgraph_index` registered in mcp/agentloop/main.go (ADR 0009, read-only).
- Wall: only `kernel/records` ref is `Hash`/`Canonicalize` (pure helpers, no DB write).
- OQs (non-blocking): OQ-FN05-cross-file (index intra-file, aligned w/ FN04 closed node set), OQ-FN05-router-wire (S33 ContextPack wiring deferred), OQ-FN05-linear (linear MCP OAuth not completable headless).

Run Go from back/ : `go test ./runtime/agentloop/ ./mcp/agentloop/`. See [[ba19-agentloop]] [[fn04-archfitness]].

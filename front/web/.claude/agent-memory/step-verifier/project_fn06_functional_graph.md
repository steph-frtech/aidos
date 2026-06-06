---
name: fn06-functional-graph
description: FN06 — layoutCallGraph pure SVG layout of the FN05 call-graph index; /emitters VISUALISE + HIGHLIGHT; static emitted-checkout sample; verified-green.
metadata:
  type: project
---

FN06 ships `layoutCallGraph(graph, affected) -> LaidOutGraph{nodes,edges,width,height}` in front/web/lib/emitters.ts — a PURE/TOTAL deterministic layout of the FN05 `callGraphIndex` (reuses it, no re-parse → shares the FN05 content hash). Node y = depth (longest call-chain to a leaf, callers on top), columns sorted, one edge per (fn→callee), each node flagged affected (= ContextRouter S33 `affectedSubgraph` selection). Empty index → empty canvas, never throws.

`/emitters` gains a "Graphe fonctionnel de l'app émise" section: VISUALISE (visualise-graph) draws the themed SVG (functional-graph-svg with data-graph-hash/-nodes/-edges; graph-node-<name> rects + graph-edge-<from>-<to> arrowed lines), HIGHLIGHT (visualise-graph-affected) marks the affected sub-graph (data-affected).

Sample `EMITTED_FUNCTIONAL_GO` (checkout slice priceLine/applyDiscount/total) in emitters-data.ts is a static byte literal so the graph is meaningful (entity projections have 0 funcs). Sorted nodes: applyDiscount, priceLine, total → first=applyDiscount; its dependents = {total}; e2e asserts applyDiscount+total affected, priceLine not.

**Why:** determinism-first — layout is authoritative code (no clock/rng/DOM-measure/LLM), pinned by a fast-check reproducibility property (same graph+affected → byte-identical layout). Wall intact: below-the-line read of gen/-derived index, writes no truth.

**How to apply:** run vitest from front/web (`npx vitest run lib/emitters.test.ts`); run Playwright from REPO ROOT `/data/dev/aidos` (config + webServer live there — from front/web it reports "No tests found"). Both green: 33 vitest, 8/8 emitters e2e. Linear MCP unauthenticated = OpenQuestion, not a blocker. See [[fn05-callgraph-index]] [[fn03-functional-emitter]] [[fn04-archfitness]].

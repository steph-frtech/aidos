---
name: wb2-07-dag
description: §WB2-07 verification — /v2/dag Version DAG screen (S24 §120-§125), twin lib/v2/version-dag.ts, React Flow, content-addressed append-only DAG
metadata:
  type: project
---

§WB2-07 (after WB2-06) /v2/dag = the VERSION DAG (S24, KRD §120-§125): version-space is a DAG not a line. NODES=versions (stable phases, id = content-addressed hash), EDGES=ChangeSets (S20). APPEND-ONLY: branch/checkoutAncestor/rebranch never delete a node/edge — the abandoned line v2 STAYS drawn (dimmed). Two bands by the waterline §124 (above=human truth, below=evolutionary).

TWIN lib/v2/version-dag.ts PURE/TOTAL: versionHash djb2 over canonical body (label + SORTED parents + stratum) → `v:`+8hex, parent ORDER doesn't change identity; validateDag 7 DagError (empty_node_id/duplicate_node_id/stratum_unknown/dangling_parent/dangling_edge/cycle/no_head); topoSort Kahn deterministic (parent before child, []  on cycle); hasCycle Kahn; ancestors/isReachable(irreflexive from===to→false)/heads; branch (append node head:true + edge, move head, idempotent same-body→same-id) / checkoutAncestor (head-flag move, NO edge touched) / rebranch (=branch off ancestor); syntheticDag canonical §120: v0→v1→v2 + branch w1 above + branch g1 below + rebranch v2a, HEAD on v1 (the narrative says checkout-ancestor v1 then rebranch — final state has v1 head with v2/w1/g1/v2a all parented on v1; NOT a bug, the comment describes the move-sequence that produced the state).

SCREEN page.tsx Server (next-intl getTranslations) → DagClient client React Flow (@xyflow/react, ADR 0053): nodes=versions (hash shown, head=ring primary, abandoned dimmed opacity-70), edges=ChangeSets labeled, deterministic position (x=topo rank ×190, y=stratum band above 40/below 240), pan/zoom (Controls + zoomOnScroll + panOnDrag), summary node-count/edge-count/head label, click node → read-only detail (hash/parents/stratum/reachableFromRoot). nodesDraggable=false nodesConnectable=false (wall: no truth-write from screen).

VERIFIED-GREEN ZERO corrections. vitest version-dag 8/8, lib/v2 71/71 (no regression), tsc EXIT0, biome 5 files clean, i18n v2Dag fr18==en18 fr-only/en-only=[] all 18 used keys present. WALL clean (grep no fetch/kernel/mirrors/fitness/POST/PUT/PATCH/DELETE — only a comment says "computés"). docs 2 pages 3-layer (Implémentation:9/Méta:30/Méta-méta:37) docs.json:503-504 mint validate PASS, docs HEAD df8152f==origin/main clean tree. determinism-first: twin authoritative pure no-LLM + reproducibility mirror (property: hash stable, deterministic same-seq→same-DAG).

BUILD/SSR: .next/server/app/v2/dag present, manifest /v2/dag/page, BUILD_ID newer than sources (current build). Temp server :3207 (started in subshell, self-exited — lsof no pid, prod :3000 stayed 200) served /v2/dag 200, SSR carries v2-dag-title/wall-note/canvas/summary(node-count=6 edge-count=5)/band-above/band-below/head; React Flow NODES (v2-dag-node-*) hydrate CLIENT-side (SAME WB2-04/05/06 React-Flow/Arborist scar — e2e needs live server). Coexistence /v2/dag + /v2/anatomie/k0 + /v2/grille + /v2 + / all 200.

NAV: /v2/dag is URL-reachable + screen-internal cross-links, NOT in a central nav config — SAME as sibling WB2-04/05/06 (grille/kernels/anatomie also have no central nav entry). The WB2 route family is per-concept, cross-linked. ui-completeness satisfied: screen is action-capable (pan/zoom + click-to-detail); step develops a read-only projection (no truth-write op → propose→ChangeSet N/A).

aidos repo: WB2-07 source files UNTRACKED/uncommitted (same as prior WB2 steps — workflow/user commits aidos code separately; docs repo pushed per mandate). NOT blocking — done-criteria need no aidos commit.

OQ by-design: (1) Linear MCP unauthenticated (only authenticate/complete exposed) — Sxx WB2-07 ticket not moved, OpenQuestion not residual; (2) syntheticDag SYNTHETIC until store serves live DAG (S59 cutover) — screen unchanged when data goes live; (3) Mintlify index lag ~2min post-push (content present on origin). Executor report accurate.

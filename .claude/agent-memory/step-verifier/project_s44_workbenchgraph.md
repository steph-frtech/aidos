---
name: s44-workbenchgraph
description: S44 full-graph cockpit — pure deterministic BuildGraph projection (Go+TS twin), read-only, deep-nav e2e; verified-green
metadata:
  type: project
---

S44 = the Workbench full navigable graph cockpit at `/` + the `/brain` cockpit.

- **Core:** `back/runtime/reality/workbenchgraph.BuildGraph(Head) -> (WorkbenchGraph, *BlockReason)` — pure, total, READ-ONLY projection of prior truth (controls S11, ops S10, entities S35, mirrors S06, scopes S15, incidents S22) into 8 node kinds (button→view→action→operation→entity→mirror→scope→incident) + edges (links S17 / propagation S19). Orders by (kind,id)/(from,relation,to); legend = exactly colors used (no orphan/missing); `graph_hash = records.Hash(records.Canonicalize(...))` reusing S02. Dangling edge / unknown route ⇒ S13 BlockReason (reuses `blockreason.For(CodeMissingMirror)`), never a panic.
- **TS twin:** `front/web/lib/workbench-graph.ts` — same contract; graph_hash is FNV-1a (NOT byte-identical to Go SHA-256 — by design, same-projection⇒same-hash). Page `app/page.tsx` (server comp) + `app/_graph/GraphCockpit.tsx` render it; `app/brain/page.tsx` is the read-only brain/context cockpit.
- **Mirrors:** fixture + rapid property test (determinism, no-dangling, legend-no-orphan, never-panics) + Vitest 8/8 + Playwright 10/10 (deep-nav clicks navigate, legend reflects truth, graph_hash stable on reload, visual snapshots for graph + /brain).
- **Verified-green:** Go test+vet+gofmt clean; tsc --noEmit clean; biome clean; e2e 10/10 against a FRESH `next build` + `next start --port 3100` (the long-lived :3000 server is stale — always rebuild+target 3100, see [[project_playwright_port_targeting]]). All home+brain i18n keys present in BOTH fr+en (incl. dynamic `kind_*`/`verdict_*`). Mint validate clean, docs pushed (7facc51 in origin/main).
- **OpenQuestions (not blockers):** (1) Testcontainers SELECT-only read adapter not yet wired — builder is pure over a Head value (the reality-pkg pattern), deferred substrate. (2) Linear S44→Done NOT performed — linear MCP/skill unavailable this session (only auth tools in deferred list); OpenQuestion per contract, not a fail.

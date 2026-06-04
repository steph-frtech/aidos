---
name: project-ba06-agentimpl-viewer
description: BA06 — MCP agentimpl capability door (agentimpl_project/list, read-only over mocked SELECT view) + selectable read-only /agents « Implémentation » viewer with determinism badge; verified-green
metadata:
  type: project
---

BA06 wires the BA03 emitter `agentimpl.Project` to (1) a **capability door** `back/mcp/agentimpl` (ADR 0009) exposing only TWO read-only tools — `agentimpl_project(layer_ref)->{impl,hash,found}` + `agentimpl_list` — over a deterministic mocked read-only view `exampleLayers()` (mirrors front fixture lib/agentlayer-data.ts verbatim, bdd-writer + executor), and (2) a selectable READ-ONLY `/agents` « Implémentation projetée » viewer (`ImplementationViewer` in AgentsPanel.tsx) with a green determinism badge (re-project ⇒ same hash via implContentHash).

- **Wall:** MCP server persists NOTHING above the line — Project is pure/total, regenerates on each call; unknown ref ⇒ Found:false (never fabricated, proven by TestWall_NoFabricationNoTruthWrite). No INSERT/UPDATE/DELETE/GRANT (only SELECT-view comments). Viewer has **0 buttons** (no run control — the loop is BA15+; confirmed by `viewer.getByRole("button")` toHaveCount(0)).
- **Determinism-first:** TestProject_Deterministic re-projects executor → same hash; front badge re-projects same layer client-side. ForbiddenPaths always = WallForbiddenPaths (kernel/mirrors/fitness); bdd-writer AllowedNetworkHosts empty ⇒ no egress by default.
- **Go mirrors (4) green:** project bdd-writer (model down, wall carried, no-egress, disabled changeset binding dropped), determinism, read-only list (2 layers), wall fault-injection. gofmt/vet clean; agentimpl+runtime/agentimpl+agentlayer+pretooluse(+wall) green.
- **Front:** tsc 0, vitest agentlayer 47/47, biome exit 0 (one PRE-EXISTING warning in lib/agentlayer.ts isKnownModel optional-chain nit — not BA06, not blocking). All 26 viewer* i18n keys present in BOTH fr+en; page.tsx wires every label.
- **e2e 21/21** (4 new BA06: viewer present/read-only/0-button; select agent → impl displays w/ kernel/mirror/fitness forbidden + aucun egress + idea-intake-not-changeset tools + prompt; determinism badge green; select executor → its egress host + go exec re-projected).
- **Docs:** concept + internals MDX (3 layers Impl/Méta/Méta-méta), both registered docs.json nav lines 183-184, mint validate passed, pushed steph-frtech/docs main 964a18f (HEAD==origin/main).

**STALE-PORT TRAP (re-confirmed, see [[project-playwright-port-targeting]]):** :3100 server returned **404** for /agents (stale build); :3000 served the full BA06 markup (impl-viewer + viewer-agent-select). e2e on :3100 = 21/21 FAIL, on :3000 = 21/21 PASS. ALWAYS curl `/route` per port for the step's testids before trusting an e2e fail — the port that 200s the new markup is the one to target.

OpenQuestions (by-design fwd-deps, NOT blocking): exampleLayers mocks the derived kernel.agent_layer SELECT view (newView swaps when persistence lands); no run control by design (agentloop.drive = BA15+/BA19); Linear MCP unauthenticated — could not flip the BA06 issue (§11 OQ, not a blocker).

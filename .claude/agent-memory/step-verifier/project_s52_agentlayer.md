---
name: project-s52-agentlayer
description: S52 — agent as a GOVERNED LAYER (CoucheAgent above the line + AgentRun below); wall refuses agent above-waterline write for every role; agent proposes never self-admits
metadata:
  type: project
---

S52 models the agent as a **governed layer**, not an authority.

- **kernel.agentlayer** (above the line): `CoucheAgent` + `AgentSpec` + closed `LayerKind` triad {agent|equipe_agents|orchestration} (a SemanticDiff `add` to S02/S35 metamodel). `Validate` forces `PeutModifierNoyau`/`PeutModifierFitness` ALWAYS false (structural, not a toggle) + rejects write zones resolving above waterline + closed taxonomy. `MayWrite` reuses the S04 waterline predicate → any above-line target denied with S13 `AGENT_WRITE_ABOVE_WATERLINE` for EVERY role. `Propose` always yields `status=proposed` (never admitted) + S16 human approvers; `Approve` refuses self-approval (approver==ProposedBy/Role/Nom → blocked, stays proposed).
- **runtime.agentrun** (below the line): `AgentRun` carries NO Version/Mirror field (a run is structurally not a layer). `Record` content-addressed via S01/S02 Canonicalize+Hash (no clock — timestamps supplied). `ApplyWall` stamps verdict via agentlayer.MayWrite.
- **Migration** agent_layer_baseline.sql expand-only: kernel.agent_layer agent SELECT-only (kind CHECK enum), runtime.agent_run/action/assignment agent INSERT+SELECT append-only (NO version/mirror column, result/statut CHECK enums). No prior table/GRANT altered.
- **Wall predicate DUPLICATION (OQ-S52-wall):** S04 Classify lives in `package main` (pretooluse hook binary), NOT importable. agentlayer/wall.go reproduces it VERBATIM (schemas {kernel,mirrors,fitness}, prefixes {back/kernel/,back/migrations/}). Verified identical to hooks/pretooluse/wall.go. By-design forward-dep OpenQuestion (recommend extracting S04 predicate to importable pkg), NOT blocking.
- **/agents** action-capable: Propose (proposed not admitted, routes idea→mirror→/goal→approbation), self-approve (refused), record run (below-line write). 52 i18n keys matched fr/en, all t() keys present in both. Playwright 6/6 live on :3000. Docs pushed bfea435.

Verified-green pattern. tsc clean, biome clean, vitest 8/8, go test ./kernel/agentlayer ./runtime/agentrun green (Testcontainers incl), build all green.

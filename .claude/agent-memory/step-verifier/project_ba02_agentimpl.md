---
name: ba02-agentimpl
description: BA02 AgentImplementation projection type — verified-green pattern; the projection-carries-no-truth structural mirror, wall single-sourced via S52 MayWrite
metadata:
  type: project
---

BA02 adds the TYPE `AgentImplementation` (`back/runtime/agentimpl`) — the below-the-line PROJECTION a `CoucheAgent` (S52 SOURCE) projects into for a runnable session. Builds on [[s52-agentlayer]] and BA01 (governed knobs).

**Done-criterion mirror (green):** an `AgentImplementation` is structurally UNREPRESENTABLE as a layer — `agentimpl_property_test.go` uses `reflect` to assert NO `Version` field and NO `Mirror` field, and embeds no `CoucheAgent`/`AgentSpec` (mirrors the agentrun "a run is irrepresentable as a layer" discipline). `LayerRef` is a plain string ref back to `CoucheAgent@version`, not a re-embedded SOURCE.

**Wall:** single-sourced through `agentlayer.MayWrite` (the S52 contract) — `IsAboveWaterline(t) == !MayWrite(AgentSpec{}, t).Allowed`. No forked waterline predicate. `Validate` is fail-closed: rejects empty LayerRef/Model, unknown provider, out-of-range knobs, negative ResourceLimits, any AllowedPath above the waterline, and any projection whose ForbiddenPaths misses a wall zone. Empty network/exec allow-lists = max confinement (NOT a range error).

**Verified-green:** Go 13 tests pass + gofmt clean + go vet clean; front tsc clean + vitest 25/25 (agentlayer.test) and 436/436 full; Playwright agents.spec 11/11 (2 new BA02: projection shown+tagged-not-a-layer with wall in forbidden paths; Validate control executes → valid). i18n: all 8 `impl*` keys present in BOTH fr+en. Docs: concept + internals MDX (3 layers), registered in docs.json, `mint validate` passed, pushed origin/main dbd0ed4.

**By-design forward-deps (OpenQuestions, not blockers):** NO emitter — `Project(layer,cfg,pack)` is BA03; binding-resolution subset rule is BA05; OQ-S52-wall (importable Classify extraction) scheduled BA03. **Linear MCP unauthenticated** (only `authenticate` tool surfaced) — could not flip the BA02 issue; OpenQuestion per CLAUDE.md §11, not a blocker.

**Why:** records the BA-series projection discipline so future BA steps (BA03 emitter, BA05 resolution) are verified against the same "projection carries no truth + wall single-sourced" frame.
**How to apply:** when verifying any BA0x projection step, re-run the reflect-based not-a-layer mirror + confirm the wall predicate is reused (not re-implemented). Cross-check [[tsc-vs-vitest]] and [[i18n-keys-missing]] on the front side.

# MCP server: `agentimpl` — ACTIVE (since BA06)

> **Status: working server (BA06).** The AgentImplementation capability door is
> live: `main.go` runs the pure `back/runtime/agentimpl.Project` (the BA03
> deterministic emitter) over a read-only governed-layer view and exposes it as
> MCP tools, with `main_test.go` proving the capability end-to-end + determinism
> (re-project ⇒ same hash) + the wall (read-only, no truth-write). The governed
> `kernel.agent_layer` SELECT view is a separate persistence step; until it
> lands, the server projects over the deterministic `exampleLayers` mocked
> read-only view (§6), mirroring the front fixture `lib/agentlayer-data.ts`.

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**AgentImplementation projection** — the below-the-line, regenerable runnable
configuration a governed `CoucheAgent` (the SOURCE, above the line) projects into.
It runs the **deterministic emitter** `agentimpl.Project` (a pure function, not a
prompt): given a `layerRef`, it returns the projected `AgentImplementation`
(model, temperature/maxturns/seed, resolved tools/skills/hooks, allowed/forbidden
paths, allowed network hosts/exec, budgets) **plus its content hash**.

## The op

`project a governed layer into its AgentImplementation (the BA03 emitter)`

Re-projecting the **same** `layerRef` yields the **same** hash (determinism-first):
the projection is a pure function of the governed layer; the server persists
nothing and regenerates on every call.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `agentimpl_project` | project a governed `CoucheAgent` (by `layer_ref`) → its `AgentImplementation` + content-hash | read `kernel.agent_layer` (SELECT) only |
| `agentimpl_list` | read-only list of the governed layers available to project (`layer_ref` + role + kind) | read `kernel.agent_layer` (SELECT) only |

### Input / output sketch

```
agentimpl_project in  { layer_ref: string }
                                       → out { impl: AgentImplementation, hash: string, found: bool }
agentimpl_list     in  { }             → out { layers: [{layer_ref, role, kind}] }
```

## Permissions — read/write zones

- **Reads:** `kernel.agent_layer` (SELECT view only — the governed `CoucheAgent`
  specs).
- **Writes:** NONE. A projection is regenerable and carries **no truth** (no
  version-as-truth, no mirror): the server persists nothing above **or** below the
  line.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or
  `fitness`. Every emitted projection ALWAYS carries the wall — `ForbiddenPaths`
  is the single-sourced `WallForbiddenPaths` (kernel/mirrors/fitness + truth path
  prefixes), and `AllowedNetworkHosts` is **empty ⇒ no egress** by default
  (fail-closed). There is **NO run control** — nothing executes until something is
  applied (the loop is BA15+).

## Related hook

`PreToolUse` (the wall) — `agentimpl.WallForbiddenPaths` is single-sourced through
the extracted `wall` package (OQ-S52-wall, resolved at BA03), so the hook, the
emitter's `ForbiddenPaths`, and the future `GateAction` read the SAME zone set.

## Activated at step **BA06**

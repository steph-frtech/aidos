# MCP server: `context` — ACTIVE (since S33)

> **Status: working server (S33).** The ContextRouter capability door is live:
> `main.go` runs the pure `back/runtime/context.Compile` over a read-only
> ContextGraph view and exposes it as MCP tools, with `main_test.go` proving the
> capability end-to-end + the wall (no truth-write tool). The derived `context`
> schema is a separate persistence step; until it lands, the server compiles over
> the deterministic `ExampleGraph` mocked read-only view (§6).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**`context` schema** — the derived ContextGraph + `ContextGraphDecision`. It runs
the **ContextRouter** (an algorithm, not a prompt) to compile a minimal,
branch-aware **ContextPack** for a red goal: only the load-bearing kernel, the
red mirrors, the crossed contracts, and scoped memory from the goal's affected
subgraph — never the whole project.

## The op

`compile a ContextPack from the red-set (ContextRouter)`

Given the red set (the goal's failing mirrors), the router walks the
ContextGraph, selects the load-bearing nodes for the affected subgraph on the
current branch, records a `ContextGraphDecision` (reuse allowed or not), and
returns the assembled ContextPack.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `context_compile` | run the ContextRouter over a red-set → a ContextPack | read kernel/mirrors/context, write `context` decision |
| `context_explain` | show why a node was in/excluded (the ContextGraphDecision) | read `context` |

### Input / output sketch

```
context_compile in  { red_set: string[], branch?: hash, budget?: int }
                                       → out { pack: { kernel_nodes[], red_mirrors[], contracts[], memory[] }, decision_id }
context_explain in  { decision_id }    → out { included: [{node, reason}], excluded: [{node, reason}] }
```

## Permissions — read/write zones

- **Reads:** `kernel`, `mirrors`, `context`, `brain` (scoped, via the MemoryFirewall), `dag` (for branch-awareness).
- **Writes:** `context` schema only — appends a `ContextGraphDecision` (reuse-allowed-or-not) as an audit record. The ContextGraph itself is *derived* and regenerable.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness`. The router only *reads* truth to decide what context to surface.

## Related hook

`SessionStart` / pre-step context load — the router output is what a code step
consumes; a sensor can assert the pack stays within budget and never leaks
out-of-scope truth.

## Activated at step **S33**

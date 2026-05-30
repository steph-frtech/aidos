# MCP server: `dag` — SCAFFOLD (activated at S24)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S24** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**`dag` schema** — stable phases (nodes) and changesets (edges). It is how the
version history grows non-destructively: branch off a phase, check out an
ancestor, re-branch, and merge. Merge is **gated by the mirror, not the text
diff** (the `merge-semantic` gesture): a red mirror on the merged cut blocks it.

## The op

`branch / checkout-ancestor / rebranch / merge the version DAG`

Branch creates a new edge from a phase. Checkout-ancestor resolves a prior stable
phase. Rebranch re-roots a draft line onto another phase. Merge joins two lines
by re-running every mirror on the merged cut and recording a merge changeset only
if green.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `dag_branch` | open a new branch from a stable phase | write `dag` (append node/edge) |
| `dag_checkout_ancestor` | resolve/checkout a prior stable phase | read |
| `dag_rebranch` | re-root a draft line onto another phase | write `dag` (append) |
| `dag_merge` | merge two lines, gated by re-running all mirrors on the merged cut | write `dag` (append, if green) |

### Input / output sketch

```
dag_branch            in  { from_phase: hash, label }        → out { branch_id, head_phase: hash }
dag_checkout_ancestor in  { phase: hash, back: int }         → out { phase: hash, changeset_id }
dag_rebranch          in  { line_id, onto_phase: hash }      → out { line_id, new_base: hash }
dag_merge             in  { left: hash, right: hash }        → out { merged_phase: hash|null, status:"green"|"red", red_mirrors: string[] }
```

## Permissions — read/write zones

- **Reads:** `dag`, `changesets`, `kernel`, `mirrors` (merge re-runs mirrors via the `mirror-runner` MCP).
- **Writes:** `dag` only, append-only (new nodes/edges; phases are content-addressed). Never destroys a phase or an edge.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness`. A merge that would land truth flows through the `changeset` MCP + the privileged role, not here.

## Related hook

`Stop` / completeness gates a merge; the merge calls `mirror-runner` to prove the
merged cut is green before any `dag` edge is appended (`merge-semantic`).

## Activated at step **S24**

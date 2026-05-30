# MCP server: `changeset` — SCAFFOLD (activated at S20)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S20** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**`changesets` schema** — the transactional history of truth. A ChangeSet is the
*only* legal way truth moves: it bundles a spec delta and its mirror delta and
flips through `DRAFT → APPLIED → REVERTED`, append-only. This server is the
capability surface; the **authority to write truth still belongs to the `aidos`
CLI's privileged role through an approved changeset** (CLAUDE.md §2), not to the
agent.

## The op

`create/apply/revert a ChangeSet (DRAFT/APPLIED/REVERTED) atomically over spec+mirror`

Create stages a DRAFT (no truth touched). Apply commits the bundled spec+mirror
delta in one Postgres transaction (all-or-nothing) and appends an APPLIED row.
Revert appends a REVERTED row that supersedes — nothing is destroyed.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `changeset_create` | stage a DRAFT changeset (spec delta + mirror delta) | write `changesets` (DRAFT) |
| `changeset_apply` | atomically apply a DRAFT (→ APPLIED) over spec+mirror | privileged truth write |
| `changeset_revert` | append a REVERTED row superseding an APPLIED one | privileged truth write |
| `changeset_get` | read a changeset's status + bundled deltas | read |

### Input / output sketch

```
changeset_create in  { spec_delta: json, mirror_delta: json, provenance: {who,why} }
                                                  → out { changeset_id, status:"DRAFT" }
changeset_apply  in  { changeset_id }             → out { changeset_id, status:"APPLIED", phase_hash }
changeset_revert in  { changeset_id, reason }     → out { changeset_id, status:"REVERTED" }
changeset_get    in  { changeset_id }             → out { changeset_id, status, spec_delta, mirror_delta, provenance }
```

## Permissions — read/write zones

- **Reads:** `changesets`, `kernel`, `mirrors` (to compute/validate the delta).
- **Writes:** `changesets` only (append-only). Apply/revert touch `kernel` +
  `mirrors` **exclusively through the privileged `aidos` role + an approved
  changeset** — never the agent's role.
- **Forbidden (the wall, CLAUDE.md §2):** the agent's DB role has **no** GRANT to
  write `kernel` / `mirrors` / `fitness` directly. The only door to the kernel is
  `idea → mirror → /goal → human approval → changeset apply`. No write in passing.

## Related hook

`PreToolUse` (the wall) refuses any direct kernel/mirror write; `PostKernelChange`
fires after a successful apply to recompute completeness/propagation.

## Activated at step **S20**

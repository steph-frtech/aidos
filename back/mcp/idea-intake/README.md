# MCP server: `idea-intake` — SCAFFOLD (activated at S27)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S27** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**`ideas` schema** — candidate-truths that have **no freeze and no mirror yet**.
This is the legal on-ramp toward truth: a human or an incident submits an Idea
with provenance; later it gets a mirror and a `/goal`. The server captures
candidates; it is structurally incapable of freezing them into the kernel.

## The op

`submit a candidate-truth (Idea) with provenance; never writes the kernel`

Records a DRAFT Idea (statement + provenance: who/what/when/why) in the `ideas`
schema. Listing/reading lets the Workbench triage them. Promotion to truth is a
*separate* path (`/goal` + `changeset` + human approval), never this server.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `idea_submit` | record a candidate-truth with provenance | write `ideas` |
| `idea_list` | list candidate-truths (triage queue) | read `ideas` |
| `idea_get` | read one candidate-truth + its provenance | read `ideas` |

### Input / output sketch

```
idea_submit in  { statement: string, provenance: {source:"human"|"incident", who, when, why} }
                                                  → out { idea_id, status:"DRAFT" }
idea_list   in  { source?: "human"|"incident" }   → out { ideas: [{idea_id, statement, provenance}] }
idea_get    in  { idea_id }                        → out { idea_id, statement, provenance, status }
```

## Permissions — read/write zones

- **Reads/Writes:** `ideas` and `provenance` schemas only (candidate-truths are *below* the wall — they are wishes, not truth).
- **Forbidden (the wall, CLAUDE.md §2):** **never** writes `kernel`, `mirrors`, or `fitness`. Submitting an Idea must not — and cannot, by GRANT — touch the kernel. The door from Idea to truth is `idea → mirror → /goal → human approval`, handled elsewhere.

## Related hook

`SessionStart` may seed the triage queue; the wall (`PreToolUse`) guarantees an
Idea submission never escalates into a kernel write.

## Activated at step **S27**

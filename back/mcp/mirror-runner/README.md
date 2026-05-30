# MCP server: `mirror-runner` — SCAFFOLD (activated at S05)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S05** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**AIDOS Mirror** cert-runners. It runs one mirror — or replays the whole mirror
set — against the current cut and reports, per mirror, **green / red**. This is
the read side of the wall: it *observes* whether truth is honoured, it never
edits truth.

## The op

`run a mirror / replay all mirrors; report green/red`

Dispatches a stored mirror to the right runner by `test_kind`
(Gherkin→Godog, invariant→rapid, workflow→fixture interpreter), materializes the
mirror source from the `mirrors` schema to disk for the runner, executes, and
collects the verdict. Replay mode runs every living mirror and aggregates.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `mirror_run` | run one mirror by id/hash; return its verdict + output | read truth, run runner |
| `mirror_replay` | replay all living mirrors; return per-mirror verdicts + summary | read truth, run runner |

### Input / output sketch

```
mirror_run    in  { mirror_id: string }                  → out { mirror_id, status: "green"|"red", duration_ms, output: string }
mirror_replay in  { reflects?: string, kinds?: string[] } → out { results: [{mirror_id, status, duration_ms}], green: int, red: int }
```

## Permissions — read/write zones

- **Reads:** `mirrors` schema (mirror records + source), the kernel cut under test (read-only).
- **Writes:** materializes mirror source to a scratch dir on disk (derived, regenerable); writes a run report to telemetry/`fitness`-adjacent run tables **only via their own MCP**, never directly.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness` schemas. The DB role has no GRANT to them; this server only ever **reads** truth and **runs** runners.

## Related hook

`Stop` / completeness — the Stop hook calls into the replay verdict to enforce
"red set → green ∧ prior green intact ∧ no monster" before a step may close.

## Activated at step **S05**

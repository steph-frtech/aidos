# MCP server: `mirror-runner` — ACTIVE (S05, the cliquet)

> **Status: active.** S05 turned the scaffold into a working `mcp.Server`
> (`main/main.go`) over the cliquet core (`regression.go`) + the runner shell
> (`runner.go`), with property, workflow, Godog and Testcontainers mirrors and a
> ci-ratchet fault-injection meta-test. The pure regression decision is code, not
> an agent (determinism-first, CLAUDE.md §6). The working reference is still
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
| `mirror_replay` | replay all living mirrors; record runs append-only; return per-mirror verdicts + verdict | read truth, write own run-log |
| `ratchet_check` | replay + compare to the recorded baseline; return the merge verdict + the regressed set + a `RED_REGRESSION` BlockReason on rejection | read truth, write own run-log |

### Input / output sketch

```
mirror_replay in  { ref: string }              → out { run_id, results: [RunRecord], verdict: "ALLOWED"|"REJECTED" }
ratchet_check in  { ref: string, run_id: string } → out { run_id, verdict, regressed: [Regression], block_reason? }
```

The cliquet decision (`Decide`/`Regressed`/`Verdict` in `regression.go`) is a pure
total function — same input → same output — pinned by a rapid reproducibility
mirror. The replay (running the mirrors) is the only impure part, behind the
`Replayer` seam.

## Permissions — read/write zones

- **Reads:** `mirrors` schema (mirror records + source), the kernel cut under test (read-only).
- **Writes:** materializes mirror source to a scratch dir on disk (derived, regenerable); writes a run report to telemetry/`fitness`-adjacent run tables **only via their own MCP**, never directly.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness` schemas. The DB role has no GRANT to them; this server only ever **reads** truth and **runs** runners.

## Related hook

`Stop` / completeness — the Stop hook calls into the replay verdict to enforce
"red set → green ∧ prior green intact ∧ no monster" before a step may close.

## Activated at step **S05**

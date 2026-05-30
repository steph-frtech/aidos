# MCP server: `backtester` — SCAFFOLD (activated at S42)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S42** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**out-of-sample / walk-forward evaluation** that gates evolution variants. It is
the **RealityMirror gate**: a variant that looks good in-sample must survive
held-out / walk-forward evaluation before it can be promoted. Pairs with the
`evolve` server (same step, S42): `evolve` proposes variants, `backtester` judges
them against reality.

## The op

`evaluate a variant out-of-sample / walk-forward (RealityMirror gate)`

Takes a variant (a sandbox branch) and a held-out evaluation window, runs
walk-forward evaluation, and returns a green/red verdict + metrics. Green
out-of-sample is a *necessary* condition for promotion — never sufficient on its
own (authority approval still required).

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `backtest_run` | evaluate a variant out-of-sample / walk-forward | read; write report |
| `backtest_report` | read a prior backtest's verdict + metrics | read |

### Input / output sketch

```
backtest_run    in  { variant_id, branch: hash, window: {from, to}, mode:"oos"|"walk_forward" }
                                 → out { report_id, status:"green"|"red", metrics: {…}, folds?: [{window, status}] }
backtest_report in  { report_id } → out { report_id, status, metrics }
```

## Permissions — read/write zones

- **Reads:** the variant branch (`dag`), the cell's mirrors, held-out data; telemetry/RealityMirror signals (read-only).
- **Writes:** a backtest **report** (content store) only.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness`. The backtester is a *gate* (a judge), never a writer of truth; promotion still flows through `changeset` + authority.

## Related hook

The RealityMirror gate (a completeness/promotion sensor) requires a green
`backtest_run` before any promotion changeset; its fault-injection test feeds a
known-bad variant and asserts the gate goes red and blocks promotion.

## Activated at step **S42**

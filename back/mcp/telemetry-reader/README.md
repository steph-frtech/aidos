# MCP server: `telemetry-reader` — SCAFFOLD (activated at S43)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S43** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for
**reading** OpenTelemetry signals + incidents the runtime has landed in Postgres
(CLAUDE.md §3: Telemetry → Postgres). It is **read-only** by design: it surfaces
what reality reported so a divergence can be turned into a draft Idea (the
`learn` gesture) — the only legal on-ramp from production reality to the kernel.

## The op

`read OpenTelemetry signals / incidents from the base`

Queries the telemetry tables for spans/metrics/incidents over a window or by
filter, and returns them for the Workbench / the `learn` gesture to inspect. It
never writes a signal and never feeds the kernel.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `telemetry_query` | read OTel signals (spans/metrics) over a window/filter | read |
| `telemetry_incidents` | list incidents / RealityMirror divergences | read |

### Input / output sketch

```
telemetry_query     in  { window: {from, to}, kind?: "span"|"metric", filter?: {…} }
                                          → out { signals: [{ts, kind, name, attrs}] }
telemetry_incidents in  { window: {from, to}, status?: "open"|"closed" }
                                          → out { incidents: [{incident_id, signal, mirror?, opened_at}] }
```

## Permissions — read/write zones

- **Reads:** the telemetry / incident tables (OTel → Postgres) only.
- **Writes:** none. This server is strictly read-only.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness` — nor to telemetry itself. A divergence becomes truth only via `learn → idea → mirror → /goal`, never through this reader.

## Related hook

`learn` / RealityMirror — a signal read here can seed a draft Idea (via
`idea-intake`); a sensor asserts the reader cannot write any table.

## Activated at step **S43**

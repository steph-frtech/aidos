# MCP server: `sensors` — SCAFFOLD (activated at S07)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S07** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**computational sensors** the agent self-certifies on at each diff (CLAUDE.md §6
step 4). It runs the cheap, deterministic checks over *changed* code only and
reports pass/fail per sensor. It is the capability the `PostToolUse` hook drives;
it self-certifies on the computational, never on the human red.

## The op

`run computational sensors on changed code (gofmt/vet, lint, archtest, affected tests)`

Given a changed-file set (or a diff range), runs `gofmt -l` + `go vet`, the
linter, the arch-fitness check (go-arch-lint/depguard), and the affected `go test`
packages; aggregates green/red with the failing detail.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `sensors_run` | run all computational sensors over a changed-file set | read code, run tools |
| `sensors_run_one` | run a single named sensor (gofmt/vet/lint/archtest/tests) | read code, run tool |

### Input / output sketch

```
sensors_run     in  { changed_paths: string[] }            → out { results: [{sensor, status:"green"|"red", detail}], green:int, red:int }
sensors_run_one in  { sensor: "gofmt"|"vet"|"lint"|"archtest"|"tests", changed_paths: string[] }
                                                            → out { sensor, status, detail }
```

## Permissions — read/write zones

- **Reads:** the repo working tree (Go/`.feature`/TS projections), the diff.
- **Writes:** none to any truth store; may write a transient sensor report through the telemetry MCP, never directly.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness` schemas. Sensors are read-and-run only.

## Related hook

`PostToolUse` — fires this server after each diff so sensors stay green per
change; the hook is the non-bypassable rule, this server is the capability.

## Activated at step **S07**

# MCP server: `evolve` — SCAFFOLD (activated at S42)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S42** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**medium loop** (`/evolve` self-play + QD) inside the **EvolutionSandbox
quarantine**. It runs an evolution round on a cell: generate variants that may
write **only branches / reports / ideas, never the kernel**; a variant is
promoted into a QD niche **only** when it carries a green mirror (∧ out-of-sample
green ∧ authority approval). `/evolve` **proposes, it never governs.**

## The op

`run an evolution round in the sandbox (variants → branches), gated by mirrors`

Generates N variants of a cell in quarantine, runs the cell's mirrors on each
(via `mirror-runner`), writes each surviving variant to a sandbox **branch** in
the `dag` and a report; never applies to the kernel. Promotion is a separate,
human/authority-gated path.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `evolve_round` | run one evolution round on a cell; emit variant branches + reports | write branches/reports/ideas (sandbox) |
| `evolve_status` | read a round's variants + their mirror verdicts | read |

### Input / output sketch

```
evolve_round  in  { cell_id, population: int, generations: int }
                       → out { round_id, variants: [{variant_id, branch: hash, mirror_status:"green"|"red", oos?:"green"|"red"}] }
evolve_status in  { round_id }
                       → out { round_id, variants: [{variant_id, mirror_status, promoted: bool}] }
```

## Permissions — read/write zones

- **Reads:** `kernel`, `mirrors`, `dag`, `brain` (scoped).
- **Writes (sandbox only):** sandbox **branches** in `dag`, evolution **reports** (content store), and candidate **ideas** (`ideas` schema). All inside the EvolutionSandbox quarantine.
- **Forbidden (the wall, CLAUDE.md §2):** **never** writes `kernel`, `mirrors`, or `fitness`. A variant can only become truth via green mirror + out-of-sample green + authority approval, through `changeset` + the privileged role — not this server.

## Related hook

The EvolutionSandbox quarantine guard (a `PreToolUse`-class sensor) asserts a
variant write can target only branches/reports/ideas; its fault-injection test
attempts a kernel write from the sandbox and asserts a block.

## Activated at step **S42**

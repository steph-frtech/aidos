# PostToolUse hook — the feedback wall (SCAFFOLD)

> **Status: SPEC ONLY. Not wired live.** This is a scaffold per CLAUDE.md §5
> (hook-honesty: *a hook that never fires is dead*). It is **activated and
> fault-injection-tested at step S07**, never before. The `doc.go` in this
> package compiles but carries **no logic** on purpose.

## Role

Run the **computational sensors** on each diff the agent produces. On any
sensor failure, **block** — this is the *feedback wall*: the agent does not get
to proceed past a diff that broke a sensor.

Taxonomy origin (`KRD_CLAUDE_scaffold/runtime/hooks/hooks.yaml`, `PostToolUse`):
`run_affected_mirrors · run_krd_check · update_red_work_queue · record_provenance`.

## When it fires

- **Phase:** `PostToolUse` — after every tool call that produced a diff
  (Write / Edit / multi-file change) under the agent-writable zones
  (`back/gen`, projections, `front/web` adapters, this step's own package).
- Fires **per diff**, not per session. Fast sensors only (the computational
  layer): `go vet`, `gofmt`, `go build`, `aidos check` for the touched scope,
  the **affected** mirrors (not the whole suite), arch-fitness on touched files.
- It does **not** run slow gates (mutation, full Godog journeys, k6) — those
  belong to the `Stop` hook.

## What it enforces

1. **Affected mirrors stay green** — re-runs only the mirrors whose source maps
   to the touched files; a newly-red prior-green mirror blocks.
2. **`aidos check`** passes for the implemented scope (compile, vet, format).
3. **Arch-fitness** (go-arch-lint / depguard) on the touched files — no new
   forbidden dependency edge.
4. **Provenance recorded** — the diff is appended to the `provenance` schema
   (who/what/when), append-only.
5. Self-certify on the **computational only** (CLAUDE.md §6.4) — never asserts a
   human-owned truth.

## BlockReason emitted

On failure, returns the standard actionable `BlockReason`
(`code, severity, explanation, how_to_fix[]`):

```json
{
  "code": "SENSOR_RED_ON_DIFF",
  "severity": "error",
  "explanation": "Diff under back/gen/order.go made affected mirror mirrors/order.create green→red.",
  "how_to_fix": [
    "Run `aidos check --scope=order` to reproduce locally.",
    "Inspect the failing mirror with `aidos explain SENSOR_RED_ON_DIFF`.",
    "Repair the diff (red→green) before the next tool call; the feedback wall holds until the affected sensor is green again."
  ]
}
```

Related codes this hook may emit: `BUILD_FAILED`, `VET_FAILED`,
`FMT_DRIFT`, `ARCH_FITNESS_VIOLATION`, `AFFECTED_MIRROR_RED`,
`PROVENANCE_WRITE_FAILED`.

## Fault-injection test (required at activation, S07)

Per §5, this hook ships green only with a test that **breaks what it watches**
and asserts it goes red:

- **Inject:** apply a diff that knowingly reddens an affected mirror (e.g. flip a
  return value the mirror pins). **Assert:** the hook returns `SENSOR_RED_ON_DIFF`
  with a non-empty `how_to_fix`.
- **Inject:** introduce a forbidden dependency edge. **Assert:**
  `ARCH_FITNESS_VIOLATION`.
- **Inject:** a build break. **Assert:** `BUILD_FAILED`.
- **Negative control:** a clean, green diff must **pass** (the hook must not
  block everything — a hook that always blocks is as dead as one that never
  fires).

## Activation

**Activated at step S07.** Until then this package is an inert scaffold.

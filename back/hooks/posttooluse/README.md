# PostToolUse hook — the sensors (the feedback wall)

> **Status: ACTIVATED at S07.** The computational sensors run on each diff below
> the waterline; any failing sensor blocks with a `SENSOR_FAILED` BlockReason.
> Fault-injection proves each sensor fires (CLAUDE.md §5 hook-honesty).

## Role

Run the **computational sensors** on each diff the agent produces (KRD §19/§74:
`PostToolUse = les sensors`). On any sensor failure, **block** — the agent does
not proceed past a diff that reddened a sensor. The twin of the wall: `PreToolUse`
blocks an illegal *write*, `PostToolUse` blocks a *broken diff*.

## The five computational sensors

Mapped onto the frozen Go stack (ADR 0014), in KRD §74 order:

| Sensor | Tool invoked | Blocks when |
|---|---|---|
| `gofmt` | `gofmt -l` on the changed Go files | the diff drifts from the canonical format |
| `vet` | `go vet` on the affected packages | a build/type/suspicious-construct error |
| `lint` | `go build` (strict-Go gate) on the affected packages | the affected packages do not build |
| `archtest` | in-process boundary check (ADR 0002/0014) | a projection below the waterline imports `back/kernel/**` |
| `affected` | `go test` on the affected packages | an affected test/mirror is red |

The hook **invokes** the frozen tools as subprocesses; it never reimplements them.
`go-arch-lint`/depguard for a richer archtest is OQ-S07-2 (the default boundary
check stands until then).

## When it fires

- **Phase:** `PostToolUse` — after a tool call that produced a diff below the
  waterline (`back/gen`, projections, `front/web` adapters, this step's package).
- Fires **per diff**. Fast computational sensors only. Slow gates (mutation,
  full Godog journeys, k6) belong to the `Stop` hook, not here.

## Verdict + BlockReason

Exactly two verdicts — `block` | `allow` (no third; the DB CHECK constraint
enforces it). On `block`:

```json
{
  "code": "SENSOR_FAILED",
  "severity": "error",
  "explanation": "Sensor en échec sur le code changé : « affected » … (on_fail: block, KRD §74).",
  "how_to_fix": [
    "Reproduisez localement le capteur fautif sur le paquet changé (gofmt -l / go vet / go test).",
    "Inspectez le BlockReason avec `aidos explain SENSOR_FAILED` et la route Workbench /sensors.",
    "Réparez le diff (red→green) avant le prochain tool-call ; le mur de feedback tient tant que le capteur reste rouge."
  ]
}
```

An **errored/unknown sensor is itself a failure** made explicit (KRD §82
`.passthrough()` anti-pattern): a crashing or unknown check `block`s, it never
silently allows. An undecodable event fails closed (block).

## sensor_runs (the audit log)

Every run is recorded append-only in `runtime.sensor_runs` (+
`runtime.sensor_check_results`), below the waterline (ADR 0014). The agent role
has `INSERT`+`SELECT` only — never `UPDATE/DELETE/TRUNCATE`. Migration:
`back/migrations/sensor_runs_baseline.sql`.

## Mirrors

- **Journey (Godog, N0):** `tests/runtime/sensors.feature` — a failing affected
  test blocks with `SENSOR_FAILED` + a `sensor_runs` row; a `Scenario Outline`
  per sensor; a clean diff allows; an errored sensor blocks.
  (`sensors_bdd_test.go`)
- **Invariant (rapid, N1):** `aggregate_property_test.go` — `block` iff any check
  failed; no third verdict; `block ⇒ SENSOR_FAILED`; `failing[]` is exactly the
  failing subset; an errored check is a failure.
- **Fault-injection (sensor-honesty, §5):** `fault_injection_test.go` — one real
  fault per sensor against a throwaway Go module ⇒ red; revert ⇒ green.
- **DB (Testcontainers):** `sensor_runs_db_test.go` — round-trip, append-only for
  the agent, the wall holds, the verdict CHECK constraint.

## Workbench

`front/web/app/sensors/` → `/sensors` — projects `sensor_runs`: the computational
suite, the latest run's per-check verdicts + durations, and a `SENSOR_FAILED`
block-event feed. Read-only (the hook is harness-invoked, not a callable op).

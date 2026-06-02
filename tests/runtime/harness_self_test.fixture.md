# mirrors schema · reflects: hooks.sessionstart.{Run,harness-self-test} · test_kind: fixture · cert_language: operation-dsl/go · authority: below

> **Materialized mirror (bootstrap exception, CLAUDE.md §6).** The `mirrors` Postgres
> schema stores this fixture conceptually; until a back-fill lands it, the executable
> proof is `back/hooks/sessionstart/selftest/selftest_fixture_test.go` (the Go fixture
> interpreter) + `selftest_property_test.go` (the `rapid` ∀ invariants) +
> `selftest_ledger_roundtrip_test.go` (Testcontainers GRANT proof). This file is the
> human-readable source of the red set.

The **meta-meta self-test** (KRD LIVRE XIII §70) proves the three inviolable guarantees
of NIVEAU 3 by **deterministic fault injection** at every session start:

1. **Every sensor still fires** — break a known-green watched check → the detector goes red
   (the *mirror of the mirrors*, KRD §60 « est-ce que ce détecteur détecte ? »).
2. **The wall still holds** — an agent-role write above the line (kernel · mirrors · fitness)
   is refused.
3. **The fitness is unchanged** — `Hash(Canonicalize(fitness rows))` equals the graven baseline
   (no loop edits its own fitness — the cardinal sin).

The méta loop may **ADD** a guardrail, **never REMOVE** one; a removed guardrail is a red
self-test. `Run` is **read-only** on the fitness it checks.

```
fixture "a healthy harness passes the self-test (all guarantees hold)"          # THE done criterion
  state   (harness):   { sensors: [<all known-green>], wall: <S04 GRANTs intact>, fitness: <graven baseline> }
  command (run):       Run(harness, at)
  events:  [ SelfTestRan ]
  -> report.verdict == "green"
  -> every sensor in report.sensors_checked has fired == true                   # each detector detects
  -> report.wall_probe.refused == true for kernel, mirrors AND fitness          # the wall holds
  -> report.fitness_probe.unchanged == true (current_hash == baseline_hash)     # fitness immutable
  -> no BlockReason

fixture "a muted sensor reddens the self-test (guardrail removed)"              # méta loop removed a guard
  state   (harness):   { sensors: [<one watched check no longer fires>], wall: ok, fitness: baseline }
  command (run):       Run(harness, at)
  events:  [ SelfTestRan ]
  -> report.verdict == "red"
  -> BlockReason.code == "MUTED_SENSOR", how_to_fix non-empty

fixture "a breached wall reddens the self-test (agent could write truth)"
  state   (harness):   { sensors: ok, wall: <agent role gained INSERT on kernel>, fitness: baseline }
  command (run):       Run(harness, at)
  events:  [ SelfTestRan ]
  -> report.wall_probe.refused == false (for kernel) ; report.verdict == "red"
  -> BlockReason.code == "WALL_BREACHED"

fixture "a mutated fitness reddens the self-test (a loop edited its own fitness)"   # the cardinal sin
  state   (harness):   { sensors: ok, wall: ok, fitness: <one row changed vs the graven baseline> }
  command (run):       Run(harness, at)
  events:  [ SelfTestRan ]
  -> report.fitness_probe.unchanged == false (current_hash != baseline_hash)
  -> report.verdict == "red" ; BlockReason.code == "FITNESS_MUTATED"

fixture "the self-test never writes the fitness it checks (read-only)"          # honesty / the wall on itself
  state   (harness):   { fitness: baseline }
  command (run):       Run(harness, at)
  events:  [ SelfTestRan ]
  -> the fitness rows are byte-identical before and after Run                   # the checker cannot touch what it checks
  -> only runtime.self_test_runs was appended (via the writer role)

fixture "a malformed harness (missing sensor inventory) yields a BlockReason, never a panic"
  state   (harness):   { sensors: [] }
  command (run):       Run(harness, at)
  -> a BlockReason is returned (code MUTED_SENSOR — an empty inventory cannot prove the sensors fire)
  -> no panic, no invented sensor id
```

## ∀ invariants (rapid)

```
∀ harness h, at t:  Run(h,t) == Run(h,t)                            — determinism (at passed in; no clock/RNG/map-order leak)
∀ h all-green ∧ wall refusing ∧ fitness == baseline:  Run(h,t).verdict == "green"
∀ h with ANY muted sensor:                            Run(h,t).verdict == "red" ∧ BlockReason emitted
∀ h with ANY accepted above-the-line write:           Run(h,t).verdict == "red"
∀ h with fitness rows != baseline:                    Run(h,t).fitness_probe.unchanged == false ∧ red
∀ h:  fitness rows unchanged by Run(h,t)                            — the checker is read-only on what it checks
∀ malformed harness / missing sensor inventory:       Run yields a BlockReason — never a panic, never an invented sensor id
```

# SessionStart hook — harness self-test (SCAFFOLD)

> **Status: SPEC ONLY. Not wired live.** This is a scaffold per CLAUDE.md §5
> (hook-honesty: *a hook that never fires is dead*). It is **activated and
> fault-injection-tested at step S39**, never before. The `doc.go` in this
> package compiles but carries **no logic** on purpose.

## Role

At the start of each session, **self-test the harness** by fault injection:
prove that the guardrails are still alive before any work begins. Concretely it
asserts that **each sensor still fires**, **the wall still holds**, and **fitness
is unchanged**. This is the meta-guardrail — it watches the watchers, so a
silently-dead hook (the cardinal sin of §5) is caught at session start rather
than during a real run.

This phase corresponds to the `SessionStart` slot in CLAUDE.md §3 (Hooks:
`PreToolUse / PostToolUse / Stop / PostKernelChange / SessionStart`). It
operationalizes the §5 *fault-injection* requirement at the whole-harness level.

## When it fires

- **Phase:** `SessionStart` — once, before the agent receives its first task.
- It runs the bundled fault-injection probes against the *other* hooks and the
  wall, in a throwaway sandbox (it must not mutate truth, the kernel, or the
  fitness schema while probing).

## What it enforces

1. **Each sensor fires** — drive each PostToolUse sensor with a known-bad input
   and assert it goes red. A sensor that stays green on injected breakage is
   **dead** → block.
2. **The wall holds** — attempt a write to the `kernel` / `mirrors` / `fitness`
   schemas as the agent role and assert the PreToolUse wall (built at S04)
   refuses with the expected `BlockReason`. Both layers checked: hook refusal and
   absence of Postgres write GRANT.
3. **Fitness unchanged** — hash the `fitness` schema (NIVEAU 3 grammar, waterline,
   definition of "passed") and assert it equals the declared/pinned hash. Fitness
   is read-only and declared, never learned (§8); drift is a tampering signal.
4. **Completeness baseline** — assert no monster exists at session start (the
   ground state is clean before new work).

## BlockReason emitted

On any failed probe, returns the standard actionable `BlockReason` and refuses
to start the session:

```json
{
  "code": "HARNESS_SELF_TEST_FAILED",
  "severity": "critical",
  "explanation": "Fault injection: PostToolUse sensor `arch-fitness` did not go red on an injected forbidden dependency — the sensor is dead.",
  "how_to_fix": [
    "Run `aidos check --self-test` to reproduce the probe.",
    "Repair or re-wire the dead sensor; a sensor that never fires is dead (CLAUDE.md §5).",
    "The session is blocked until every sensor fires, the wall refuses an above-line write, and the fitness hash matches the pinned value."
  ]
}
```

Related codes: `HARNESS_SELF_TEST_FAILED`, `SENSOR_DEAD`, `WALL_BREACHED`,
`FITNESS_DRIFT`, `MONSTER_AT_BASELINE`.

## Fault-injection test (required at activation, S39)

This hook *is* fault injection; its own test injects faults into the harness and
asserts the self-test catches them:

- **Inject:** disable a sensor (make it always-green). **Assert:** `SENSOR_DEAD`.
- **Inject:** grant the agent role a write on a truth table / neutralize the
  PreToolUse refusal. **Assert:** `WALL_BREACHED`.
- **Inject:** mutate the fitness schema hash. **Assert:** `FITNESS_DRIFT`.
- **Inject:** seed a monster (orphan mirror) into the baseline. **Assert:**
  `MONSTER_AT_BASELINE`.
- **Negative control:** an intact harness must **let the session start** (the
  self-test must pass when nothing is broken).

## Activation

**Activated at step S39.** Until then this package is an inert scaffold.

# spike-confinement hook (S28)

`PreToolUse` Go hook that enforces the throwaway `/spike` zone (KRD §84/§60.x) and
the harvest-never-freezes wall (KRD §116/§118). It is the non-bypassable rule of the
S28 exploration gestures.

## What it refuses

- While an Idea is `spiking` (ratchet OFF, rigor T0), a write whose path escapes the
  `/spike` prefix → **`SPIKE_WRITE_ESCAPES_ZONE`** (`how_to_fix`:
  `confine_write_to_/spike`, `run_/harvest_to_propose_a_kernel_delta`).
- A `/harvest` write targeting a truth schema (`kernel`/`mirrors`/`fitness`) →
  **`HARVEST_CANNOT_FREEZE`** (`how_to_fix`: `write_mirror_run_goal_freeze`,
  `harvest_proposes_only`).

## Design

- **Determinism-first:** the hook defers to the pure predicates
  `exploration.CheckSpikeWrite` / `exploration.CheckHarvestWrite` — it never
  re-implements the confinement rule.
- **The wall:** it learns the current Idea status from an **injected** event field;
  it never reads the `kernel`/`mirrors` schemas (no grant).
- **Fail-closed:** an unparseable event denies.

## Event (stdin JSON)

```json
{ "idea_status": "spiking", "gesture": "spike", "path": "/spike/probe.go", "schema": "" }
```

Exit `0` = allow, `2` = deny (the BlockReason is written to stdout as JSON).

## Hook honesty (§5)

The fault-injection test (`main_test.go`) breaks what the hook watches — a spiking
write to `/kernel`, a harvest write to `kernel` — and asserts the hook goes red. A
hook that never fires is dead.

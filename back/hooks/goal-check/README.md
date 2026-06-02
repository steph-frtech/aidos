# Stop:goal-check hook (S29)

The **non-gameable stop gate** of KRD §57 Algorithme ① / §8. At the end of a run it
refuses to let a **goal** close unless the four computed conditions hold:

```
red set → green  ∧  prior green intact  ∧  mutation ≥ floor  ∧  no monster
```

It never trusts the agent's claim of "done" — **done is computed**, not declared. The
hook **defers** to the pure predicate `goal.IsClosed` / `goal.CloseBlockReason`
(`back/runtime/goal`); it re-implements nothing.

## Wiring

A `Stop` hook. It is a **sibling** of the completeness Stop gate (`back/hooks/stop`) and
**composes additively** (CLAUDE.md §5: a new guardrail ADDs, never removes). A Stop is
admitted only if **every** Stop gate allows it.

## Protocol

- **stdin**: a JSON `Event` carrying the goal's `red_set` plus the **injected** live
  verdicts — `sensors` (`{ref: "green"|"red"}`), `prior_green` (`"intact"|"broken"`),
  `mutation`, `mutation_floor`, `monsters`. There is **no agent-confidence field** — the
  engine never grades the agent.
- **exit 0**: allow the close (all four conditions hold).
- **exit 2**: block the close; the actionable `GOAL_STILL_RED` BlockReason is written to
  stdout.
- A **missing** sensor verdict for a red-set mirror counts as **red** (anti-passthrough).
- An **unparseable** event fails **closed** (block) — an unverifiable Stop does not pass
  (KRD §82).

## The wall

The hook reads the live verdicts from the **injected** event; it never reaches into the
`kernel`/`mirrors`/`fitness` schemas (the agent has no grant). The sensor/mutation/monster
status is fed by the harness and the sensor + mutation runners.

## Fault injection (hook honesty)

`main_test.go` breaks what the gate watches — a surviving red mirror, a broken prior
green, a mutation score below the floor, an injected monster, a missing sensor verdict —
and asserts the gate **blocks** the close (exit 2, `GOAL_STILL_RED`). A hook that never
fires is dead.

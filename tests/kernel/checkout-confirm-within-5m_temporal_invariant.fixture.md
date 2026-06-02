# Mirror — `checkout-confirm-within-5m` (TemporalInvariant statechart fixture)

> `mirrors` schema · reflects: `kernel.truth "checkout-confirm-within-5m"` ·
> test_kind: `fixture` · cert_language: `statechart` · authority: `above` · liveness: `alive`

This is the **materialized** source of the S50 TemporalInvariant statechart mirror
(conceptually stored in the `mirrors` Postgres schema; persisted to Postgres at the
mirror-store step — bootstrap exception, CLAUDE.md §6). The executable proof lives in
`back/kernel/temporal/temporal_fixture_test.go`, which loads exactly this invariant and
these rows; if the intention disappears the test breaks (no silent rot into a monster).

The invariant is the **KRD §49.3 canonical example, verbatim** — the agent invents no
clock, mirror form, tolerance semantics, or property branch beyond the frozen §49.3
vocabulary.

## The temporal invariant

```yaml
temporal_invariant:
  property:   "payment_captured implies order_confirmed within 5 minutes"
  antecedent: payment_captured
  consequent: order_confirmed
  relation:   within
  bound:      5m
  clock:      system
  tolerance:  10s          # the band that prevents a flaky proof
  mirror:     statechart
```

The bound is `5m`; the tolerance widens the **green band** to `5m + 10s` (one-sided — a
deadline is violated only by being LATE, never by being early; ADR 0034).

## The statechart rows (state {invariant, observation} → verdict)

| observation (event_order, elapsed)                    | verdict     | why                                                  |
|-------------------------------------------------------|-------------|------------------------------------------------------|
| `[payment_captured, order_confirmed]`, `4m58s`        | `held`      | comfortably inside the bound                         |
| `[payment_captured, order_confirmed]`, `5m04s`        | `held`      | inside tolerance (5m + 4s ≤ 5m + 10s) — **NOT a flake** |
| `[payment_captured, order_confirmed]`, `5m20s`        | `violated`  | **THE done case** — outside tolerance, the property reddens |
| `[order_confirmed, payment_captured]`, `1m00s`        | `violated`  | confirmation BEFORE capture violates the implication (§49.3 ordre des événements) |

On a `violated` row:

```yaml
block_reason:
  code:       TEMPORAL_INVARIANT_VIOLATED
  severity:   blocking
  how_to_fix:
    - confirm_within_5m_or_compensate   # confirm within the declared deadline, or run the saga compensation
```

## Why this proves the done criterion

The property **reddens on a real violation** (`5m20s` → `violated`) **while** the declared
**tolerance keeps the `5m04s` case green** (no flake). Event order is part of the property
(`order_confirmed` before `payment_captured` → `violated`). `Evaluate` reads **no wall
clock** — the `elapsed` datum is **passed in** via the `Observation` (determinism-first).

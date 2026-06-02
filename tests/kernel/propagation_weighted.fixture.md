# Mirror — `kernel.propagation` "cart-weighted" (weighted, thresholded red propagation)

- **reflects:** `kernel.propagation` ("cart-weighted")
- **test_kind:** `fixture`
- **cert_language:** `fixture`
- **liveness:** `live`
- **authority:** `above` — the §112 rule (a cosmetic change does not redden the parent; a critical
  weight without evidence is rejected) is the **human's** truth, not the agent's.

> Conceptually stored in the `mirrors` Postgres schema; materialized to disk for the runner
> (bootstrap exception, CLAUDE.md §6 — `mirrors` is back-filled at S06). The Go interpreter is
> `back/kernel/propagation/propagation_fixture_test.go`; this file is the **lien porteur** — if its
> intention disappears the test breaks (no silent rot into a monster).

## The worked example (KRD §114)

`view "cart"` composes three controls, with a **declared** `activation_threshold` of `1`:

```
composite view "cart" { activation_threshold: 1 }
composes "cart" -> control "checkout-button" { weight: load-bearing }   # activation 1
composes "cart" -> control "promo-field"     { weight: load-bearing }   # activation 1
composes "cart" -> control "help-link"       { weight: cosmetic }       # activation 0
```

Declared activation tiers (ADR 0018, monotone, never learned):
`cosmetic = 0 < load-bearing = 1 < critical = 2`.

## Rows — `FireParent("cart", changed_children) → verdict`

| # | changed_children | Σ activation | threshold | verdict | why |
|---|---|---|---|---|---|
| A | `{checkout-button}` | 1 | 1 | **RED** | load-bearing change reaches threshold → emergent invariant re-opened |
| B | `{help-link}` | 0 | 1 | **GREEN** | cosmetic change below threshold → parent NOT reddened *(THE done case)* |
| C | `{}` (no change) | 0 | 1 | **GREEN** | nothing changed |
| D | `{help-link, checkout-button}` | 1 | 1 | **RED** | one load-bearing change suffices |

## Rows — `ValidateWeight(link) → accepted | rejected`

| # | weight | weight_evidence | result | block_reason.code | how_to_fix contains |
|---|---|---|---|---|---|
| E | `cosmetic` | *(none)* | **accepted** | — | — |
| F | `load-bearing` | *(none)* | **accepted** | — | — |
| G | `critical` | *(none)* | **rejected** | `CRITICAL_WEIGHT_WITHOUT_EVIDENCE` | `attach_incident_evidence` *(THE done case)* |
| H | `critical` | `INC-2026-014` | **accepted** | — | — |

## Done criteria (computed, never declared — CLAUDE.md §8)

1. Row **B** — `FireParent("cart", {help-link})` returns **GREEN** (a cosmetic change does not
   redden the parent).
2. Row **G** — `ValidateWeight` on a `critical` link with no `weight_evidence` returns **rejected**
   with a `CRITICAL_WEIGHT_WITHOUT_EVIDENCE` `BlockReason` whose `how_to_fix` points at attaching
   incident evidence.

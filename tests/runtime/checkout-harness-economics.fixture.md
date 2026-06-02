# Mirror — checkout-harness-economics (S51)

- **mirrors schema** · `reflects`: `fitness.harness_cost_budget "checkout"` + `runtime.value_case`
- **test_kind**: `fixture`
- **cert_language**: `fixture`
- **authority**: `above` (the budget is the DECLARED bar, above the line; KRD §66.3)
- **materialized runner**: `back/runtime/economics/economics_fixture_test.go`

The done law (KRD §66.3 « l'économie du harnais ») : « plus une contrainte coûte cher
à maintenir, plus elle doit justifier sa valeur ». A truth whose measured harness cost
exceeds its declared `HarnessCostBudget` on any axis WITHOUT a `justified` `ValueCase`
is **flagged** — an actionable advisory `BlockReason` — while the caps are surfaced.
The budget is DECLARED above the line (read here, never authored by the agent, §8).

```
mirror reflects "checkout-harness-economics" {
  budget {                          # DECLARED above the line — read here, never authored
    cell_ref:                 "checkout"
    max_ci_minutes:           10
    max_llm_tokens_per_goal:  50000
    max_mutation_runtime:     "5m"          # 300 seconds
    max_human_review_minutes: 30
    expected_risk_reduction:  "high"
  }

  # within budget on every axis, no ValueCase needed
  given cost { ci_minutes: 8, llm_tokens: 40000, mutation_runtime: "3m", human_review_minutes: 15 }, value_case { none }
    -> verdict == "within_budget"
    -> block_reason == null

  # THE done case — cost exceeds the budget (ci_minutes 18 > 10) and there is NO justified ValueCase
  given cost { ci_minutes: 18, llm_tokens: 40000, mutation_runtime: "3m", human_review_minutes: 15 }, value_case { none }
    -> verdict == "over_budget_flagged"
    -> block_reason.code == "HARNESS_COST_EXCEEDS_BUDGET"
    -> block_reason.how_to_fix contains "open_value_case"

  # the SAME over-budget cost, but the costly truth carries a justified ValueCase ⇒ it earned its keep
  given cost { ci_minutes: 18, llm_tokens: 40000, mutation_runtime: "3m", human_review_minutes: 15 },
        value_case {
          truth: "checkout.payment.idempotent",
          risk_if_broken: high,
          expected_impact: "avoid duplicate capture",
          harness_cost: { ci_minutes: 18, human_review_minutes: 15 },
          decision: justified
        }
    -> verdict == "over_budget_justified"
    -> block_reason == null

  # over budget AND the ValueCase says too_expensive ⇒ still flagged (the spend is not justified)
  given cost { ci_minutes: 18, llm_tokens: 40000, mutation_runtime: "3m", human_review_minutes: 15 },
        value_case { truth: "checkout.payment.idempotent", risk_if_broken: low, decision: too_expensive }
    -> verdict == "over_budget_flagged"
    -> block_reason.code == "HARNESS_COST_EXCEEDS_BUDGET"
}
```

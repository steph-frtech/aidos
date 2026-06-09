# Mirror — checkout-costmeter (S111)

- **mirrors schema** · `reflects`: `runtime.costmeter` against `fitness.harness_cost_budget "checkout"` + `runtime.value_case`
- **test_kind**: `fixture`
- **cert_language**: `fixture`
- **authority**: `above` (the budget is the DECLARED bar, above the line; KRD §66.3)
- **materialized runner**: `back/runtime/costmeter/costmeter_fixture_test.go`

The done law (KRD §66.3 « l'économie du harnais », S111) : chaque cellule DÉCLARE son
`HarnessCostBudget` ; le **compteur** AGRÈGE la consommation des **VRAIS** `AgentRun`
enregistrés (S52, chacun avec son `RunMeter`) — un **COMPTAGE**, jamais une estimation —
et confronte la somme au cap. Une contrainte coûteuse SANS `ValueCase` « justified » est
**signalée** (advisory, jamais bloquée silencieusement). Le signal d'over-budget alimente
le **disjoncteur** (S83). Le budget est DÉCLARÉ au-dessus de la ligne (lu, jamais écrit, §8).

```
mirror reflects "checkout-costmeter" {
  budget {                          # DECLARED above the line — read here, never authored
    cell_ref:                 "checkout"
    max_ci_minutes:           10
    max_llm_tokens_per_goal:  50000
    max_mutation_runtime:     "5m"          # 300 seconds
    max_human_review_minutes: 30
    expected_risk_reduction:  "high"
  }

  # The cell's REAL recorded AgentRuns, each with its RunMeter (BA11) — the COUNTED source.
  given runs [
    { red_work_item: "Order.discount", tokens: 12000, ci_minutes: 2 },
    { red_work_item: "Order.tax",      tokens: 18000, ci_minutes: 3 },
    { red_work_item: "Order.total",    tokens: 8000,  ci_minutes: 1 },
  ], value_case { none }
    -> metered_cost == { llm_tokens: 38000, ci_minutes: 6 }   # the COUNTED sum, never estimated
    -> verdict      == "within_budget"
    -> block_reason == null
    -> disjoncteur.trip == false

  # Add the heavy run → summed tokens (78000) exceed the cap (50000), no value_case (THE done case)
  given runs [ …, { red_work_item: "Order.heavy", tokens: 40000, ci_minutes: 2 } ], value_case { none }
    -> metered_cost.llm_tokens == 78000
    -> verdict      == "over_budget_flagged"          # advisory, NEVER a silent block
    -> block_reason.code == "HARNESS_COST_EXCEEDS_BUDGET"
    -> over_axes ∋ "llm_tokens"
    -> disjoncteur.trip == true                        # the S111 → S83 wire

  # The SAME over-budget metered cost + a value_case{justified} → earned its keep
  given (same over-budget runs), value_case { decision: "justified", risk_if_broken: "critical" }
    -> verdict      == "over_budget_justified"
    -> block_reason == null
    -> disjoncteur.trip == false                       # a justified cost never trips the breaker
}
```

**Reproducibility mirror** (∀, rapid): `back/runtime/costmeter/costmeter_property_test.go` —
determinism (same runs ⇒ same CellMeter ⇒ same verdict), comptage-jamais-estimation (the
metered cost is the exact arithmetic sum), order-independence, advisory-jamais-blocage
(over-budget without justification is ALWAYS flagged), justified-clears-flag, and the
`DisjoncteurSignal.Trip == OverBudget(dec)` S83 wire. TS twin: `front/web/lib/cost-meter.test.ts`
(Vitest + fast-check, 12 pass), law-for-law.

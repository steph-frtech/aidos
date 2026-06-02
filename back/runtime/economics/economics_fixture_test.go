package economics_test

// S51 BDD MIRROR — FIXTURE (state → command → events), conceptually stored in the
// `mirrors` schema (reflects: fitness.harness_cost_budget "checkout-cell" +
// runtime.value_case, test_kind: fixture, cert_language: fixture, authority: above)
// and materialized here for the Go runner. These ARE the done criteria (KRD §66.3):
//
//   given the DECLARED checkout budget (max_ci_minutes 10, max_llm_tokens_per_goal
//   50000, max_mutation_runtime 5m, max_human_review_minutes 30,
//   expected_risk_reduction high):
//     - a cost within every cap + no value_case            ⇒ within_budget, no block_reason
//     - cost ci_minutes 18 (> 10) + NO value_case          ⇒ over_budget_flagged,
//         block_reason.code == HARNESS_COST_EXCEEDS_BUDGET, how_to_fix ∋ open_value_case  (THE done case)
//     - the SAME over-budget cost + value_case{justified}  ⇒ over_budget_justified, no block_reason
//     - the SAME over-budget cost + value_case{too_expensive} ⇒ over_budget_flagged
//
// Materialized source: tests/runtime/checkout-harness-economics.fixture.md.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// checkoutBudget is the DECLARED above-the-line budget for the checkout cell (KRD
// §66.3). It is READ here, never authored — the fixture pins the human's declared bar.
// max_mutation_runtime "5m" = 300 seconds.
var checkoutBudget = economics.HarnessCostBudget{
	CellRef:                  "checkout",
	MaxCIMinutes:             10,
	MaxLLMTokensPerGoal:      50000,
	MaxMutationRuntimeSecond: 300,
	MaxHumanReviewMinutes:    30,
	ExpectedRiskReduction:    economics.RiskHigh,
}

// withinCost is within every cap. overCost exceeds ci_minutes (18 > 10) only.
var (
	withinCost = economics.MeasuredCost{CIMinutes: 8, LLMTokens: 40000, MutationRuntimeSecond: 180, HumanReviewMinutes: 15}
	overCost   = economics.MeasuredCost{CIMinutes: 18, LLMTokens: 40000, MutationRuntimeSecond: 180, HumanReviewMinutes: 15}
)

// fixture row 1: within every cap, no value case ⇒ within_budget, no block_reason.
func TestFixture_WithinBudget_NoValueCase(t *testing.T) {
	got := economics.Evaluate(checkoutBudget, withinCost, nil)
	if got.Verdict != economics.VerdictWithinBudget {
		t.Fatalf("within-budget cost: verdict = %q, want within_budget", got.Verdict)
	}
	if got.BlockReason != nil {
		t.Fatalf("within-budget cost: block_reason = %+v, want nil", got.BlockReason)
	}
	if len(got.OverAxes) != 0 {
		t.Fatalf("within-budget cost: over_axes = %v, want none", got.OverAxes)
	}
}

// fixture row 2 — THE DONE CASE: cost exceeds the budget (ci_minutes 18 > 10) and
// there is NO justified ValueCase ⇒ over_budget_flagged with a
// HARNESS_COST_EXCEEDS_BUDGET BlockReason whose how_to_fix points at open_value_case.
func TestFixture_OverBudget_NoValueCase_Flagged(t *testing.T) {
	got := economics.Evaluate(checkoutBudget, overCost, nil)
	if got.Verdict != economics.VerdictOverBudgetFlagged {
		t.Fatalf("over-budget no value case: verdict = %q, want over_budget_flagged", got.Verdict)
	}
	if got.BlockReason == nil {
		t.Fatal("over-budget no value case: block_reason is nil, want HARNESS_COST_EXCEEDS_BUDGET")
	}
	if got.BlockReason.Code != economics.CodeHarnessCostExceedsBudget {
		t.Fatalf("block_reason.code = %q, want HARNESS_COST_EXCEEDS_BUDGET", got.BlockReason.Code)
	}
	if !containsToken(got.BlockReason.HowToFix, "open_value_case") {
		t.Fatalf("how_to_fix = %v, want a step naming open_value_case", got.BlockReason.HowToFix)
	}
	if len(got.BlockReason.HowToFix) == 0 {
		t.Fatal("how_to_fix is empty — a BlockReason with no fix path is a prison (KRD §44.5)")
	}
	if !contains(got.OverAxes, "ci_minutes") {
		t.Fatalf("over_axes = %v, want ci_minutes", got.OverAxes)
	}
}

// fixture row 3: the SAME over-budget cost, but the costly truth carries a justified
// ValueCase ⇒ over_budget_justified (it earned its keep — the §66.3 rule), no block.
func TestFixture_OverBudget_JustifiedValueCase_Kept(t *testing.T) {
	vc := economics.ValueCase{
		Truth:          "checkout.payment.idempotent",
		RiskIfBroken:   economics.RiskHigh,
		ExpectedImpact: "avoid duplicate capture",
		HarnessCost:    economics.MeasuredCost{CIMinutes: 18, HumanReviewMinutes: 15},
		Decision:       economics.DecisionJustified,
	}
	got := economics.Evaluate(checkoutBudget, overCost, &vc)
	if got.Verdict != economics.VerdictOverBudgetJustified {
		t.Fatalf("over-budget + justified: verdict = %q, want over_budget_justified", got.Verdict)
	}
	if got.BlockReason != nil {
		t.Fatalf("over-budget + justified: block_reason = %+v, want nil (earned its keep)", got.BlockReason)
	}
}

// fixture row 4: over budget AND the ValueCase says too_expensive ⇒ STILL flagged
// (the spend is not justified — only `justified` clears the flag).
func TestFixture_OverBudget_TooExpensive_StillFlagged(t *testing.T) {
	vc := economics.ValueCase{
		Truth:        "checkout.payment.idempotent",
		RiskIfBroken: economics.RiskLow,
		Decision:     economics.DecisionTooExpensive,
	}
	got := economics.Evaluate(checkoutBudget, overCost, &vc)
	if got.Verdict != economics.VerdictOverBudgetFlagged {
		t.Fatalf("over-budget + too_expensive: verdict = %q, want over_budget_flagged", got.Verdict)
	}
	if got.BlockReason == nil || got.BlockReason.Code != economics.CodeHarnessCostExceedsBudget {
		t.Fatalf("over-budget + too_expensive: block_reason = %+v, want HARNESS_COST_EXCEEDS_BUDGET", got.BlockReason)
	}
}

// revisit also does NOT clear the flag (an undecided case is not a justification).
func TestFixture_OverBudget_Revisit_StillFlagged(t *testing.T) {
	vc := economics.ValueCase{Truth: "checkout.payment.idempotent", RiskIfBroken: economics.RiskMedium, Decision: economics.DecisionRevisit}
	got := economics.Evaluate(checkoutBudget, overCost, &vc)
	if got.Verdict != economics.VerdictOverBudgetFlagged {
		t.Fatalf("over-budget + revisit: verdict = %q, want over_budget_flagged", got.Verdict)
	}
}

func contains(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}

func containsToken(xs []string, token string) bool {
	for _, x := range xs {
		if strings.Contains(x, token) {
			return true
		}
	}
	return false
}

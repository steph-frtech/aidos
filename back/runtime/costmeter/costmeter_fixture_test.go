package costmeter_test

// S111 BDD MIRROR — FIXTURE (state → command → events), conceptually stored in the
// `mirrors` schema (reflects: runtime.costmeter against fitness.harness_cost_budget
// "checkout-cell", test_kind: fixture, cert_language: fixture, authority: above) and
// materialized here for the Go runner. These ARE the done criteria (KRD §66.3, S111):
//
//   given the DECLARED checkout budget (max_ci_minutes 10, max_llm_tokens_per_goal 50000,
//   max_mutation_runtime 5m, max_human_review_minutes 30, expected_risk_reduction high)
//   and the REAL recorded AgentRuns of the checkout cell, each paired with its RunMeter:
//
//     - three runs whose summed tokens (12000+18000+8000=38000) and ci-minutes (2+3+1=6)
//       are within every cap                                  ⇒ within_budget, no block_reason,
//         the metered cost is the COUNTED sum (38000 tokens / 6 ci-minutes), NEVER an estimate
//     - the same runs PLUS a heavy run (40000 tokens) so the sum (78000 > 50000) is over,
//       with NO value_case                                    ⇒ over_budget_flagged (advisory),
//         block_reason.code == HARNESS_COST_EXCEEDS_BUDGET, over_axes ∋ llm_tokens,
//         the disjoncteur signal TRIPS (Trip=true) — the S83 circuit-breaker over-budget wire,
//         but it is an ADVISORY, never a silent block  (THE done case)
//     - the SAME over-budget metered cost + value_case{justified} ⇒ over_budget_justified,
//         no block_reason, the disjoncteur signal does NOT trip (a justified cost is earned)
//
// Materialized source: tests/runtime/checkout-costmeter.fixture.md.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/costmeter"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// checkoutBudget is the DECLARED above-the-line budget for the checkout cell (KRD §66.3),
// READ here, never authored. max_mutation_runtime "5m" = 300 seconds.
var checkoutBudget = economics.HarnessCostBudget{
	CellRef:                  "checkout",
	MaxCIMinutes:             10,
	MaxLLMTokensPerGoal:      50000,
	MaxMutationRuntimeSecond: 300,
	MaxHumanReviewMinutes:    30,
	ExpectedRiskReduction:    economics.RiskHigh,
}

// recordedRun records a real AgentRun (S52) for the checkout cell against a red work item,
// paired with the RunMeter (BA11) that measured its consumption. The run is content-addressed
// (Record stamps the id) so the metered cost stays bound to the run that burned it.
func recordedRun(t *testing.T, item string, tokens, ciMinutes int) costmeter.RunCost {
	t.Helper()
	run, err := agentrun.Record(agentrun.AgentRun{
		Agent:       "build-agent@v1",
		Goal:        "goal-checkout",
		RedWorkItem: item,
		ContextPack: "pack-checkout",
		Result:      agentrun.ResultGreen,
		StartedAt:   "2026-06-09T10:00:00Z",
		EndedAt:     "2026-06-09T10:05:00Z",
	})
	if err != nil {
		t.Fatalf("record run %q: %v", item, err)
	}
	return costmeter.RunCost{
		Run:   run,
		Meter: agentimpl.RunMeter{Tokens: tokens, CIMinutes: ciMinutes, Turns: 1, WallClockSecs: 300},
	}
}

// TestFixture_WithinBudget_MeteredFromRealRuns — three real runs, summed cost within every
// cap ⇒ within_budget; the metered cost is the COUNTED sum, never an estimate.
func TestFixture_WithinBudget_MeteredFromRealRuns(t *testing.T) {
	runs := []costmeter.RunCost{
		recordedRun(t, "Order.discount", 12000, 2),
		recordedRun(t, "Order.tax", 18000, 3),
		recordedRun(t, "Order.total", 8000, 1),
	}

	cm, dec := costmeter.MeterCell(checkoutBudget, runs, nil)

	if cm.RunCount != 3 {
		t.Fatalf("run_count: got %d want 3", cm.RunCount)
	}
	// COUNTED sum, never estimated: 12000+18000+8000 tokens, 2+3+1 ci-minutes.
	if cm.Cost.LLMTokens != 38000 {
		t.Fatalf("metered tokens: got %d want 38000 (the COUNTED sum)", cm.Cost.LLMTokens)
	}
	if cm.Cost.CIMinutes != 6 {
		t.Fatalf("metered ci_minutes: got %d want 6 (the COUNTED sum)", cm.Cost.CIMinutes)
	}
	if dec.Verdict != economics.VerdictWithinBudget {
		t.Fatalf("verdict: got %q want within_budget", dec.Verdict)
	}
	if dec.BlockReason != nil {
		t.Fatal("within budget must carry NO block_reason")
	}
	if costmeter.OverBudget(dec) {
		t.Fatal("within budget must not be over-budget (no breaker trip)")
	}
	if sig := costmeter.DisjoncteurSignal(dec); sig.Trip {
		t.Fatal("within-budget disjoncteur signal must NOT trip")
	}
}

// TestFixture_OverBudget_FlaggedAdvisory_TripsDisjoncteur — adding a heavy run pushes the
// summed tokens over the cap; with NO value_case the cell is FLAGGED (advisory) and the S83
// disjoncteur signal TRIPS — but it is an advisory, never a silent block. THE done case.
func TestFixture_OverBudget_FlaggedAdvisory_TripsDisjoncteur(t *testing.T) {
	runs := []costmeter.RunCost{
		recordedRun(t, "Order.discount", 12000, 2),
		recordedRun(t, "Order.tax", 18000, 3),
		recordedRun(t, "Order.total", 8000, 1),
		recordedRun(t, "Order.heavy", 40000, 2), // tips the sum to 78000 > 50000
	}

	cm, dec := costmeter.MeterCell(checkoutBudget, runs, nil)

	if cm.Cost.LLMTokens != 78000 {
		t.Fatalf("metered tokens: got %d want 78000 (the COUNTED sum)", cm.Cost.LLMTokens)
	}
	if dec.Verdict != economics.VerdictOverBudgetFlagged {
		t.Fatalf("verdict: got %q want over_budget_flagged (advisory)", dec.Verdict)
	}
	if dec.BlockReason == nil {
		t.Fatal("over-budget flagged must carry an advisory block_reason")
	}
	if dec.BlockReason.Code != economics.CodeHarnessCostExceedsBudget {
		t.Fatalf("block_reason.code: got %q want HARNESS_COST_EXCEEDS_BUDGET", dec.BlockReason.Code)
	}
	var sawTokens bool
	for _, ax := range dec.OverAxes {
		if ax == "llm_tokens" {
			sawTokens = true
		}
	}
	if !sawTokens {
		t.Fatalf("over_axes must name llm_tokens, got %v", dec.OverAxes)
	}
	// The S83 disjoncteur wire: the cost signal TRIPS the circuit-breaker.
	sig := costmeter.DisjoncteurSignal(dec)
	if !sig.Trip {
		t.Fatal("over-budget flagged disjoncteur signal MUST trip (the S83 wire)")
	}
	if sig.BlockReason == nil {
		t.Fatal("a tripping disjoncteur signal must carry the advisory block_reason")
	}
	if !costmeter.OverBudget(dec) {
		t.Fatal("OverBudget must be true for over_budget_flagged")
	}
}

// TestFixture_OverBudget_Justified_DoesNotTrip — the SAME over-budget metered cost, but a
// value_case{justified} says the costly cell has earned its keep: over_budget_justified, no
// block_reason, the disjoncteur does NOT trip (a justified cost never trips the breaker).
func TestFixture_OverBudget_Justified_DoesNotTrip(t *testing.T) {
	runs := []costmeter.RunCost{
		recordedRun(t, "Order.discount", 12000, 2),
		recordedRun(t, "Order.tax", 18000, 3),
		recordedRun(t, "Order.total", 8000, 1),
		recordedRun(t, "Order.heavy", 40000, 2),
	}
	vc := &economics.ValueCase{
		Truth:          "checkout.invariant",
		RiskIfBroken:   economics.RiskCritical,
		ExpectedImpact: "le checkout protège chaque commande — un faux total facture mal le client",
		Decision:       economics.DecisionJustified,
	}

	_, dec := costmeter.MeterCell(checkoutBudget, runs, vc)

	if dec.Verdict != economics.VerdictOverBudgetJustified {
		t.Fatalf("verdict: got %q want over_budget_justified", dec.Verdict)
	}
	if dec.BlockReason != nil {
		t.Fatal("a justified over-budget cell must carry NO block_reason")
	}
	if costmeter.OverBudget(dec) {
		t.Fatal("a justified over-budget cell must NOT be over-budget (no breaker trip)")
	}
	if sig := costmeter.DisjoncteurSignal(dec); sig.Trip {
		t.Fatal("a justified over-budget disjoncteur signal must NOT trip")
	}
}

// Fixture mirror (N2: state → command → events) for the S83 build-loop service.
//
// Conceptually stored in the `mirrors` schema (reflects: runtime.buildloop.Terminate /
// runtime.buildloop.Drive · test_kind: fixture · cert_language: operation-dsl/go ·
// authority: above) and materialized here for the Go runner (the bootstrap exception,
// CLAUDE.md §6: the mirrors schema persists it from S06; this file IS the red→green proof).
//
// THE done criterion (Godog form): the loop terminates GREEN only when the NON-GAMEABLE Stop
// passes (goal.IsClosed) — red set→green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster.
// A build that spends without advancing STOPS HONESTLY with BUILD_LOOP_NO_PROGRESS, wired to
// the HarnessCostBudget. The engine never reads an agent claim of "done".
package buildloop_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/buildloop"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// redGoal is the canonical red set driven by the loop — two failing mirror refs.
func redGoal() goal.Goal {
	return goal.Goal{
		ID:     "goal-order-checkout",
		RedSet: []string{"Order.checkout.feature", "Order.total.property"},
		Status: goal.StatusOpen,
	}
}

// allGreenStop is the Stop input where the full red set is green and the convergence
// conditions hold — the ONLY state in which the loop may terminate green.
func allGreenStop(g goal.Goal) goal.StopInput {
	sensors := map[string]goal.SensorState{}
	for _, m := range g.RedSet {
		sensors[m] = goal.SensorGreen
	}
	return goal.StopInput{
		Sensors:       sensors,
		PriorGreen:    goal.PriorIntact,
		Mutation:      0.9,
		MutationFloor: 0.7,
	}
}

// TestLoopGreenOnlyWhenNonGameableStopPasses — Scenario: la boucle ne termine vert
// QUE quand le Stop non-gameable passe.
func TestLoopGreenOnlyWhenNonGameableStopPasses(t *testing.T) {
	g := redGoal()

	cases := []struct {
		name string
		stop goal.StopInput
		want buildloop.Verdict
	}{
		{
			name: "every condition holds → green",
			stop: allGreenStop(g),
			want: buildloop.VerdictGreen,
		},
		{
			name: "one red-set mirror still red → not green (continue)",
			stop: func() goal.StopInput {
				s := allGreenStop(g)
				s.Sensors["Order.total.property"] = goal.SensorRed
				return s
			}(),
			want: buildloop.VerdictContinue,
		},
		{
			name: "prior green broken → not green (continue)",
			stop: func() goal.StopInput {
				s := allGreenStop(g)
				s.PriorGreen = goal.PriorBroken
				return s
			}(),
			want: buildloop.VerdictContinue,
		},
		{
			name: "mutation below floor → not green (continue)",
			stop: func() goal.StopInput {
				s := allGreenStop(g)
				s.Mutation = 0.5
				return s
			}(),
			want: buildloop.VerdictContinue,
		},
		{
			name: "a monster present → not green (continue)",
			stop: func() goal.StopInput {
				s := allGreenStop(g)
				s.Monsters = []string{"orphan-mirror-x"}
				return s
			}(),
			want: buildloop.VerdictContinue,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// A short, advancing history so the breaker stays silent — we isolate the Stop.
			h := buildloop.History{
				{DiffHash: "d1", GreenMirrors: []string{"Order.checkout.feature"}},
				{DiffHash: "d2", GreenMirrors: []string{"Order.checkout.feature", "Order.total.property"}},
			}
			dec := buildloop.Terminate(buildloop.TerminationInput{
				Goal:    g,
				Stop:    tc.stop,
				History: h,
				Policy:  buildloop.Policy{MaxIterations: 50, StagnationWindow: 3},
			})
			if dec.Verdict != tc.want {
				t.Fatalf("verdict = %q, want %q", dec.Verdict, tc.want)
			}
			if tc.want == buildloop.VerdictGreen && dec.BlockReason != nil {
				t.Fatalf("green termination must carry no BlockReason, got %v", dec.BlockReason)
			}
		})
	}
}

// TestSpendingWithoutAdvancingStopsHonestly — Scenario: une boucle qui dépense sans
// avancer s'arrête avec BUILD_LOOP_NO_PROGRESS (le disjoncteur déterministe).
func TestSpendingWithoutAdvancingStopsHonestly(t *testing.T) {
	g := redGoal()
	// The red set is NOT yet green (so the green path is closed), and the history stagnates:
	// the last two diffs are byte-identical churn.
	notGreen := goal.StopInput{
		Sensors:    map[string]goal.SensorState{"Order.checkout.feature": goal.SensorGreen, "Order.total.property": goal.SensorRed},
		PriorGreen: goal.PriorIntact,
	}
	stagnant := buildloop.History{
		{DiffHash: "same", GreenMirrors: []string{"Order.checkout.feature"}},
		{DiffHash: "same", GreenMirrors: []string{"Order.checkout.feature"}},
	}
	dec := buildloop.Terminate(buildloop.TerminationInput{
		Goal:    g,
		Stop:    notGreen,
		History: stagnant,
		Policy:  buildloop.Policy{MaxIterations: 50, StagnationWindow: 2},
	})
	if dec.Verdict != buildloop.VerdictNoProgress {
		t.Fatalf("verdict = %q, want no_progress", dec.Verdict)
	}
	if dec.BlockReason == nil || dec.BlockReason.Code != blockreason.CodeBuildLoopNoProgress {
		t.Fatalf("expected BUILD_LOOP_NO_PROGRESS BlockReason, got %v", dec.BlockReason)
	}
	if len(dec.BlockReason.HowToFix) == 0 {
		t.Fatalf("BlockReason must carry a non-empty how_to_fix (a block is never a prison)")
	}
}

// TestOverBudgetStopsHonestlyWiredToHarnessCostBudget — Scenario: une boucle over-budget
// (HarnessCostBudget) s'arrête avec BUILD_LOOP_NO_PROGRESS, câblé au budget S51.
func TestOverBudgetStopsHonestlyWiredToHarnessCostBudget(t *testing.T) {
	g := redGoal()
	notGreen := goal.StopInput{
		Sensors:    map[string]goal.SensorState{"Order.checkout.feature": goal.SensorRed, "Order.total.property": goal.SensorRed},
		PriorGreen: goal.PriorIntact,
	}
	// An ADVANCING history (newly-green each turn) so the structural breaker is silent — the
	// halt must come from the BUDGET, proving the wiring to HarnessCostBudget.
	advancing := buildloop.History{
		{DiffHash: "d1", GreenMirrors: []string{}},
		{DiffHash: "d2", GreenMirrors: []string{"Order.checkout.feature"}},
	}
	budget := economics.HarnessCostBudget{
		CellRef:             "cell-order",
		MaxLLMTokensPerGoal: 1000,
	}
	cost := economics.MeasuredCost{LLMTokens: 5000} // 5× over the token cap

	dec := buildloop.Terminate(buildloop.TerminationInput{
		Goal:    g,
		Stop:    notGreen,
		History: advancing,
		Policy:  buildloop.Policy{MaxIterations: 50, StagnationWindow: 2},
		Budget:  budget,
		Cost:    cost,
	})
	if dec.Verdict != buildloop.VerdictNoProgress {
		t.Fatalf("verdict = %q, want no_progress (over budget)", dec.Verdict)
	}
	if dec.BlockReason == nil || dec.BlockReason.Code != blockreason.CodeBuildLoopNoProgress {
		t.Fatalf("expected BUILD_LOOP_NO_PROGRESS, got %v", dec.BlockReason)
	}
	if len(dec.OverBudgetAxes) == 0 {
		t.Fatalf("budget halt must name the over-budget axes (for the console)")
	}
}

// TestJustifiedValueCaseClearsBudgetHalt — a justified ValueCase clears the over-budget
// flag, so an over-budget-but-justified, still-advancing loop keeps going (continue).
func TestJustifiedValueCaseClearsBudgetHalt(t *testing.T) {
	g := redGoal()
	notGreen := goal.StopInput{
		Sensors:    map[string]goal.SensorState{"Order.checkout.feature": goal.SensorRed, "Order.total.property": goal.SensorRed},
		PriorGreen: goal.PriorIntact,
	}
	advancing := buildloop.History{
		{DiffHash: "d1", GreenMirrors: []string{}},
		{DiffHash: "d2", GreenMirrors: []string{"Order.checkout.feature"}},
	}
	budget := economics.HarnessCostBudget{CellRef: "cell-order", MaxLLMTokensPerGoal: 1000}
	cost := economics.MeasuredCost{LLMTokens: 5000}
	vc := &economics.ValueCase{
		Truth:        "Order.checkout",
		RiskIfBroken: economics.RiskCritical,
		Decision:     economics.DecisionJustified,
	}
	dec := buildloop.Terminate(buildloop.TerminationInput{
		Goal:      g,
		Stop:      notGreen,
		History:   advancing,
		Policy:    buildloop.Policy{MaxIterations: 50, StagnationWindow: 2},
		Budget:    budget,
		Cost:      cost,
		ValueCase: vc,
	})
	if dec.Verdict != buildloop.VerdictContinue {
		t.Fatalf("verdict = %q, want continue (justified over-budget keeps going)", dec.Verdict)
	}
}

// TestMaxIterationsCapStopsHonestly — the declared max-iteration cap stops a non-converging loop.
func TestMaxIterationsCapStopsHonestly(t *testing.T) {
	g := redGoal()
	notGreen := goal.StopInput{
		Sensors:    map[string]goal.SensorState{"Order.checkout.feature": goal.SensorRed, "Order.total.property": goal.SensorRed},
		PriorGreen: goal.PriorIntact,
	}
	// Each turn even makes progress, but the cap is reached.
	h := buildloop.History{
		{DiffHash: "d1", GreenMirrors: []string{}},
		{DiffHash: "d2", GreenMirrors: []string{"Order.checkout.feature"}},
		{DiffHash: "d3", GreenMirrors: []string{"Order.checkout.feature", "extra"}},
	}
	dec := buildloop.Terminate(buildloop.TerminationInput{
		Goal:    g,
		Stop:    notGreen,
		History: h,
		Policy:  buildloop.Policy{MaxIterations: 3, StagnationWindow: 2},
	})
	if dec.Verdict != buildloop.VerdictNoProgress {
		t.Fatalf("verdict = %q, want no_progress (max-iterations cap)", dec.Verdict)
	}
}

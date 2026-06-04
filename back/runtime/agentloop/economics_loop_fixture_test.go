// economics_loop_fixture_test.go — the BA27 fixture mirror (state→command→events), RED
// first. BA27 WIRES the live meter + halt-on-budget into the loop and FEEDS the measured
// cost of the terminated run to economics.Evaluate (S51/S29). These fixtures pin, as
// state→command→events triples:
//
//  1. PRE-CALL HALT (gap G3): a run whose next turn WOULD push the meter past the cap is
//     refused BEFORE that turn starts — it abandons at/BEFORE the cap with Result:abandoned,
//     and the breaching turn's cost NEVER lands in the meter (the loop never crosses a turn
//     beyond the cap). The breaching turn is NOT executed (its sensor effect never lands).
//  2. ECONOMICS FEED: the measured cost of the terminated run is mapped to an
//     economics.MeasuredCost and fed to economics.Evaluate — today an AgentRun never feeds
//     the harness economy; BA27 closes that. A run within its declared HarnessCostBudget
//     evaluates within_budget; a run whose measured cost exceeds the budget without a
//     justified ValueCase evaluates over_budget_flagged.
//
// THE WALL / DETERMINISM (CLAUDE.md §2/§6/§8). The halt is deterministic and PRE-CALL (the
// min() cap, BA11, is authoritative). DriveWithEconomics writes no truth: the economics
// snapshot it returns is a below-the-line diagnostic; raising a cap is a /goal, never an
// edit. Same input ⇒ same (run, economics decision).
package agentloop

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// --- 1. PRE-CALL HALT: a breaching turn never STARTS (gap G3) -------------------------

// A run whose 2nd turn WOULD push the token meter past the cap is halted BEFORE that turn
// executes. The breaching turn's cost never lands in the meter, its sensor effect never
// fires, and the Result is abandoned with the budget BlockReason. The meter stays AT/below
// the cap (the loop never crosses a turn beyond the cap — anti-runaway, proven pre-call).
func TestDrive_PreCallHalt_BreachingTurnNeverStarts(t *testing.T) {
	g := twoMirrorGoal()
	// Cap at 10 tokens. Turn 1 costs 10 (lands EXACTLY at the cap, allowed). Turn 2 costs
	// 10 more → would be 20 > 10 → must be refused BEFORE it starts.
	g.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 10}
	turns := []ScriptedTurn{
		writeTurn("app/a.go", "mirror.a"), // cost 10 → meter 10 (== cap, allowed)
		writeTurn("app/b.go", "mirror.b"), // cost 10 → would breach → never starts
	}
	in := baseInput(g, turns)
	in.Goal = g

	run, meter, err := DriveWithEconomics(in)
	if err != nil {
		t.Fatalf("DriveWithEconomics errored: %v", err)
	}
	if run.Result != agentrun.ResultAbandoned {
		t.Fatalf("pre-call halt must abandon the run, got %q", run.Result)
	}
	// The meter never crosses the cap: it sits AT 10 (the first, within-budget turn), NOT 20.
	if meter.Tokens != 10 {
		t.Fatalf("pre-call halt must keep the meter at/below the cap (10), got %d", meter.Tokens)
	}
	// The first turn executed and flipped mirror.a; the breaching turn's effect never landed
	// (mirror.b stays red), so exactly ONE allowed action plus the breach refusal is recorded.
	if len(run.Actions) != 2 {
		t.Fatalf("want 2 actions (1 allowed + the breach refusal), got %d: %+v", len(run.Actions), run.Actions)
	}
	if !run.Actions[0].Autorisee {
		t.Fatalf("turn 1 (within budget) must be allowed, got %+v", run.Actions[0])
	}
	last := run.Actions[1]
	if last.Autorisee || last.RaisonBlocage == nil || last.RaisonBlocage.Code != "AGENT_BUDGET_EXCEEDED" {
		t.Fatalf("the breach refusal must carry AGENT_BUDGET_EXCEEDED, got %+v", last)
	}
}

// A run that fits entirely within its budget closes green and the meter equals the sum of
// the executed turns' costs (no pre-call halt fires).
func TestDrive_WithinBudget_GreenAndMeterTallied(t *testing.T) {
	g := twoMirrorGoal()
	g.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000}
	turns := []ScriptedTurn{writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")}
	in := baseInput(g, turns)
	in.Goal = g

	run, meter, err := DriveWithEconomics(in)
	if err != nil {
		t.Fatalf("DriveWithEconomics errored: %v", err)
	}
	if run.Result != agentrun.ResultGreen {
		t.Fatalf("within-budget happy path must close green, got %q", run.Result)
	}
	if meter.Tokens != 20 { // two writes × 10 tokens
		t.Fatalf("meter must total the two executed turns' tokens (20), got %d", meter.Tokens)
	}
}

// --- 2. ECONOMICS FEED: the terminated run's measured cost reaches economics.Evaluate ---

// The measured cost of a run within its declared HarnessCostBudget evaluates within_budget.
func TestDriveEconomics_WithinBudget_Evaluates(t *testing.T) {
	g := twoMirrorGoal()
	g.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000}
	turns := []ScriptedTurn{writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")}
	in := baseInput(g, turns)
	in.Goal = g
	// A roomy HarnessCostBudget the 20-token run sits well within.
	in.HarnessBudget = economics.HarnessCostBudget{
		CellRef:               "cell-ba27",
		MaxLLMTokensPerGoal:   1_000,
		MaxCIMinutes:          1_000,
		ExpectedRiskReduction: economics.RiskMedium,
	}

	_, meter, err := DriveWithEconomics(in)
	if err != nil {
		t.Fatalf("DriveWithEconomics errored: %v", err)
	}
	cost := MeasuredCostOf(meter)
	if cost.LLMTokens != meter.Tokens {
		t.Fatalf("MeasuredCostOf must map the token tally to LLMTokens, got %+v vs meter %+v", cost, meter)
	}
	dec := economics.Evaluate(in.HarnessBudget, cost, nil)
	if dec.Verdict != economics.VerdictWithinBudget {
		t.Fatalf("a 20-token run under a 1000-token cap must evaluate within_budget, got %q (axes %v)", dec.Verdict, dec.OverAxes)
	}
}

// A run whose measured cost EXCEEDS a (tighter) CELL HarnessCostBudget with NO justified
// ValueCase evaluates over_budget_flagged — the harness economy now SEES the run's spend.
// The loop ran to completion under its OWN loose budget (in.HarnessBudget); the §66.3
// economics evaluation is taken against the CELL's own, tighter declared budget — a
// separate, read-only diagnostic. This proves the meter reaches economics.Evaluate and is
// judged over budget when the cell's bar is below the run's spend.
func TestDriveEconomics_OverBudget_Flagged(t *testing.T) {
	g := twoMirrorGoal()
	g.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000}
	turns := []ScriptedTurn{writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")}
	in := baseInput(g, turns)
	in.Goal = g
	// A LOOSE loop budget so the loop runs to completion (meter = 20 tokens).
	in.HarnessBudget = economics.HarnessCostBudget{
		CellRef:               "cell-ba27",
		MaxLLMTokensPerGoal:   1_000,
		MaxCIMinutes:          1_000,
		ExpectedRiskReduction: economics.RiskMedium,
	}

	_, meter, err := DriveWithEconomics(in)
	if err != nil {
		t.Fatalf("DriveWithEconomics errored: %v", err)
	}
	if meter.Tokens != 20 {
		t.Fatalf("the run must complete with 20 tokens, got %d", meter.Tokens)
	}
	// The CELL's tighter §66.3 budget: 5 tokens — the 20-token run blows past it.
	cellBudget := economics.HarnessCostBudget{
		CellRef:               "cell-ba27",
		MaxLLMTokensPerGoal:   5,
		MaxCIMinutes:          1_000,
		ExpectedRiskReduction: economics.RiskMedium,
	}
	dec := EvaluateRun(meter, cellBudget, nil)
	if dec.Verdict != economics.VerdictOverBudgetFlagged {
		t.Fatalf("an over-budget run with no justified ValueCase must be over_budget_flagged, got %q", dec.Verdict)
	}
	if dec.BlockReason == nil || dec.BlockReason.Code != economics.CodeHarnessCostExceedsBudget {
		t.Fatalf("over_budget_flagged must carry HARNESS_COST_EXCEEDS_BUDGET, got %+v", dec.BlockReason)
	}
}

// EvaluateRun is the convenience that combines the meter→cost map + economics.Evaluate so
// the loop/panel feeds the terminated run in one call. It must agree with the manual path.
func TestEvaluateRun_AgreesWithManualEvaluate(t *testing.T) {
	meter := agentimpl.RunMeter{Tokens: 20, CIMinutes: 3}
	h := economics.HarnessCostBudget{
		CellRef: "cell-ba27", MaxLLMTokensPerGoal: 1_000, MaxCIMinutes: 1_000,
		ExpectedRiskReduction: economics.RiskLow,
	}
	got := EvaluateRun(meter, h, nil)
	want := economics.Evaluate(h, MeasuredCostOf(meter), nil)
	if got.Verdict != want.Verdict || got.CellRef != want.CellRef {
		t.Fatalf("EvaluateRun must agree with economics.Evaluate over MeasuredCostOf, got %+v want %+v", got, want)
	}
}

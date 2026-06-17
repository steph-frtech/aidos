package costmetersrv

import (
	"context"
	"testing"
)

func bud() budgetIn {
	return budgetIn{
		CellRef:                  "checkout",
		MaxCIMinutes:             10,
		MaxLLMTokensPerGoal:      50000,
		MaxMutationRuntimeSecond: 300,
		MaxHumanReviewMinutes:    30,
		ExpectedRiskReduction:    "high",
	}
}

func withinRuns() []runCostIn {
	return []runCostIn{
		{RedWorkItem: "Order.discount", Tokens: 12000, CIMinutes: 2},
		{RedWorkItem: "Order.tax", Tokens: 18000, CIMinutes: 3},
		{RedWorkItem: "Order.total", Tokens: 8000, CIMinutes: 1},
	}
}

func overRuns() []runCostIn {
	return append(withinRuns(), runCostIn{RedWorkItem: "Order.heavy", Tokens: 40000, CIMinutes: 2})
}

// TOOL 1a: cost_meter_cell counts the real runs and stays within budget.
func TestTool_MeterWithinBudget(t *testing.T) {
	_, out, err := meterTool(context.Background(), nil, meterInput{Budget: bud(), Runs: withinRuns()})
	if err != nil {
		t.Fatal(err)
	}
	if out.RunCount != 3 || out.Tokens != 38000 || out.CIMinutes != 6 {
		t.Fatalf("metered cost must be the COUNTED sum; got %+v", out)
	}
	if out.Verdict != "within_budget" || out.Flagged {
		t.Fatalf("within budget must not be flagged; got %+v", out)
	}
}

// TOOL 1b: cost_meter_cell flags an over-budget cell (advisory, never a silent block).
func TestTool_MeterOverBudgetFlagged(t *testing.T) {
	_, out, err := meterTool(context.Background(), nil, meterInput{Budget: bud(), Runs: overRuns()})
	if err != nil {
		t.Fatal(err)
	}
	if out.Tokens != 78000 {
		t.Fatalf("metered tokens must be the counted sum 78000; got %d", out.Tokens)
	}
	if out.Verdict != "over_budget_flagged" || !out.Flagged || out.BlockCode == "" {
		t.Fatalf("over-budget must be flagged with a code; got %+v", out)
	}
	var sawTokens bool
	for _, ax := range out.OverAxes {
		if ax == "llm_tokens" {
			sawTokens = true
		}
	}
	if !sawTokens {
		t.Fatalf("over_axes must name llm_tokens; got %v", out.OverAxes)
	}
}

// TOOL 1c: a justified value_case clears the flag (earned its keep).
func TestTool_MeterOverBudgetJustified(t *testing.T) {
	_, out, err := meterTool(context.Background(), nil, meterInput{
		Budget:    bud(),
		Runs:      overRuns(),
		ValueCase: &valueCaseIn{Truth: "checkout.inv", RiskIfBroken: "critical", Decision: "justified"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Verdict != "over_budget_justified" || out.Flagged || out.BlockCode != "" {
		t.Fatalf("justified over-budget must clear the flag; got %+v", out)
	}
}

// TOOL 2a: cost_disjoncteur_signal trips on an over-budget cell.
func TestTool_DisjoncteurTrips(t *testing.T) {
	_, out, err := signalTool(context.Background(), nil, meterInput{Budget: bud(), Runs: overRuns()})
	if err != nil {
		t.Fatal(err)
	}
	if !out.Trip || out.BlockCode == "" {
		t.Fatalf("an over-budget cell must trip the disjoncteur; got %+v", out)
	}
}

// TOOL 2b: cost_disjoncteur_signal does NOT trip within budget.
func TestTool_DisjoncteurNoTripWithinBudget(t *testing.T) {
	_, out, err := signalTool(context.Background(), nil, meterInput{Budget: bud(), Runs: withinRuns()})
	if err != nil {
		t.Fatal(err)
	}
	if out.Trip || out.BlockCode != "" {
		t.Fatalf("within budget must not trip; got %+v", out)
	}
}

// TOOL 3: cost_validate_budget rejects a malformed budget.
func TestTool_ValidateBudget(t *testing.T) {
	_, ok, err := validateTool(context.Background(), nil, validateInput{Budget: bud()})
	if err != nil || !ok.Valid {
		t.Fatalf("a well-formed budget must validate; got %+v err %v", ok, err)
	}
	bad := bud()
	bad.ExpectedRiskReduction = "nope"
	_, badOut, err := validateTool(context.Background(), nil, validateInput{Budget: bad})
	if err != nil {
		t.Fatal(err)
	}
	if badOut.Valid || badOut.Error == "" {
		t.Fatalf("an out-of-enum risk must be refused; got %+v", badOut)
	}
}

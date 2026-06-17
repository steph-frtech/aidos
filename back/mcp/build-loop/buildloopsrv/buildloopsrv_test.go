package buildloopsrv

import (
	"context"
	"testing"
)

// The build-loop MCP server is PURE computation (the wall): these tests prove each tool
// computes the termination/no-progress verdict deterministically without any I/O. They
// mirror the S83 done-criterion (green only when the non-gameable Stop passes; a spend-
// without-advancing build halts; over-budget halts wired to the HarnessCostBudget) at the
// MCP boundary.

func TestTerminateToolGreenOnlyWhenStopPasses(t *testing.T) {
	in := terminateInput{
		GoalID:        "goal-x",
		RedSet:        []string{"m1", "m2"},
		GreenSensors:  []string{"m1", "m2"},
		Mutation:      0.9,
		MutationFloor: 0.7,
		History: []iterationIn{
			{DiffHash: "d1", GreenMirrors: []string{"m1"}},
			{DiffHash: "d2", GreenMirrors: []string{"m1", "m2"}},
		},
		MaxIterations:    50,
		StagnationWindow: 3,
	}
	_, out, err := terminate(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("terminate: %v", err)
	}
	if out.Verdict != "green" {
		t.Fatalf("verdict = %q, want green", out.Verdict)
	}
	if out.BlockCode != "" {
		t.Fatalf("green termination carries no block code, got %q", out.BlockCode)
	}
}

func TestTerminateToolSpendWithoutAdvancingHalts(t *testing.T) {
	in := terminateInput{
		GoalID:       "goal-x",
		RedSet:       []string{"m1", "m2"},
		GreenSensors: []string{"m1"},
		History: []iterationIn{
			{DiffHash: "same", GreenMirrors: []string{"m1"}},
			{DiffHash: "same", GreenMirrors: []string{"m1"}},
		},
		MaxIterations:    50,
		StagnationWindow: 2,
	}
	_, out, err := terminate(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("terminate: %v", err)
	}
	if out.Verdict != "no_progress" || out.BlockCode != "BUILD_LOOP_NO_PROGRESS" {
		t.Fatalf("verdict=%q block=%q, want no_progress/BUILD_LOOP_NO_PROGRESS", out.Verdict, out.BlockCode)
	}
}

func TestTerminateToolOverBudgetHaltsWiredToHarnessCostBudget(t *testing.T) {
	in := terminateInput{
		GoalID:       "goal-x",
		RedSet:       []string{"m1", "m2"},
		GreenSensors: nil,
		History: []iterationIn{
			{DiffHash: "d1", GreenMirrors: nil},
			{DiffHash: "d2", GreenMirrors: []string{"m1"}},
		},
		MaxIterations:    50,
		StagnationWindow: 2,
		CellRef:          "cell-x",
		MaxLLMTokens:     1000,
		SpentLLMTokens:   5000,
	}
	_, out, err := terminate(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("terminate: %v", err)
	}
	if out.Verdict != "no_progress" {
		t.Fatalf("verdict = %q, want no_progress (over budget)", out.Verdict)
	}
	found := false
	for _, a := range out.OverBudgetAxes {
		if a == "llm_tokens" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected over-budget axis llm_tokens, got %v", out.OverBudgetAxes)
	}
}

func TestNoProgressTool(t *testing.T) {
	in := noProgressInput{
		History: []iterationIn{
			{DiffHash: "same", GreenMirrors: []string{"m1"}},
			{DiffHash: "same", GreenMirrors: []string{"m1"}},
		},
		StagnationWindow: 2,
	}
	_, out, err := noProgress(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("noProgress: %v", err)
	}
	if !out.NoProgress {
		t.Fatalf("expected no-progress on repeated diff-hash")
	}
}

func TestVerdictsToolClosedSet(t *testing.T) {
	_, out, err := verdicts(context.Background(), nil, struct{}{})
	if err != nil {
		t.Fatalf("verdicts: %v", err)
	}
	want := []string{"continue", "green", "no_progress"}
	if len(out.Verdicts) != len(want) {
		t.Fatalf("verdicts = %v, want %v", out.Verdicts, want)
	}
	for i, v := range want {
		if out.Verdicts[i] != v {
			t.Fatalf("verdicts[%d] = %q, want %q", i, out.Verdicts[i], v)
		}
	}
}

func TestServerBuildsAndRegisters(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("NewServer returned nil")
	}
}

// gate_test.go — BA13: the S04 PreToolUse hook gates a GOVERNED AgentImplementation's
// tool calls through the single composed verdict. This proves the interceptor refuses
// the SAME way agentimpl.GateAction does, in precedence order — the perimeter is closed
// at the hook, not only in unit tests of the enforcers.
package main

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

func governedFixture() GovernedEvent {
	return GovernedEvent{
		Impl: agentimpl.AgentImplementation{
			AllowedPaths:   []string{"app/"},
			ForbiddenPaths: agentimpl.WallForbiddenPaths(),
			Tools:          []agentimpl.ResolvedTool{{Server: "store", Tool: "read"}},
			Skills:         []string{"tdd"},
		},
		Action: agentimpl.Action{
			Target:      "app/main.go",
			Server:      "store",
			Tool:        "read",
			Skill:       "tdd",
			AgentAction: agentimpl.AgentAction{Tool: "bash", Args: []string{"rg", "x"}},
		},
		Meter:        agentimpl.RunMeter{Tokens: 1},
		Harness:      economics.HarnessCostBudget{CellRef: "c", MaxCIMinutes: 100, MaxLLMTokensPerGoal: 1000},
		GoalBudgets:  goal.Budgets{TimeSeconds: 100, Turns: 100, Tokens: 1000},
		RatePerToken: 0.001,
	}
}

func TestEvaluateGoverned_HappyPathAllows(t *testing.T) {
	if d := EvaluateGoverned(governedFixture()); !d.Allowed {
		t.Fatalf("governed happy path must be allowed, got %+v", d)
	}
}

func TestEvaluateGoverned_AboveWaterlineDenied(t *testing.T) {
	ev := governedFixture()
	ev.Impl.AllowedPaths = []string{"back/"}
	ev.Action.Target = "back/kernel/truth.go"
	d := EvaluateGoverned(ev)
	if d.Allowed || d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeAgentWriteAboveWaterline {
		t.Fatalf("governed above-the-line write must be denied at the zone axis, got %+v", d)
	}
}

func TestEvaluateGoverned_UnboundToolDenied(t *testing.T) {
	ev := governedFixture()
	ev.Action.Tool = "delete"
	d := EvaluateGoverned(ev)
	if d.Allowed || d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeAgentToolNotBound {
		t.Fatalf("governed unbound tool must be denied, got %+v", d)
	}
}

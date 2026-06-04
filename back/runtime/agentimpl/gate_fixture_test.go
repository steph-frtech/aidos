// gate_fixture_test.go — the BA13 fixture mirror (RED first). It pins GateAction, the
// SINGLE composed verdict over ALL the declared axes, in the explicit PRECEDENCE the
// roadmap mandates (gap D3):
//
//	Arbitrate (determinism) → zone (Classify deny) → path (PathAllowed allow) →
//	network/exec confinement → capacity (ToolAllowed) → skill (SkillAllowed) →
//	budget (CheckBudget) → hook (HooksSatisfied).
//
// Each fixture is a state→command→event triple: an AgentImplementation + an Action +
// a meter + hook verdicts (the STATE), GateAction (the COMMAND), and the expected
// Decision (the EVENT). Every axis violation returns the CORRECT BlockReason code from
// the SAME gate, in precedence order. This is the "perimeter proven closed" proof.
package agentimpl

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// permissiveImpl is a governed implementation that ALLOWS the canonical happy-path
// action: it grants the app tree, binds the tool + skill, declares no egress/exec, and
// carries the wall in ForbiddenPaths. Each fixture mutates the ONE field its axis tests.
func permissiveImpl() AgentImplementation {
	return AgentImplementation{
		LayerRef:       "couche-agent@deadbeef",
		AllowedPaths:   []string{"app/"},
		ForbiddenPaths: WallForbiddenPaths(),
		Tools:          []ResolvedTool{{Server: "store", Tool: "read"}},
		Skills:         []string{"tdd"},
		Hooks:          nil,
	}
}

// okBudget is a budget/meter pair well within every cap (no breach).
func okBudgetInputs() (RunMeter, economics.HarnessCostBudget, goal.Budgets) {
	m := RunMeter{Tokens: 10, Turns: 1, CIMinutes: 0, WallClockSecs: 1}
	h := economics.HarnessCostBudget{CellRef: "cell-1", MaxCIMinutes: 100, MaxLLMTokensPerGoal: 1000}
	b := goal.Budgets{TimeSeconds: 100, Turns: 100, Tokens: 1000}
	return m, h, b
}

// happyAction is the canonical allowed action: a bound read tool into the app tree, no
// LLM requested, structurally a search (a deterministic tool used as itself — no gap).
func happyAction() Action {
	return Action{
		Target: "app/main.go",
		Server: "store", Tool: "read",
		Skill:        "tdd",
		AgentAction:  AgentAction{Tool: "bash", Args: []string{"rg", "foo"}},
	}
}

func TestGateAction_HappyPath_Allows(t *testing.T) {
	m, h, b := okBudgetInputs()
	d := GateAction(permissiveImpl(), happyAction(), m, h, b, 0.001, nil)
	if !d.Allowed {
		t.Fatalf("happy path must be allowed, got %+v", d)
	}
	if d.BlockReason != nil {
		t.Fatalf("allowed decision must carry no BlockReason, got %+v", d.BlockReason)
	}
}

// Each axis fixture: mutate exactly the field that trips that axis, assert the CORRECT
// code comes back from the SAME gate.
func TestGateAction_EachAxisViolation(t *testing.T) {
	m, h, b := okBudgetInputs()
	rate := 0.001

	cases := []struct {
		name string
		mut  func(*AgentImplementation, *Action, *RunMeter)
		code blockreason.Code
	}{
		{
			name: "determinism gap (LLM requested where deterministic tool exists) — FIRST in precedence",
			mut: func(_ *AgentImplementation, a *Action, _ *RunMeter) {
				// structurally a diff (git diff), but the loop requests the LLM → gap.
				a.AgentAction = AgentAction{Tool: "bash", Args: []string{"git", "diff"}, RequestedLLM: true}
			},
			code: blockreason.CodeAgentDeterminismGap,
		},
		{
			name: "zone — write above the waterline (kernel)",
			mut: func(impl *AgentImplementation, a *Action, _ *RunMeter) {
				// allow the path so confinement does not pre-empt the zone axis
				impl.AllowedPaths = []string{"back/"}
				a.Target = "back/kernel/truth.go"
			},
			code: blockreason.CodeAgentWriteAboveWaterline,
		},
		{
			name: "path — outside AllowedPaths (confinement)",
			mut: func(_ *AgentImplementation, a *Action, _ *RunMeter) {
				a.Target = "etc/passwd"
			},
			code: blockreason.CodeAgentPathNotAllowed,
		},
		{
			name: "egress — undeclared network host",
			mut: func(_ *AgentImplementation, a *Action, _ *RunMeter) {
				a.Host = "evil.example.com"
			},
			code: blockreason.CodeAgentEgressNotAllowed,
		},
		{
			name: "exec — undeclared subprocess",
			mut: func(_ *AgentImplementation, a *Action, _ *RunMeter) {
				a.Exec = "rm -rf /"
			},
			code: blockreason.CodeAgentExecNotAllowed,
		},
		{
			name: "capacity — unbound MCP tool",
			mut: func(_ *AgentImplementation, a *Action, _ *RunMeter) {
				a.Tool = "delete" // store.delete is not bound
			},
			code: blockreason.CodeAgentToolNotBound,
		},
		{
			name: "skill — unbound skill",
			mut: func(_ *AgentImplementation, a *Action, _ *RunMeter) {
				a.Skill = "evolve" // not bound
			},
			code: blockreason.CodeAgentSkillNotBound,
		},
		{
			name: "budget — over the effective cap",
			mut: func(_ *AgentImplementation, _ *Action, mtr *RunMeter) {
				mtr.Tokens = 100000
			},
			code: blockreason.CodeAgentBudgetExceeded,
		},
		{
			name: "hook — mandatory hook skipped",
			mut: func(impl *AgentImplementation, _ *Action, _ *RunMeter) {
				impl.Hooks = []ResolvedHook{{Phase: "PreToolUse", Hook: "wall", Mandatory: true}}
			},
			code: blockreason.CodeAgentMandatoryHookSkipped,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			impl := permissiveImpl()
			act := happyAction()
			meter := m
			tc.mut(&impl, &act, &meter)
			d := GateAction(impl, act, meter, h, b, rate, nil)
			if d.Allowed {
				t.Fatalf("axis %q must be denied, got allowed", tc.name)
			}
			if d.BlockReason == nil {
				t.Fatalf("axis %q denied but BlockReason nil", tc.name)
			}
			if d.BlockReason.Code != tc.code {
				t.Fatalf("axis %q: want code %s, got %s", tc.name, tc.code, d.BlockReason.Code)
			}
			if d.DeniedAxis == "" {
				t.Fatalf("axis %q: DeniedAxis must name the failing axis", tc.name)
			}
		})
	}
}

// PRECEDENCE: when MULTIPLE axes are violated at once, the FIRST in precedence wins. We
// stack a determinism gap + a zone breach + a budget breach; Arbitrate is first, so the
// gap code must come back.
func TestGateAction_PrecedenceArbitrateFirst(t *testing.T) {
	m, h, b := okBudgetInputs()
	impl := permissiveImpl()
	impl.AllowedPaths = []string{"back/"}
	act := happyAction()
	act.AgentAction = AgentAction{Tool: "bash", Args: []string{"git", "diff"}, RequestedLLM: true}
	act.Target = "back/kernel/truth.go" // also a zone breach
	m.Tokens = 100000                   // also a budget breach
	d := GateAction(impl, act, m, h, b, 0.001, nil)
	if d.Allowed || d.BlockReason == nil {
		t.Fatalf("expected a deny, got %+v", d)
	}
	if d.BlockReason.Code != blockreason.CodeAgentDeterminismGap {
		t.Fatalf("Arbitrate is first in precedence: want %s, got %s", blockreason.CodeAgentDeterminismGap, d.BlockReason.Code)
	}
}

// PRECEDENCE: zone (deny-list) is checked before path (allow-list). A kernel write
// inside the AllowedPaths still trips the zone axis, not the path axis.
func TestGateAction_ZoneBeforePath(t *testing.T) {
	m, h, b := okBudgetInputs()
	impl := permissiveImpl()
	impl.AllowedPaths = []string{"back/"} // covers back/kernel/, so PathAllowed would pass
	act := happyAction()
	act.Target = "back/kernel/truth.go"
	d := GateAction(impl, act, m, h, b, 0.001, nil)
	if d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeAgentWriteAboveWaterline {
		t.Fatalf("zone must precede path: want %s, got %+v", blockreason.CodeAgentWriteAboveWaterline, d.BlockReason)
	}
}

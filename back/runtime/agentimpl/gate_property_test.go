// gate_property_test.go — the BA13 reproducibility mirror (determinism-first, §6/§8).
// GateAction is a PURE, TOTAL function: same (impl, action, meter, budgets, rate,
// verdicts) ⇒ same Decision, with no DB / clock / rng / I/O / live LLM. These rapid
// properties pin that, plus the structural invariants of the composed gate:
//   - reproducibility: identical input ⇒ identical Decision (twice);
//   - totality: GateAction never panics on arbitrary input;
//   - DeniedAxis ∈ PrecedenceAxes ⇔ denied; empty ⇔ allowed;
//   - precedence: Arbitrate (determinism) is always FIRST — a determinism gap dominates
//     every other simultaneous violation.
package agentimpl

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"pgregory.net/rapid"
)

// genAction draws an arbitrary Action shape across the axes the gate reads.
func genAction(t *rapid.T) Action {
	tools := []string{"", "bash", "git", "rg", "aidos", "weird"}
	args := rapid.SliceOfN(rapid.SampledFrom([]string{"diff", "fmt", "rg", "x", "project"}), 0, 3).Draw(t, "args")
	return Action{
		AgentAction: AgentAction{
			Tool:         rapid.SampledFrom(tools).Draw(t, "tool"),
			Args:         args,
			RequestedLLM: rapid.Bool().Draw(t, "llm"),
		},
		Target: rapid.SampledFrom([]string{"", "app/x.go", "back/kernel/t.go", "etc/x", "kernel"}).Draw(t, "target"),
		Server: rapid.SampledFrom([]string{"", "store", "other"}).Draw(t, "server"),
		Tool:   rapid.SampledFrom([]string{"", "read", "delete"}).Draw(t, "mcptool"),
		Skill:  rapid.SampledFrom([]string{"", "tdd", "evolve"}).Draw(t, "skill"),
		Host:   rapid.SampledFrom([]string{"", "ok.host", "evil.host"}).Draw(t, "host"),
		Exec:   rapid.SampledFrom([]string{"", "ls", "rm -rf /"}).Draw(t, "exec"),
	}
}

func genImpl(t *rapid.T) AgentImplementation {
	return AgentImplementation{
		AllowedPaths:        rapid.SliceOfN(rapid.SampledFrom([]string{"app/", "back/", "src/"}), 0, 2).Draw(t, "allow"),
		ForbiddenPaths:      WallForbiddenPaths(),
		Tools:               []ResolvedTool{{Server: "store", Tool: "read"}},
		Skills:              []string{"tdd"},
		AllowedNetworkHosts: rapid.SliceOfN(rapid.SampledFrom([]string{"ok.host"}), 0, 1).Draw(t, "hosts"),
		AllowedExec:         rapid.SliceOfN(rapid.SampledFrom([]string{"ls"}), 0, 1).Draw(t, "exec"),
	}
}

func genBudgetInputs(t *rapid.T) (RunMeter, economics.HarnessCostBudget, goal.Budgets) {
	m := RunMeter{Tokens: rapid.IntRange(0, 1000000).Draw(t, "mtok")}
	h := economics.HarnessCostBudget{CellRef: "c", MaxCIMinutes: 100, MaxLLMTokensPerGoal: 1000}
	b := goal.Budgets{TimeSeconds: 100, Turns: 100, Tokens: 1000}
	return m, h, b
}

// axisSet is the set of valid axis names, for the membership invariant.
var axisSet = func() map[string]bool {
	s := map[string]bool{}
	for _, a := range PrecedenceAxes {
		s[a] = true
	}
	return s
}()

func TestGateAction_Reproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := genImpl(rt)
		act := genAction(rt)
		m, h, b := genBudgetInputs(rt)
		d1 := GateAction(impl, act, m, h, b, 0.001, nil)
		d2 := GateAction(impl, act, m, h, b, 0.001, nil)
		if d1.Allowed != d2.Allowed || d1.DeniedAxis != d2.DeniedAxis {
			rt.Fatalf("GateAction not reproducible: %+v vs %+v", d1, d2)
		}
		if (d1.BlockReason == nil) != (d2.BlockReason == nil) {
			rt.Fatalf("BlockReason presence not reproducible")
		}
		if d1.BlockReason != nil && d1.BlockReason.Code != d2.BlockReason.Code {
			rt.Fatalf("BlockReason code not reproducible: %s vs %s", d1.BlockReason.Code, d2.BlockReason.Code)
		}
	})
}

func TestGateAction_TotalAndAxisConsistent(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := genImpl(rt)
		act := genAction(rt)
		m, h, b := genBudgetInputs(rt)
		d := GateAction(impl, act, m, h, b, 0.001, nil) // must not panic (totality)

		if d.Allowed {
			if d.DeniedAxis != "" || d.BlockReason != nil {
				rt.Fatalf("allowed decision must carry no axis/reason: %+v", d)
			}
		} else {
			if !axisSet[d.DeniedAxis] {
				rt.Fatalf("denied axis %q not in PrecedenceAxes", d.DeniedAxis)
			}
			if d.BlockReason == nil {
				rt.Fatalf("denied decision must carry a BlockReason")
			}
		}
	})
}

// Precedence: whenever the action is a determinism gap (a deterministic tool exists yet
// the LLM is requested), GateAction returns AGENT_DETERMINISM_GAP regardless of any
// other simultaneous violation — Arbitrate is first.
func TestGateAction_DeterminismGapDominates(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := genImpl(rt)
		act := genAction(rt)
		// force a structural determinism gap.
		act.AgentAction = AgentAction{Tool: "bash", Args: []string{"git", "diff"}, RequestedLLM: true}
		m, h, b := genBudgetInputs(rt)
		d := GateAction(impl, act, m, h, b, 0.001, nil)
		if d.Allowed || d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeAgentDeterminismGap {
			rt.Fatalf("determinism gap must dominate every other axis, got %+v", d)
		}
		if d.DeniedAxis != AxisDeterminism {
			rt.Fatalf("denied axis must be %q, got %q", AxisDeterminism, d.DeniedAxis)
		}
	})
}

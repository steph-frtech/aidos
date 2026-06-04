// runtosignal_property_test.go — the BA30 reproducibility + invariant + HONESTY mirror (∀),
// determinism-first (CLAUDE.md §6/§8). These rapid properties pin the gateway RunToSignal +
// identity-by-pattern (gap I1/I2):
//
//   - REPRODUCIBLE: identical (run, thresholds) ⇒ identical (PatternSignal, ok), twice (no
//     clock, no rng, no I/O, no LLM).
//   - FAILED/ABANDONED ⇒ SIGNAL: any still_red/abandoned/blocked run ALWAYS produces a signal
//     (ok=true) — reality always gets the on-ramp from a failure.
//   - ORDINARY GREEN ⇒ NO SIGNAL: a green run with no refusals and a disabled hollow-detector
//     yields (_, false) — no signal invented.
//   - HOLLOW GREEN ⇒ LOW-SEVERITY SIGNAL: a green run with refusals ≥ the declared threshold
//     produces a LOW-severity signal (gap I1).
//   - TAINT (HONESTY): every produced signal's ObserveInput carries incident_derived — it is
//     reality, never truth.
//   - IDENTITY-BY-PATTERN (gap I2): two DISTINCT runs (different ids/goals) sharing a failure
//     pattern produce the SAME reality incident id — so Recurrence can climb. Two runs of
//     DIFFERENT patterns produce DIFFERENT incident ids.
//   - WALL (HONESTY): the CauseSketch is a hypothesis (it never asserts the kernel "is" wrong);
//     ToKernel still refuses the incident the gateway feeds — the gateway declares no truth.
package agentloop

import (
	"reflect"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/reality"
	"pgregory.net/rapid"
)

// genResult draws any of the four closed results.
func genResult(t *rapid.T) agentrun.Result {
	return rapid.SampledFrom(agentrun.Results()).Draw(t, "result")
}

// recordRun is a helper that records a run with the given result + actions (deterministic ids).
func recordRun(t *rapid.T, result agentrun.Result, actions []agentrun.AgentAction, goal string) agentrun.AgentRun {
	run, err := agentrun.Record(agentrun.AgentRun{
		Agent: "a@v1", Goal: goal, RedWorkItem: "r", ContextPack: "p",
		Actions: actions, Result: result,
		StartedAt: "2026-06-04T18:00:00Z", EndedAt: "2026-06-04T18:05:00Z",
	})
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	return run
}

// refusedWrite is a wall-refused above-the-waterline write carrying the given code.
func refusedWrite(code blockreason.Code, target string) agentrun.AgentAction {
	br := blockreason.For(code)
	return agentrun.AgentAction{
		Type: agentrun.ActionWrite, Cible: target, Autorisee: false, RaisonBlocage: &br,
	}
}

func TestProp_RunToSignal_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		result := genResult(t)
		n := rapid.IntRange(0, 5).Draw(t, "n-refusals")
		actions := make([]agentrun.AgentAction, 0, n)
		for i := 0; i < n; i++ {
			actions = append(actions, refusedWrite(blockreason.CodeAgentWriteAboveWaterline, "kernel.operation"))
		}
		run := recordRun(t, result, actions, "g")
		th := SignalThresholds{ThrashRefusals: rapid.IntRange(0, 5).Draw(t, "th")}
		s1, ok1 := RunToSignal(run, th)
		s2, ok2 := RunToSignal(run, th)
		if ok1 != ok2 || !reflect.DeepEqual(s1, s2) {
			t.Fatalf("RunToSignal must be reproducible: %+v/%v vs %+v/%v", s1, ok1, s2, ok2)
		}
	})
}

func TestProp_FailedOrAbandoned_AlwaysSignals(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		result := rapid.SampledFrom([]agentrun.Result{
			agentrun.ResultStillRed, agentrun.ResultAbandoned, agentrun.ResultBlocked,
		}).Draw(t, "failing-result")
		run := recordRun(t, result, nil, "g")
		_, ok := RunToSignal(run, DefaultThresholds())
		if !ok {
			t.Fatalf("a %s run must always produce a signal", result)
		}
	})
}

func TestProp_OrdinaryGreen_NoSignal(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// a green run with NO refusals, hollow-detector disabled (ThrashRefusals=0).
		run := recordRun(t, agentrun.ResultGreen, nil, "g")
		_, ok := RunToSignal(run, SignalThresholds{ThrashRefusals: 0})
		if ok {
			t.Fatalf("an ordinary green run must produce NO signal")
		}
	})
}

func TestProp_HollowGreen_LowSeverity(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		th := SignalThresholds{ThrashRefusals: rapid.IntRange(1, 4).Draw(t, "th")}
		n := th.ThrashRefusals + rapid.IntRange(0, 3).Draw(t, "extra")
		actions := make([]agentrun.AgentAction, 0, n)
		for i := 0; i < n; i++ {
			actions = append(actions, refusedWrite(blockreason.CodeAgentWriteAboveWaterline, "kernel.operation"))
		}
		run := recordRun(t, agentrun.ResultGreen, actions, "g")
		ps, ok := RunToSignal(run, th)
		if !ok {
			t.Fatalf("a green run with %d refusals (≥ %d) must signal", n, th.ThrashRefusals)
		}
		if ps.Class != ClassGreenHollow {
			t.Fatalf("class must be green_hollow, got %q", ps.Class)
		}
		if ps.Severity != SeverityLow {
			t.Fatalf("hollow-green severity must be low, got %q", ps.Severity)
		}
	})
}

func TestProp_EverySignal_CarriesIncidentDerivedTaint(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		result := rapid.SampledFrom([]agentrun.Result{
			agentrun.ResultStillRed, agentrun.ResultAbandoned, agentrun.ResultBlocked,
		}).Draw(t, "failing-result")
		run := recordRun(t, result, nil, "g")
		ps, ok := RunToSignal(run, DefaultThresholds())
		if !ok {
			t.Fatalf("expected a signal")
		}
		in := ps.ToObserveInput()
		found := false
		for _, tt := range in.Taint {
			if tt == firewall.TaintIncidentDerived {
				found = true
			}
		}
		if !found {
			t.Fatalf("every signal must carry incident_derived taint, got %+v", in.Taint)
		}
	})
}

func TestProp_IdentityByPattern_TwoRunsSamePatternCollapse(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Two runs that DIFFER in goal (and thus in run id) but share a failure pattern:
		// both still_red with the same dominant refusal code.
		code := rapid.SampledFrom([]blockreason.Code{
			blockreason.CodeAgentWriteAboveWaterline, blockreason.CodeAgentDeterminismGap,
		}).Draw(t, "code")
		a := recordRun(t, agentrun.ResultStillRed, []agentrun.AgentAction{refusedWrite(code, "kernel.operation")}, "goalA")
		b := recordRun(t, agentrun.ResultStillRed, []agentrun.AgentAction{refusedWrite(code, "kernel.entity")}, "goalB")
		if a.ID == b.ID {
			t.Skip("runs happened to be identical; not a distinct-run case")
		}
		psA, okA := RunToSignal(a, DefaultThresholds())
		psB, okB := RunToSignal(b, DefaultThresholds())
		if !okA || !okB {
			t.Fatalf("both runs must signal")
		}
		if psA.Pattern != psB.Pattern {
			t.Fatalf("same failure mode must yield the SAME pattern: %q vs %q", psA.Pattern, psB.Pattern)
		}
		incA, err := reality.Observe(psA.ToObserveInput())
		if err != nil {
			t.Fatalf("Observe A: %v", err)
		}
		incB, err := reality.Observe(psB.ToObserveInput())
		if err != nil {
			t.Fatalf("Observe B: %v", err)
		}
		// IDENTITY-BY-PATTERN: two distinct runs of the same pattern ⇒ the SAME incident id, so
		// reality.Observe re-observes the same identity and Recurrence can climb (gap I2).
		if incA.ID != incB.ID {
			t.Fatalf("two runs of the same pattern must produce the SAME incident id: %q vs %q", incA.ID, incB.ID)
		}
	})
}

func TestProp_IdentityByPattern_DifferentPatternsDiffer(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// A still_red run vs an abandoned run: different failure classes ⇒ different patterns.
		a := recordRun(t, agentrun.ResultStillRed, nil, "g")
		b := recordRun(t, agentrun.ResultAbandoned, nil, "g")
		psA, _ := RunToSignal(a, DefaultThresholds())
		psB, _ := RunToSignal(b, DefaultThresholds())
		if psA.Pattern == psB.Pattern {
			t.Fatalf("different failure classes must yield different patterns")
		}
		incA, _ := reality.Observe(psA.ToObserveInput())
		incB, _ := reality.Observe(psB.ToObserveInput())
		if incA.ID == incB.ID {
			t.Fatalf("different patterns must produce different incident ids")
		}
	})
}

func TestProp_Honesty_CauseSketchIsHypothesisAndKernelRefuses(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		run := recordRun(t, agentrun.ResultStillRed, nil, "g")
		ps, ok := RunToSignal(run, DefaultThresholds())
		if !ok {
			t.Fatalf("expected a signal")
		}
		// The cause sketch is a HYPOTHESIS, never an asserted truth.
		if !strings.Contains(ps.CauseSketch, "HYPOTHESIS") {
			t.Fatalf("cause sketch must be flagged as a hypothesis, got %q", ps.CauseSketch)
		}
		// The gateway declares NO truth: the incident it feeds is still refused at the kernel.
		inc, err := reality.Observe(ps.ToObserveInput())
		if err != nil {
			t.Fatalf("Observe: %v", err)
		}
		if br := reality.ToKernel(inc); br == nil || br.Code != blockreason.CodeRealityCannotDeclareTruth {
			t.Fatalf("the incident must still be refused at the kernel (no truth declared), got %+v", br)
		}
	})
}

// runtosignal_fixture_test.go — the BA30 fixture mirror (N2): state → command → events for
// the canonical gateway cases. The COMMAND is RunToSignal(run) → ToObserveInput → reality
// .Observe; the EVENTS are the (signal, ok), the pattern, the severity, and whether the
// incident collapses with a sibling run. This is the BEHAVIOUR spec (Mandat A): every canonical
// shape is a fixture row. It is a MEANS-test toward the human/reality red, not a new truth.
//
// mirror record: reflects=runtime.agent_run "run_to_signal" · test_kind=fixture ·
// cert_language=fixture · authority=above · liveness=alive.
package agentloop

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/reality"
)

func mk(t *testing.T, result agentrun.Result, actions []agentrun.AgentAction, goal string) agentrun.AgentRun {
	t.Helper()
	run, err := agentrun.Record(agentrun.AgentRun{
		Agent: "builder@v1", Goal: goal, RedWorkItem: "S99.r1", ContextPack: "pack",
		Actions: actions, Result: result,
		StartedAt: "2026-06-04T18:00:00Z", EndedAt: "2026-06-04T18:05:00Z",
	})
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	return run
}

func refused(t *testing.T, code blockreason.Code, target string) agentrun.AgentAction {
	t.Helper()
	br := blockreason.For(code)
	return agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: target, Autorisee: false, RaisonBlocage: &br}
}

// Row 1 — given a still_red run (budget epuisé, goal unmet), when RunToSignal ⇒ a HIGH-severity
// signal whose ObserveInput carries incident_derived and is refused at the kernel.
func TestFixture_StillRed_ProducesHighSignal(t *testing.T) {
	run := mk(t, agentrun.ResultStillRed, nil, "S99")
	ps, ok := RunToSignal(run, DefaultThresholds())
	if !ok {
		t.Fatalf("still_red must signal")
	}
	if ps.Severity != SeverityHigh {
		t.Fatalf("still_red severity must be high, got %q", ps.Severity)
	}
	if ps.Class != ClassStillRed {
		t.Fatalf("class must be still_red, got %q", ps.Class)
	}
	inc, err := reality.Observe(ps.ToObserveInput())
	if err != nil {
		t.Fatalf("Observe: %v", err)
	}
	if br := reality.ToKernel(inc); br == nil {
		t.Fatalf("the incident must be refused at the kernel")
	}
}

// Row 2 — given an abandoned run (budget axis breached), when RunToSignal ⇒ HIGH signal of
// class abandoned, distinct pattern from still_red.
func TestFixture_Abandoned_ProducesAbandonedPattern(t *testing.T) {
	abandoned := mk(t, agentrun.ResultAbandoned, nil, "S99")
	stillRed := mk(t, agentrun.ResultStillRed, nil, "S99")
	pa, _ := RunToSignal(abandoned, DefaultThresholds())
	ps, _ := RunToSignal(stillRed, DefaultThresholds())
	if pa.Class != ClassAbandoned {
		t.Fatalf("class must be abandoned, got %q", pa.Class)
	}
	if pa.Pattern == ps.Pattern {
		t.Fatalf("abandoned and still_red must be different patterns")
	}
}

// Row 3 — given a green run with a recurring wall-refusal pattern (thrashing), when RunToSignal
// with the declared threshold ⇒ a LOW-severity hollow-green signal (gap I1).
func TestFixture_GreenHollow_Thrashing_ProducesLowSignal(t *testing.T) {
	actions := []agentrun.AgentAction{
		refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel.operation"),
		refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel.entity"),
		refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel.policy"),
	}
	run := mk(t, agentrun.ResultGreen, actions, "S99")
	ps, ok := RunToSignal(run, SignalThresholds{ThrashRefusals: 3})
	if !ok {
		t.Fatalf("a green run thrashing against the wall must signal")
	}
	if ps.Severity != SeverityLow || ps.Class != ClassGreenHollow {
		t.Fatalf("expected low/green_hollow, got %q/%q", ps.Severity, ps.Class)
	}
}

// Row 4 — given a green run with a determinism-gap refusal (an Arbitrate→LLMGated surfacing),
// when RunToSignal ⇒ a LOW signal even below the thrash threshold (gap I1: determinism gap).
func TestFixture_GreenHollow_DeterminismGap_ProducesLowSignal(t *testing.T) {
	run := mk(t, agentrun.ResultGreen, []agentrun.AgentAction{
		refused(t, blockreason.CodeAgentDeterminismGap, "back/gen/x.go"),
	}, "S99")
	ps, ok := RunToSignal(run, SignalThresholds{ThrashRefusals: 99}) // count never trips
	if !ok {
		t.Fatalf("a green run surfacing a determinism gap must signal")
	}
	if ps.Severity != SeverityLow {
		t.Fatalf("determinism-gap hollow severity must be low, got %q", ps.Severity)
	}
}

// Row 5 — given an ordinary green run (no refusals), when RunToSignal ⇒ (_, false): NO signal
// invented (the gateway never fabricates an incident for a clean success).
func TestFixture_OrdinaryGreen_NoSignal(t *testing.T) {
	run := mk(t, agentrun.ResultGreen, []agentrun.AgentAction{
		{Type: agentrun.ActionWrite, Cible: "back/gen/ok.go", Autorisee: true},
	}, "S99")
	if _, ok := RunToSignal(run, DefaultThresholds()); ok {
		t.Fatalf("an ordinary green run must produce NO signal")
	}
}

// Row 6 — RECURRENCE BY PATTERN (gap I2): two DISTINCT runs (different goals ⇒ different run
// ids) sharing a failure mode collapse into ONE incident; reality.Observe re-observing the same
// identity is what lets Recurrence climb (here proven by id-equality, the precondition).
func TestFixture_Recurrence_TwoRunsCollapse(t *testing.T) {
	a := mk(t, agentrun.ResultStillRed,
		[]agentrun.AgentAction{refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel.operation")}, "goalA")
	b := mk(t, agentrun.ResultStillRed,
		[]agentrun.AgentAction{refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel.entity")}, "goalB")
	if a.ID == b.ID {
		t.Fatalf("precondition: runs must be distinct")
	}
	pa, _ := RunToSignal(a, DefaultThresholds())
	pb, _ := RunToSignal(b, DefaultThresholds())
	incA, _ := reality.Observe(pa.ToObserveInput())
	incB, _ := reality.Observe(pb.ToObserveInput())
	if incA.ID != incB.ID {
		t.Fatalf("two distinct runs of the same pattern must collapse to one incident id")
	}
}

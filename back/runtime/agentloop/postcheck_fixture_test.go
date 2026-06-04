// postcheck_fixture_test.go — the BA16 fixture mirror (state→command→events), RED first.
// It pins the deterministic POST-CHECK per action NATURE, driven through Drive (the loop
// shell that re-checks EVERY action AFTER it runs). Each fixture is a state→command→event
// triple: a DriveInput (the STATE), Drive (the COMMAND), and the expected AgentRun (the
// EVENTS — the per-action acceptance verdicts + the computed Result).
package agentloop

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// proposeTurn is a well-formed propose: a non-empty target, NO sensor flip (a proposal is a
// hypothesis, not a truth) — the shape post-check accepts it.
func proposeTurn(target string) ScriptedTurn {
	return ScriptedTurn{
		Action:  agentimpl.Action{AgentAction: agentimpl.AgentAction{Tool: "propose", Args: []string{target}, RequestedLLM: true}},
		Body:    agentrun.AgentAction{Type: agentrun.ActionPropose, Cible: target},
		Cost:    agentimpl.RunDelta{Tokens: 5, Turns: 1, WallClockSecs: 1},
		Effects: nil,
	}
}

// readTurn is a no-op read: NO sensor flip. The no-op post-check accepts it.
func readTurn(target string) ScriptedTurn {
	return ScriptedTurn{
		Action:  agentimpl.Action{AgentAction: agentimpl.AgentAction{Tool: "read", Args: []string{target}}},
		Body:    agentrun.AgentAction{Type: agentrun.ActionRead, Cible: target},
		Cost:    agentimpl.RunDelta{Tokens: 1, Turns: 1, WallClockSecs: 0},
		Effects: nil,
	}
}

// --- write/run_mirror: the mirror is the judge ----------------------------------------

// A code-changing write whose claimed flip the SENSOR CONFIRMS (Observed nil ⇒ verbatim) is
// accepted; the goal closes green.
func TestPostCheck_CodeAction_MirrorConfirms_Accepted(t *testing.T) {
	g := twoMirrorGoal()
	turns := []ScriptedTurn{writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")}
	run, err := Drive(baseInput(g, turns))
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if run.Result != agentrun.ResultGreen {
		t.Fatalf("mirror-confirmed writes must close green, got %q", run.Result)
	}
	if !run.Actions[0].Autorisee || !run.Actions[1].Autorisee {
		t.Fatalf("mirror-confirmed writes must be accepted, got %+v", run.Actions)
	}
}

// A code-changing write that CLAIMS a flip the SENSOR DISAGREES with is REJECTED by the
// post-check — recorded Autorisee:false with AGENT_POSTCHECK_FAILED, the effect never lands,
// the goal stays red. The agent's claimed confidence cannot close the goal (§8).
func TestPostCheck_CodeAction_MirrorDisagrees_Rejected(t *testing.T) {
	g := twoMirrorGoal()
	lying := writeTurn("app/a.go", "mirror.a")
	lying.Observed = []SensorEffect{{Mirror: "mirror.a", State: goal.SensorRed}} // sensor still red
	turns := []ScriptedTurn{lying, writeTurn("app/b.go", "mirror.b")}
	run, err := Drive(baseInput(g, turns))
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	a0 := run.Actions[0]
	if a0.Autorisee {
		t.Fatalf("a claimed flip the sensor reads red must be rejected, got %+v", a0)
	}
	if a0.RaisonBlocage == nil || a0.RaisonBlocage.Code != blockreason.CodeAgentPostCheckFailed {
		t.Fatalf("post-check refusal must carry AGENT_POSTCHECK_FAILED, got %+v", a0.RaisonBlocage)
	}
	if run.Result != agentrun.ResultStillRed {
		t.Fatalf("with mirror.a never confirmed, the goal stays red, got %q", run.Result)
	}
}

// --- propose: a shape-check; the proposal is a hypothesis, never a truth --------------

// A well-formed propose (non-empty target, no sensor flip) is accepted by the shape check —
// but it lands NO sensor flip (a proposal never closes the goal directly).
func TestPostCheck_Propose_WellFormed_AcceptedNoFlip(t *testing.T) {
	g := twoMirrorGoal()
	turns := []ScriptedTurn{proposeTurn("idea: extract validator"), writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")}
	run, err := Drive(baseInput(g, turns))
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if !run.Actions[0].Autorisee {
		t.Fatalf("a well-formed propose must be accepted by the shape check, got %+v", run.Actions[0])
	}
	if run.Actions[0].Type != agentrun.ActionPropose {
		t.Fatalf("first action must be a propose, got %q", run.Actions[0].Type)
	}
	// The goal still closes via the two writes (the propose contributed no flip).
	if run.Result != agentrun.ResultGreen {
		t.Fatalf("the two confirmed writes must still close the goal, got %q", run.Result)
	}
}

// A malformed propose (a sensor flip — a proposal overstepping into a truth) is REJECTED.
func TestPostCheck_Propose_WithSensorFlip_Rejected(t *testing.T) {
	g := twoMirrorGoal()
	bad := proposeTurn("idea")
	bad.Effects = []SensorEffect{{Mirror: "mirror.a", State: goal.SensorGreen}} // a proposal is not a truth
	run, err := Drive(baseInput(g, []ScriptedTurn{bad}))
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if run.Actions[0].Autorisee {
		t.Fatalf("a propose that tries to flip a sensor must be rejected, got %+v", run.Actions[0])
	}
	if run.Actions[0].RaisonBlocage == nil || run.Actions[0].RaisonBlocage.Code != blockreason.CodeAgentPostCheckFailed {
		t.Fatalf("rejected propose must carry AGENT_POSTCHECK_FAILED, got %+v", run.Actions[0].RaisonBlocage)
	}
}

// --- read: a no-op assertion -----------------------------------------------------------

// A clean read (no sensor flip) is accepted; it lands no side effect.
func TestPostCheck_Read_NoOp_Accepted(t *testing.T) {
	g := twoMirrorGoal()
	turns := []ScriptedTurn{readTurn("app/a.go"), writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")}
	run, err := Drive(baseInput(g, turns))
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if !run.Actions[0].Autorisee || run.Actions[0].Type != agentrun.ActionRead {
		t.Fatalf("a clean read must be accepted, got %+v", run.Actions[0])
	}
	if run.Result != agentrun.ResultGreen {
		t.Fatalf("goal still closes via the two writes, got %q", run.Result)
	}
}

// A read with a side effect (a sensor flip) is REJECTED — a read is no-op-only.
func TestPostCheck_Read_WithSideEffect_Rejected(t *testing.T) {
	g := twoMirrorGoal()
	bad := readTurn("app/a.go")
	bad.Effects = []SensorEffect{{Mirror: "mirror.a", State: goal.SensorGreen}}
	run, err := Drive(baseInput(g, []ScriptedTurn{bad}))
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if run.Actions[0].Autorisee {
		t.Fatalf("a read with a side effect must be rejected, got %+v", run.Actions[0])
	}
	if run.Result != agentrun.ResultStillRed {
		t.Fatalf("the rejected read lands no flip; goal stays red, got %q", run.Result)
	}
}

// --- the invariant: a nature with NO post-check is a determinism gap that blocks -------

func TestPostCheck_UnknownNature_IsDeterminismGap_Rejected(t *testing.T) {
	g := twoMirrorGoal()
	weird := writeTurn("app/a.go", "mirror.a")
	weird.Body.Type = agentrun.ActionType("nudge") // no deterministic post-check exists for this nature
	run, err := Drive(baseInput(g, []ScriptedTurn{weird}))
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if run.Actions[0].Autorisee {
		t.Fatalf("an action whose nature carries no post-check must be rejected (determinism gap), got %+v", run.Actions[0])
	}
	if run.Actions[0].RaisonBlocage == nil || run.Actions[0].RaisonBlocage.Code != blockreason.CodeAgentPostCheckFailed {
		t.Fatalf("the determinism-gap refusal must carry AGENT_POSTCHECK_FAILED, got %+v", run.Actions[0].RaisonBlocage)
	}
}

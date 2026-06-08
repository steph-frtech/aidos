// Fixture mirror (N2: state → command → events) for the S86 build console + per-project
// stable-phase recording.
//
// Conceptually stored in the `mirrors` schema (reflects: runtime.buildconsole.Project /
// runtime.buildconsole.RecordStablePhase · test_kind: fixture · cert_language:
// operation-dsl/go · authority: above) and materialized here for the Go runner (the
// bootstrap exception, CLAUDE.md §6: the mirrors schema persists it from S06; this file IS
// the red→green proof).
//
// THE done criteria (Godog form):
//   - the STREAMED console state EQUALS the recorded AgentRun (no fabricated turn/green);
//   - a real per-project STABLE PHASE is recorded only when the §43 verdict passes; an
//     INCONSISTENT cut is REFUSED with STABLE_PHASE_INCONSISTENT_CUT (BlockReason).
package buildconsole_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/archive/projectdag"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/project"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/buildconsole"
	"github.com/steph-frtech/aidos/back/runtime/buildloop"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// recordedRun builds a recorded AgentRun (S52) with a below-the-line authorised write —
// the "what happened" the console must faithfully project.
func recordedRun(t *testing.T, result agentrun.Result) agentrun.AgentRun {
	t.Helper()
	run, err := agentrun.Record(agentrun.AgentRun{
		Agent:       "buildloop-agent-v1",
		Goal:        "goal-order-checkout",
		RedWorkItem: "Order.checkout.feature",
		ContextPack: "pack-1",
		Actions: []agentrun.AgentAction{
			{Type: agentrun.ActionRead, Cible: "pack-1", Autorisee: true},
			{Type: agentrun.ActionWrite, Cible: ".aidos/workspaces/proj/src/order.go", Autorisee: true},
			{Type: agentrun.ActionRunMirror, Cible: "goal-order-checkout", Autorisee: true},
		},
		Result:    result,
		StartedAt: "2026-06-08T10:00:00Z",
		EndedAt:   "2026-06-08T10:01:00Z",
	})
	if err != nil {
		t.Fatalf("agentrun.Record: %v", err)
	}
	return run
}

// TestStreamedStateEqualsRecordedRun — Scenario: l'état streamé ÉGALE l'AgentRun enregistré.
// The console state Project derives carries the run's identity, goal and result verbatim,
// one attempt per recorded turn, and the latest sensors — StateEqualsRun holds.
func TestStreamedStateEqualsRecordedRun(t *testing.T) {
	run := recordedRun(t, agentrun.ResultGreen)

	in := buildconsole.Input{
		Run: run,
		History: buildloop.History{
			{DiffHash: "diff-1", GreenMirrors: []string{"Order.checkout.feature"}},
		},
		Decision: buildloop.Decision{Verdict: buildloop.VerdictGreen},
		Budget:   economics.HarnessCostBudget{MaxCIMinutes: 30, MaxLLMTokensPerGoal: 100000},
		Cost:     economics.MeasuredCost{CIMinutes: 4, LLMTokens: 12000},
		Pending:  []string{"prop-2", "prop-1"},
	}
	state := buildconsole.Project(in)

	if !buildconsole.StateEqualsRun(state, run) {
		t.Fatalf("StateEqualsRun must hold for a faithful projection")
	}
	if state.RunID != run.ID || state.Goal != run.Goal || state.Result != run.Result {
		t.Fatalf("state identity must equal the run: got (%s,%s,%s) want (%s,%s,%s)",
			state.RunID, state.Goal, state.Result, run.ID, run.Goal, run.Result)
	}
	if len(state.Attempts) != 1 || state.Attempts[0].DiffHash != "diff-1" || !state.Attempts[0].Authorised {
		t.Fatalf("attempt stream must project the recorded write: %+v", state.Attempts)
	}
	if len(state.Sensors) != 1 || state.Sensors[0].ID != "Order.checkout.feature" || !state.Sensors[0].Green {
		t.Fatalf("sensors must project the latest green set: %+v", state.Sensors)
	}
	// the approval gate surfaces the pending proposals, sorted.
	if state.Approval.PendingCount != 2 || state.Approval.PendingIDs[0] != "prop-1" {
		t.Fatalf("approval gate must surface sorted pending: %+v", state.Approval)
	}
	// the cost meter projects measured vs declared.
	if state.Cost.CiMinutesSpent != 4 || state.Cost.LlmTokensCap != 100000 {
		t.Fatalf("cost meter must project measured/declared: %+v", state.Cost)
	}
}

// TestConsoleCannotFabricateAnAuthorisedAttempt — Scenario: une coupe incohérente / un état
// trafiqué est refusé. A hand-tampered state that claims an authorisation the run does not
// carry fails StateEqualsRun (the console cannot lie about the wall verdict).
func TestConsoleCannotFabricateAnAuthorisedAttempt(t *testing.T) {
	// A run whose only write was REFUSED above the waterline.
	run, err := agentrun.Record(agentrun.AgentRun{
		Agent: "a", Goal: "g", RedWorkItem: "w", ContextPack: "p",
		Actions: []agentrun.AgentAction{
			{Type: agentrun.ActionWrite, Cible: "kernel.entity", Autorisee: false},
		},
		Result: agentrun.ResultBlocked, StartedAt: "2026-06-08T10:00:00Z", EndedAt: "2026-06-08T10:01:00Z",
	})
	if err != nil {
		t.Fatalf("Record: %v", err)
	}

	tampered := buildconsole.BuildConsoleState{
		RunID: run.ID, Goal: run.Goal, Result: run.Result,
		Attempts: []buildconsole.AttemptDiff{{Index: 1, DiffHash: "x", Authorised: true}},
	}
	if buildconsole.StateEqualsRun(tampered, run) {
		t.Fatalf("a state claiming an authorisation the run refused must NOT equal the run")
	}
}

// TestStablePhaseRecordedOnlyAtVerdict — Scenario: aidos stable enregistre un nœud DAG au
// verdict S23/S40 (la coupe verte) ; une coupe incohérente est refusée.
func TestStablePhaseRecordedOnlyAtVerdict(t *testing.T) {
	p, err := project.New("shop", "Shop", "owner-1", "2026-06-07T00:00:00Z")
	if err != nil {
		t.Fatalf("project.New: %v", err)
	}
	pd := projectdag.Genesis(p)

	greenCut := buildconsole.StablePhaseRequest{
		Project: pd,
		Cut:     phases.Cut{"createOrder": "v3"},
		Heads:   links.Heads{"createOrder": "v3"},
		Links:   []links.Link{{Kind: links.KindBinds, From: links.Ref{ID: "checkout-submit", Version: "v1"}, To: links.Ref{ID: "createOrder", Version: "v3"}}},
		Sensors: []phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
		Label:   "checkout-stable",
	}
	res := buildconsole.RecordStablePhase(greenCut)
	if !res.Recorded || res.BlockReason != nil {
		t.Fatalf("a green §43 cut must record a node: recorded=%v br=%v", res.Recorded, res.BlockReason)
	}
	if res.Node.ID == "" || res.Node.Label != "checkout-stable" || res.Node.Stratum != "above" {
		t.Fatalf("the recorded node must be content-addressed, labelled, above the line: %+v", res.Node)
	}
	// the node descends from the project's genesis (its current head).
	if len(res.Node.ParentIDs) != 1 || res.Node.ParentIDs[0] != pd.GenesisID() {
		t.Fatalf("the stable phase must descend from the project's head: %+v", res.Node.ParentIDs)
	}

	// An INCONSISTENT cut (a red sensor) is REFUSED — no node from a red mirror.
	redCut := greenCut
	redCut.Sensors = []phases.SensorStatus{{ID: "createOrder.fixture", Pass: false}}
	bad := buildconsole.RecordStablePhase(redCut)
	if bad.Recorded || bad.BlockReason == nil {
		t.Fatalf("an inconsistent cut must be refused, no node recorded")
	}
	if bad.BlockReason.Code != buildconsole.CodeStablePhaseInconsistentCut {
		t.Fatalf("the refusal must be STABLE_PHASE_INCONSISTENT_CUT: %s", bad.BlockReason.Code)
	}
	if len(bad.BlockReason.HowToFix) == 0 {
		t.Fatalf("the refusal must carry a non-empty how_to_fix (no prison)")
	}
}

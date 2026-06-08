// Property mirror (rapid, ∀, below the line, computational) for the S86 build console +
// per-project stable-phase recording.
//
// Conceptually stored in the `mirrors` schema (reflects: runtime.buildconsole · test_kind:
// property · cert_language: rapid · authority: below) and materialized here for the runner.
//
// THE invariants pinned:
//   - DETERMINISM/TOTALITY — Project / StateEqualsRun / RecordStablePhase are pure and total;
//     same input ⇒ same output, never panic.
//   - FAITHFUL PROJECTION — for every recorded run, StateEqualsRun(Project(in), run) holds:
//     the console can never fabricate a turn, a goal, a result or an authorisation.
//   - RECORDING-IFF-STABLE — RecordStablePhase records a node IFF the §43 cut is stable
//     (phases.IsStable); an unstable cut is ALWAYS refused with STABLE_PHASE_INCONSISTENT_CUT
//     and never yields a node; a stable cut ALWAYS yields a content-addressed node with the
//     project's heads as parents (recording ⇔ ¬refusal ⇔ verdict).
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
	"pgregory.net/rapid"
)

func genRun(t *rapid.T) agentrun.AgentRun {
	nWrites := rapid.IntRange(0, 4).Draw(t, "n_writes")
	actions := []agentrun.AgentAction{{Type: agentrun.ActionRead, Cible: "pack", Autorisee: true}}
	for i := 0; i < nWrites; i++ {
		above := rapid.Bool().Draw(t, "above")
		cible := ".aidos/workspaces/p/src/f.go"
		if above {
			cible = "kernel.entity"
		}
		actions = append(actions, agentrun.AgentAction{
			Type: agentrun.ActionWrite, Cible: cible, Autorisee: !above,
		})
	}
	result := rapid.SampledFrom(agentrun.Results()).Draw(t, "result")
	run, err := agentrun.Record(agentrun.AgentRun{
		Agent:     "ag-" + rapid.StringMatching(`[a-z]{2}`).Draw(t, "ag"),
		Goal:      "goal-" + rapid.StringMatching(`[a-z]{2}`).Draw(t, "goal"),
		Actions:   actions,
		Result:    result,
		StartedAt: "2026-06-08T10:00:00Z", EndedAt: "2026-06-08T10:01:00Z",
	})
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	return run
}

func genInput(t *rapid.T, run agentrun.AgentRun) buildconsole.Input {
	n := rapid.IntRange(0, 5).Draw(t, "hist_len")
	var hist buildloop.History
	for i := 0; i < n; i++ {
		var greens []string
		for _, m := range []string{"m1", "m2", "m3"} {
			if rapid.Bool().Draw(t, "g_"+m) {
				greens = append(greens, m)
			}
		}
		hist = append(hist, buildloop.Iteration{
			DiffHash:     rapid.SampledFrom([]string{"a", "b", ""}).Draw(t, "diff"),
			GreenMirrors: greens,
		})
	}
	verdict := rapid.SampledFrom(buildloop.Verdicts()).Draw(t, "verdict")
	var pending []string
	for _, p := range []string{"prop-a", "prop-b"} {
		if rapid.Bool().Draw(t, "pend_"+p) {
			pending = append(pending, p)
		}
	}
	return buildconsole.Input{
		Run:      run,
		History:  hist,
		Decision: buildloop.Decision{Verdict: verdict},
		Budget:   economics.HarnessCostBudget{MaxCIMinutes: rapid.IntRange(0, 50).Draw(t, "cap_ci"), MaxLLMTokensPerGoal: rapid.IntRange(0, 99999).Draw(t, "cap_tok")},
		Cost:     economics.MeasuredCost{CIMinutes: rapid.IntRange(0, 50).Draw(t, "cost_ci"), LLMTokens: rapid.IntRange(0, 99999).Draw(t, "cost_tok")},
		Pending:  pending,
	}
}

// TestProjectIsDeterministicAndFaithful — same input ⇒ byte-identical state, and the state
// ALWAYS equals the recorded run (the console can never fabricate).
func TestProjectIsDeterministicAndFaithful(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		run := genRun(t)
		in := genInput(t, run)

		a := buildconsole.Project(in)
		b := buildconsole.Project(in)
		if !equalState(a, b) {
			t.Fatalf("Project must be deterministic: %+v vs %+v", a, b)
		}
		if !buildconsole.StateEqualsRun(a, run) {
			t.Fatalf("Project's state must ALWAYS equal the recorded run (faithful projection)")
		}
		// the projection never invents an authorised attempt the run does not carry.
		for i, at := range a.Attempts {
			if at.Index != i+1 {
				t.Fatalf("attempt indices must be 1-based contiguous: %+v", a.Attempts)
			}
		}
	})
}

func genStableRequest(t *rapid.T) buildconsole.StablePhaseRequest {
	slug := rapid.SampledFrom([]string{"alpha", "beta", "shop"}).Draw(t, "slug")
	p, err := project.New(slug, "App", "owner", "2026-06-07T00:00:00Z")
	if err != nil {
		t.Fatalf("project.New: %v", err)
	}
	pd := projectdag.Genesis(p)
	pass := rapid.Bool().Draw(t, "sensor_pass")
	linkStale := rapid.Bool().Draw(t, "link_stale")
	toV := "v3"
	if linkStale {
		toV = "v2" // pinned off-head ⇒ stale
	}
	return buildconsole.StablePhaseRequest{
		Project: pd,
		Cut:     phases.Cut{"createOrder": "v3"},
		Heads:   links.Heads{"createOrder": "v3"},
		Links:   []links.Link{{Kind: links.KindBinds, From: links.Ref{ID: "checkout", Version: "v1"}, To: links.Ref{ID: "createOrder", Version: toV}}},
		Sensors: []phases.SensorStatus{{ID: "createOrder.fixture", Pass: pass}},
		Label:   "phase-" + slug,
	}
}

// TestRecordStablePhaseIsRecordingIffStable — recording ⇔ the §43 verdict ⇔ ¬refusal; an
// unstable cut never yields a node; a stable cut always yields a content-addressed, parented
// node. Deterministic and total.
func TestRecordStablePhaseIsRecordingIffStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		req := genStableRequest(t)

		a := buildconsole.RecordStablePhase(req)
		b := buildconsole.RecordStablePhase(req)
		if a.Recorded != b.Recorded || a.Node.ID != b.Node.ID {
			t.Fatalf("RecordStablePhase must be deterministic")
		}

		// recording ⇔ stable ⇔ ¬refusal.
		if a.Recorded != a.Phase.Stable {
			t.Fatalf("recording must hold IFF the cut is stable: recorded=%v stable=%v", a.Recorded, a.Phase.Stable)
		}
		if a.Recorded == (a.BlockReason != nil) {
			t.Fatalf("a recorded phase carries no refusal, a refused one records no node")
		}

		if a.Recorded {
			if a.Node.ID == "" || a.Node.Stratum != "above" {
				t.Fatalf("a recorded node must be content-addressed and above the line: %+v", a.Node)
			}
			// it descends from the project's heads.
			if len(a.Node.ParentIDs) != 1 || a.Node.ParentIDs[0] != req.Project.GenesisID() {
				t.Fatalf("a recorded node descends from the project's head: %+v", a.Node.ParentIDs)
			}
		} else {
			if a.BlockReason.Code != buildconsole.CodeStablePhaseInconsistentCut {
				t.Fatalf("refusal must be STABLE_PHASE_INCONSISTENT_CUT: %s", a.BlockReason.Code)
			}
			if len(a.BlockReason.HowToFix) == 0 {
				t.Fatalf("refusal must carry a non-empty how_to_fix")
			}
		}
	})
}

func equalState(a, b buildconsole.BuildConsoleState) bool {
	if a.RunID != b.RunID || a.Goal != b.Goal || a.Result != b.Result {
		return false
	}
	if len(a.Attempts) != len(b.Attempts) || len(a.Sensors) != len(b.Sensors) {
		return false
	}
	for i := range a.Attempts {
		if a.Attempts[i] != b.Attempts[i] {
			return false
		}
	}
	for i := range a.Sensors {
		if a.Sensors[i] != b.Sensors[i] {
			return false
		}
	}
	if a.Cost.CiMinutesSpent != b.Cost.CiMinutesSpent || a.Cost.LlmTokensSpent != b.Cost.LlmTokensSpent {
		return false
	}
	if a.Cost.CiMinutesCap != b.Cost.CiMinutesCap || a.Cost.LlmTokensCap != b.Cost.LlmTokensCap {
		return false
	}
	if a.Breaker.Verdict != b.Breaker.Verdict || a.Approval.PendingCount != b.Approval.PendingCount {
		return false
	}
	return true
}

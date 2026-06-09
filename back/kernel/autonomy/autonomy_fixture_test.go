package autonomy_test

// FK10 AUTONOMY FIXTURE (state → command → events), the materialized mirror of the
// ROADMAP-fke FK10 done-criterion: "fixture — un A1 tentant un merge refusé". reflects =
// kernel.autonomy · test_kind = fixture · authority = above (the autonomy RULE — A1 cannot
// merge, A8 never on a critical action, promotion is earned not declared — is the human's,
// pinned here; the pure functions in autonomy.go make it green).
//
// The done invariant: an A1 agent attempting a merge (a critical action requiring A6) is
// REFUSED fail-closed with AGENT_AUTONOMY_EXCEEDED; the only door to A6 is the PROMOTION
// computed from N green E4+ no-incident runs — never a level the agent declares.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/autonomy"
	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// merge is the canonical critical action of the fixture: a merge/integration requires A6 and
// is CRITICAL (irreversible composition of branches).
var merge = autonomy.Action{Name: "merge", Required: autonomy.A6, Critical: true}

// state → command → events: an A1 agent commands a merge; the event is a refusal.
func TestFixture_A1AttemptsMerge_Refused(t *testing.T) {
	declared := autonomy.A1 // STATE: the agent declares autonomy A1

	dec := autonomy.Enforce(declared, merge) // COMMAND: attempt the merge

	// EVENT: refused, fail-closed, with the actionable BlockReason.
	if dec.Allowed {
		t.Fatalf("an A1 agent must NOT be allowed to merge (requires A6)")
	}
	if dec.BlockReason == nil {
		t.Fatalf("a refusal must carry a BlockReason (KRD §44.5 — no prison)")
	}
	if dec.BlockReason.Code != blockreason.CodeAgentAutonomyExceeded {
		t.Fatalf("want AGENT_AUTONOMY_EXCEEDED, got %s", dec.BlockReason.Code)
	}
	if len(dec.BlockReason.HowToFix) == 0 {
		t.Fatalf("the BlockReason must name the door out (a non-empty how_to_fix)")
	}
}

// A6 agent merges fine (the level is sufficient); A7 (release) is the critical ceiling.
func TestFixture_A6Merges_A7ReleaseAdmitted(t *testing.T) {
	if dec := autonomy.Enforce(autonomy.A6, merge); !dec.Allowed {
		t.Fatalf("an A6 agent must be allowed to merge")
	}
	release := autonomy.Action{Name: "deploy", Required: autonomy.A7, Critical: true}
	if dec := autonomy.Enforce(autonomy.A7, release); !dec.Allowed {
		t.Fatalf("an A7 agent must be allowed to deploy (the critical ceiling)")
	}
}

// A8 NEVER on a critical action: even a declared-A8 agent cannot run an A8-critical action.
func TestFixture_A8NeverOnCritical(t *testing.T) {
	crit := autonomy.Action{Name: "irreversible-merge", Required: autonomy.A8, Critical: true}
	if dec := autonomy.Enforce(autonomy.A8, crit); dec.Allowed {
		t.Fatalf("A8 must never govern a critical action (human escalation required)")
	}
}

// Promotion is EARNED from the history, never declared: after 3 green E4+ no-incident runs an
// A1 agent is promoted to A2 — but a single incident/red/below-E4 run in the window withholds it.
func TestFixture_PromotionEarnedFromHistory(t *testing.T) {
	green := func(ev prooftype.ELevel, incident bool) autonomy.RunOutcome {
		run, err := agentrun.Record(agentrun.AgentRun{
			Agent: "exec@v1", Goal: "g", RedWorkItem: "w", ContextPack: "p",
			Result: agentrun.ResultGreen, StartedAt: "2026-06-09T00:00:00Z", EndedAt: "2026-06-09T00:01:00Z",
		})
		if err != nil {
			t.Fatalf("record: %v", err)
		}
		return autonomy.OutcomeOf(run, ev, incident)
	}

	// Three clean E4 runs → A1 promotes to A2.
	clean := []autonomy.RunOutcome{green(prooftype.E4, false), green(prooftype.E5, false), green(prooftype.E4, false)}
	if got := autonomy.PromotionFromHistory(autonomy.A1, clean, autonomy.DefaultPolicy); got != autonomy.A2 {
		t.Fatalf("3 clean E4+ runs must promote A1→A2, got %s", got)
	}

	// An incident in the window withholds the promotion (still A1).
	withIncident := []autonomy.RunOutcome{green(prooftype.E4, false), green(prooftype.E4, true), green(prooftype.E4, false)}
	if got := autonomy.PromotionFromHistory(autonomy.A1, withIncident, autonomy.DefaultPolicy); got != autonomy.A1 {
		t.Fatalf("an incident in the window must withhold promotion, got %s", got)
	}

	// A below-E4 (E3) run in the window withholds it too.
	belowE4 := []autonomy.RunOutcome{green(prooftype.E4, false), green(prooftype.E3, false), green(prooftype.E4, false)}
	if got := autonomy.PromotionFromHistory(autonomy.A1, belowE4, autonomy.DefaultPolicy); got != autonomy.A1 {
		t.Fatalf("a below-E4 run in the window must withhold promotion, got %s", got)
	}

	// A non-green (still_red) run withholds it.
	stillRed, _ := agentrun.Record(agentrun.AgentRun{
		Agent: "exec@v1", Goal: "g", RedWorkItem: "w", ContextPack: "p",
		Result: agentrun.ResultStillRed, StartedAt: "2026-06-09T00:00:00Z", EndedAt: "2026-06-09T00:01:00Z",
	})
	withRed := []autonomy.RunOutcome{green(prooftype.E4, false), autonomy.OutcomeOf(stillRed, prooftype.E5, false), green(prooftype.E4, false)}
	if got := autonomy.PromotionFromHistory(autonomy.A1, withRed, autonomy.DefaultPolicy); got != autonomy.A1 {
		t.Fatalf("a non-green run in the window must withhold promotion, got %s", got)
	}
}

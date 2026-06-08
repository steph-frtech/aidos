// propose_test.go — the S85 buildloop-side wiring mirror: a GREEN turn over a truth-implying
// goal PROPOSES the implied truth (proposed, never admitted); a non-green turn proposes nothing.
package buildloop

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/buildloop/approval"
)

func proposeSpec() agentlayer.AgentSpec {
	return agentlayer.AgentSpec{ID: "buildloop-agent-v1", Role: "executor", PeutProposerVerite: true}
}

func TestProposeOnGreen_GreenTurnProposesTruth(t *testing.T) {
	out := TurnOutput{
		Run:      agentrun.AgentRun{ID: "run-42"},
		History:  History{{DiffHash: "diff-1", GreenMirrors: []string{"m1"}}},
		Decision: Decision{Verdict: VerdictGreen},
	}
	p, br := ProposeOnGreen(proposeSpec(), "proj-A", out, ImpliedTruth{
		Target: "kernel.operation", Domain: "checkout", TruthKind: "journey", Mirror: "mirror://checkout",
	})
	if br != nil {
		t.Fatalf("a green truth-implying turn must propose, got block %+v", br)
	}
	if p == nil || p.Status != approval.StatusProposed {
		t.Fatalf("the proposal must be `proposed`, got %+v", p)
	}
	if p.AgentRun != "run-42" {
		t.Fatalf("the proposal must link the AgentRun, got %q", p.AgentRun)
	}
	if p.Truth.DiffHash != "diff-1" {
		t.Fatalf("the proposal must carry the green turn's diff-hash, got %q", p.Truth.DiffHash)
	}
}

func TestProposeOnGreen_NonGreenProposesNothing(t *testing.T) {
	for _, v := range []Verdict{VerdictContinue, VerdictNoProgress} {
		out := TurnOutput{Decision: Decision{Verdict: v}}
		p, br := ProposeOnGreen(proposeSpec(), "proj-A", out, ImpliedTruth{
			Target: "kernel.operation", Domain: "checkout", TruthKind: "journey", Mirror: "m",
		})
		if p != nil || br != nil {
			t.Fatalf("a %q turn implies no truth to land — nothing to propose, got (%+v, %+v)", v, p, br)
		}
	}
}

func TestProposeOnGreen_MonsterRefused(t *testing.T) {
	out := TurnOutput{
		Run:      agentrun.AgentRun{ID: "run-1"},
		Decision: Decision{Verdict: VerdictGreen},
	}
	// A green turn whose implied truth has NO mirror is a monster — refused, never proposed.
	_, br := ProposeOnGreen(proposeSpec(), "proj-A", out, ImpliedTruth{
		Target: "kernel.operation", Domain: "checkout", TruthKind: "journey", Mirror: "",
	})
	if br == nil {
		t.Fatal("a truth with no mirror must be refused (a monster never lands)")
	}
}

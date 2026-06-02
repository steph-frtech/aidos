package agentrun_test

// Property mirror (∀) for the AgentRun runtime events (S52).
// reflects=runtime.agent_run · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below. A run is a RUNTIME EVENT, never a layer/truth.
//
// The invariants:
//  1. Record is DETERMINISTIC + TOTAL: same input run ⇒ same content-hash id (no clock).
//  2. A different run body ⇒ a different id (content-addressing).
//  3. ApplyWall denies a WRITE above the waterline with AGENT_WRITE_ABOVE_WATERLINE, for
//     every role; allows reads/proposes/run_mirror and below-the-line writes.
//  4. An AgentRun carries NO version field and NO mirror field — a run is unrepresentable
//     as a layer (a STRUCTURAL invariant of the type, asserted by reflection).

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

func drawRun(rt *rapid.T) agentrun.AgentRun {
	results := agentrun.Results()
	return agentrun.AgentRun{
		Agent:       rapid.StringN(1, 12, 12).Draw(rt, "agent"),
		Goal:        rapid.StringN(0, 12, 12).Draw(rt, "goal"),
		RedWorkItem: rapid.StringN(0, 12, 12).Draw(rt, "rwi"),
		ContextPack: rapid.StringN(0, 12, 12).Draw(rt, "cp"),
		Result:      results[rapid.IntRange(0, len(results)-1).Draw(rt, "result")],
		StartedAt:   "2026-06-02T18:00:00Z",
		EndedAt:     "2026-06-02T18:05:00Z",
	}
}

// (1) Record deterministic + total.
func TestProp_Record_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		r := drawRun(rt)
		a, err := agentrun.Record(r)
		if err != nil {
			rt.Fatalf("Record must be total for a known result: %v", err)
		}
		b, _ := agentrun.Record(r)
		if a.ID != b.ID {
			rt.Fatalf("Record must be deterministic: %q != %q", a.ID, b.ID)
		}
		if len(a.ID) != 64 {
			rt.Fatalf("id must be a 64-hex content hash, got %q", a.ID)
		}
	})
}

// (2) Different body ⇒ different id.
func TestProp_Record_ContentAddressed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		r := drawRun(rt)
		a, _ := agentrun.Record(r)
		r2 := r
		r2.Agent = r.Agent + "-x"
		b, _ := agentrun.Record(r2)
		if a.ID == b.ID {
			rt.Fatal("a different run body must yield a different id (content-addressing)")
		}
	})
}

// (3) ApplyWall denies above-the-line writes regardless of role.
func TestProp_ApplyWall_DeniesAboveWaterline(t *testing.T) {
	above := []string{"kernel.truth", "mirrors.mirror", "fitness.grammar", "kernel"}
	below := []string{"runtime.agent_run", "ideas", "brain"}
	rapid.Check(t, func(rt *rapid.T) {
		roles := []string{"bdd-writer", "executor", "orchestrator"}
		spec := agentlayer.AgentSpec{Role: roles[rapid.IntRange(0, len(roles)-1).Draw(rt, "role")]}
		for _, tgt := range above {
			act := agentrun.ApplyWall(agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: tgt}, spec)
			if act.Autorisee {
				rt.Fatalf("write %q must be denied above the waterline", tgt)
			}
			if act.RaisonBlocage == nil || act.RaisonBlocage.Code != blockreason.CodeAgentWriteAboveWaterline {
				rt.Fatalf("denied write must carry AGENT_WRITE_ABOVE_WATERLINE, got %+v", act.RaisonBlocage)
			}
		}
		for _, tgt := range below {
			act := agentrun.ApplyWall(agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: tgt}, spec)
			if !act.Autorisee {
				rt.Fatalf("below-the-line write %q must be allowed", tgt)
			}
		}
		// reads/proposes/run_mirror are always authorised
		for _, ty := range []agentrun.ActionType{agentrun.ActionRead, agentrun.ActionPropose, agentrun.ActionRunMirror} {
			act := agentrun.ApplyWall(agentrun.AgentAction{Type: ty, Cible: "kernel.truth"}, spec)
			if !act.Autorisee {
				rt.Fatalf("a %q action must be authorised (not a write)", ty)
			}
		}
	})
}

// (4) AgentRun is unrepresentable as a layer: NO version, NO mirror field. Structural.
func TestProp_AgentRun_NotALayer(t *testing.T) {
	ty := reflect.TypeOf(agentrun.AgentRun{})
	for i := 0; i < ty.NumField(); i++ {
		name := ty.Field(i).Name
		if name == "Version" || name == "Mirror" {
			t.Fatalf("AgentRun must NOT carry a %q field — a run is not a layer/truth", name)
		}
	}
}

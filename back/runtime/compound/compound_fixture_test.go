package compound_test

// CE03 — the /compound gesture fixture mirror (RED FIRST). It pins the behaviour graven by CE02
// and proven by CE01: at a goal's CLOSE, the durable motif is CAPITALISED via the wall —
//
//	state (a GREEN, closed goal + its captured pattern)
//	  → command (/compound: capture)
//	  → events (a KindProcedural memory write-input + a DRAFT behavior-candidate idea, NO kernel write)
//
// The two load-bearing assertions of the done-criteria:
//   - a green goal produces ONE procedural memory entry (memory.WriteInput, Kind=KindProcedural)
//     AND ONE draft idea (ideas.Idea, Status=draft) — the "proposed" candidate;
//   - AUCUNE écriture kernel — the result's WroteKernel is false (the wall: firewall.ViaIdea is
//     the only door, idée → miroir → /goal).
//
// A goal that is NOT green produces NO capture (capitalisation is a CLOSE event, not an
// in-flight one). Determinism-first: Compound is a PURE function — same input ⇒ same events
// (the reproducibility mirror compound_property_test.go pins it).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/compound"
)

// goalFixture is the canonical CE01 closed goal: its gesture units (procedural) + its spec units
// (behavior-macro), drawn from the same motif the spike measured.
func goalFixture() compound.GoalClose {
	return compound.GoalClose{
		GoalID: "goal-order-archive",
		Branch: "main",
		Green:  true,
		GesturePattern: []string{
			"load_context_pack",
			"scaffold_package",
			"project_go_ts",
			"wire_ui_control",
			"run_sensors",
		},
		SpecPattern: []string{
			"derive_mirror",
			"write_fixture",
			"cross_contract",
		},
	}
}

func TestCompound_GreenGoal_CapturesProceduralAndProposesBehavior(t *testing.T) {
	out, err := compound.Compound(goalFixture())
	if err != nil {
		t.Fatalf("Compound returned error: %v", err)
	}

	// EVENT 1 — exactly one procedural memory write-input.
	if got := len(out.ProceduralWrites); got != 1 {
		t.Fatalf("expected exactly 1 procedural write, got %d", got)
	}
	pm := out.ProceduralWrites[0]
	if pm.Kind != "procedural" {
		t.Fatalf("procedural write Kind = %q, want %q (KindProcedural)", pm.Kind, "procedural")
	}
	if pm.Content == "" {
		t.Fatal("procedural write Content is empty — the gesture motif must be captured")
	}
	if pm.Branch != "main" {
		t.Fatalf("procedural write Branch = %q, want goal branch %q", pm.Branch, "main")
	}

	// EVENT 2 — exactly one DRAFT behavior-candidate idea, via the wall.
	if got := len(out.BehaviorCandidates); got != 1 {
		t.Fatalf("expected exactly 1 behavior candidate, got %d", got)
	}
	cand := out.BehaviorCandidates[0]
	if cand.Idea.Status != ideas.StatusDraft {
		t.Fatalf("behavior candidate Status = %q, want %q (draft = proposed)", cand.Idea.Status, ideas.StatusDraft)
	}
	if cand.Idea.ID == "" {
		t.Fatal("behavior candidate idea has no content-address id")
	}
	if cand.WroteKernel {
		t.Fatal("WALL VIOLATION: behavior candidate reports WroteKernel=true — capture must write NO truth")
	}

	// THE WALL — the whole capture wrote no kernel truth.
	if out.WroteKernel() {
		t.Fatal("WALL VIOLATION: /compound wrote kernel truth; capitalisation goes via firewall.ViaIdea only")
	}
}

func TestCompound_NonGreenGoal_CapturesNothing(t *testing.T) {
	g := goalFixture()
	g.Green = false

	out, err := compound.Compound(g)
	if err != nil {
		t.Fatalf("Compound returned error: %v", err)
	}
	if len(out.ProceduralWrites) != 0 {
		t.Fatalf("a non-green goal must capture no procedural memory, got %d", len(out.ProceduralWrites))
	}
	if len(out.BehaviorCandidates) != 0 {
		t.Fatalf("a non-green goal must propose no behavior candidate, got %d", len(out.BehaviorCandidates))
	}
	if out.WroteKernel() {
		t.Fatal("WALL VIOLATION: a no-op capture wrote kernel truth")
	}
}

func TestCompound_EmptyGesturePattern_NoProceduralButStillSafe(t *testing.T) {
	g := goalFixture()
	g.GesturePattern = nil

	out, err := compound.Compound(g)
	if err != nil {
		t.Fatalf("Compound returned error: %v", err)
	}
	if len(out.ProceduralWrites) != 0 {
		t.Fatalf("no gesture units ⇒ no procedural write, got %d", len(out.ProceduralWrites))
	}
	// Spec pattern still present ⇒ behavior candidate still proposed.
	if len(out.BehaviorCandidates) != 1 {
		t.Fatalf("spec pattern present ⇒ 1 behavior candidate, got %d", len(out.BehaviorCandidates))
	}
}

func TestCompound_ProvenancePointsBackToGoal(t *testing.T) {
	out, err := compound.Compound(goalFixture())
	if err != nil {
		t.Fatalf("Compound returned error: %v", err)
	}
	// The captured procedural memory + the idea both trace their provenance to the goal id —
	// "who wanted what, when, why" (KRD §119); a captured motif is never anonymous.
	pm := out.ProceduralWrites[0]
	if pm.Provenance == "" {
		t.Fatal("procedural write has no provenance back to the goal")
	}
	cand := out.BehaviorCandidates[0]
	if cand.Idea.Provenance.Detail == "" {
		t.Fatal("behavior candidate idea has no provenance detail")
	}
}

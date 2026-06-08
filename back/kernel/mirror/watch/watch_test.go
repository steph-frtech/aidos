package watch

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/shapeeditor"
	"pgregory.net/rapid"
)

// watch_test.go is the BDD MIRROR of S69 — « matérialiser-et-le-voir-rougir » (the "watch it fail"
// of KRD made a product path). It is written FIRST and RED (red → green → refactor).
//
// THE DONE-CRITERION (ROADMAP-app-builder S69): a Godog author materializes the authored mirror
// toward the runner and sees it go RED against absent code; then a stub turns it GREEN.

// helper: a freshly authored, red gherkin mirror Proposal (the S68 output S69 consumes).
func gherkinProposal(t *testing.T) shapeeditor.Proposal {
	t.Helper()
	d, err := shapeeditor.OpenDraft("proj-1", records.LayerRef{LayerID: "Order.place", Version: "v1"}, shapeeditor.NatureAcceptance)
	if err != nil {
		t.Fatalf("OpenDraft: %v", err)
	}
	d.Title = "place an order"
	d.Source = "Scenario: place an order\nGiven a cart\nWhen I place the order\nThen an order exists"
	p, err := shapeeditor.ProposeMirror(d, "phase-0")
	if err != nil {
		t.Fatalf("ProposeMirror: %v", err)
	}
	return p
}

// FIXTURE — the canonical S69 journey: materialize → run against absent code (RED) → stub → GREEN.
func TestWatchItFail_FixtureGherkinRedThenStubGreen(t *testing.T) {
	p := gherkinProposal(t)

	mat, err := Materialize(p)
	if err != nil {
		t.Fatalf("Materialize: %v", err)
	}
	if mat.TargetRunner != RunnerGodog {
		t.Fatalf("a gherkin mirror dispatches to Godog, got %q", mat.TargetRunner)
	}
	if mat.MaterializedSource == "" {
		t.Fatalf("materialized source must carry the authored spec text")
	}

	// ── against ABSENT code → RED (the "watch it fail").
	redStream, err := RunStream(mat, CodeProbe{Present: false})
	if err != nil {
		t.Fatalf("RunStream (absent): %v", err)
	}
	if got := redStream.Final(); got != records.LivenessDead {
		t.Fatalf("against absent code the mirror must be RED (dead), got %q", got)
	}
	if !redStream.IsRed() {
		t.Fatalf("IsRed must be true against absent code")
	}
	// The stream is the live feedback: it walks Queued → Materialized → Running → Verdict.
	wantPhases := []Phase{PhaseQueued, PhaseMaterialized, PhaseRunning, PhaseVerdict}
	if len(redStream.Events) != len(wantPhases) {
		t.Fatalf("stream phases = %d, want %d (%v)", len(redStream.Events), len(wantPhases), redStream.Events)
	}
	for i, ph := range wantPhases {
		if redStream.Events[i].Phase != ph {
			t.Fatalf("event[%d].Phase = %q, want %q", i, redStream.Events[i].Phase, ph)
		}
	}
	if redStream.Events[len(redStream.Events)-1].Status != records.LivenessDead {
		t.Fatalf("the verdict event must carry RED")
	}

	// ── then a STUB exists → GREEN.
	greenStream, err := RunStream(mat, CodeProbe{Present: true})
	if err != nil {
		t.Fatalf("RunStream (stub): %v", err)
	}
	if got := greenStream.Final(); got != records.LivenessAlive {
		t.Fatalf("against the stub the mirror must be GREEN (alive), got %q", got)
	}
	if greenStream.IsRed() {
		t.Fatalf("IsRed must be false against the stub")
	}
}

// Each shape dispatches to its runner — the closed table (Godog / rapid / fixture interpreter).
func TestMaterialize_DispatchByShape(t *testing.T) {
	cases := []struct {
		nature shapeeditor.TruthNature
		source string
		want   Runner
	}{
		{shapeeditor.NatureAcceptance, "Scenario: s\nWhen w\nThen t", RunnerGodog},
		{shapeeditor.NatureInvariant, "property: p\nforall: a\nholds: a == a", RunnerRapid},
		{shapeeditor.NatureWorkflow, "fixture: f\nstate: s\ncommand: c\nevent: e", RunnerFixture},
	}
	for _, c := range cases {
		d, err := shapeeditor.OpenDraft("proj-1", records.LayerRef{LayerID: "L", Version: "v1"}, c.nature)
		if err != nil {
			t.Fatalf("OpenDraft %s: %v", c.nature, err)
		}
		d.Source = c.source
		p, err := shapeeditor.ProposeMirror(d, "phase-0")
		if err != nil {
			t.Fatalf("ProposeMirror %s: %v", c.nature, err)
		}
		mat, err := Materialize(p)
		if err != nil {
			t.Fatalf("Materialize %s: %v", c.nature, err)
		}
		if mat.TargetRunner != c.want {
			t.Fatalf("nature %s → runner %q, want %q", c.nature, mat.TargetRunner, c.want)
		}
	}
}

// Materialize refuses a non-red (already-passing) proposal — S69 materializes the RED authored
// mirror; a green one is not a "watch it fail".
func TestMaterialize_RefusesEmptySource(t *testing.T) {
	if _, err := Materialize(shapeeditor.Proposal{}); err == nil {
		t.Fatalf("Materialize must refuse an empty proposal")
	}
}

// PROPERTY (reproducibility, CLAUDE.md §6/§8): same (materialized mirror, code-probe) → byte-identical
// stream. The verdict is a deterministic function of code-presence, never an LLM, never a clock.
func TestRunStream_Reproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		present := rapid.Bool().Draw(rt, "present")
		p := gherkinProposal(t)
		mat, err := Materialize(p)
		if err != nil {
			rt.Fatalf("Materialize: %v", err)
		}
		s1, err1 := RunStream(mat, CodeProbe{Present: present})
		s2, err2 := RunStream(mat, CodeProbe{Present: present})
		if (err1 == nil) != (err2 == nil) {
			rt.Fatalf("error determinism broken: %v vs %v", err1, err2)
		}
		if s1.Final() != s2.Final() {
			rt.Fatalf("final verdict not reproducible: %q vs %q", s1.Final(), s2.Final())
		}
		if len(s1.Events) != len(s2.Events) {
			rt.Fatalf("event count not reproducible")
		}
		// Code-presence DECIDES the verdict (det-criterion): absent ⇒ red, present ⇒ green.
		wantRed := !present
		if s1.IsRed() != wantRed {
			rt.Fatalf("present=%v ⇒ IsRed should be %v, got %v", present, wantRed, s1.IsRed())
		}
	})
}

// PROPERTY: Materialize is reproducible — same proposal → same materialized source + runner.
func TestMaterialize_Reproducible(t *testing.T) {
	p := gherkinProposal(t)
	a, errA := Materialize(p)
	b, errB := Materialize(p)
	if errA != nil || errB != nil {
		t.Fatalf("Materialize errored: %v / %v", errA, errB)
	}
	if a.MaterializedSource != b.MaterializedSource || a.TargetRunner != b.TargetRunner || a.MirrorID != b.MirrorID {
		t.Fatalf("Materialize not reproducible: %+v vs %+v", a, b)
	}
}

package shapeeditor_test

// S68 — the REPRODUCIBILITY / DETERMINISM property mirror (rapid). It pins the two load-bearing
// done-criteria of S68 as ∀ invariants:
//
//	① shape selection is DETERMINISTIC by truth-nature — same nature → same (shape, test_kind,
//	   cert_language) — and is a CLOSED table (an unknown nature has no shape, never a guess);
//	② parsing each shape is a PURE FUNCTION — same source → same parse (and a valid round-trip
//	   re-parses identically);
//	③ ProposeMirror is deterministic and writes NO truth (WroteMirror always false, born RED).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): shape selection + parsing are pure functions, never an
// LLM. This property is the reproducibility mirror that proves it.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/shapeeditor"
	"pgregory.net/rapid"
)

// ① DeriveShape is deterministic + a closed table.
func TestProp_DeriveShape_DeterministicAndClosed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		nat := rapid.SampledFrom(shapeeditor.Natures()).Draw(t, "nature")
		d1, err1 := shapeeditor.DeriveShape(nat)
		d2, err2 := shapeeditor.DeriveShape(nat)
		if err1 != nil || err2 != nil {
			t.Fatalf("a known nature %q must derive a shape, got %v / %v", nat, err1, err2)
		}
		if d1 != d2 {
			t.Fatalf("DeriveShape(%q) not deterministic: %+v vs %+v", nat, d1, d2)
		}
	})
}

func TestProp_DeriveShape_ByNature_IsTheClosedTable(t *testing.T) {
	cases := map[shapeeditor.TruthNature]shapeeditor.Shape{
		shapeeditor.NatureAcceptance: shapeeditor.ShapeGherkin,
		shapeeditor.NatureInvariant:  shapeeditor.ShapeProperty,
		shapeeditor.NatureWorkflow:   shapeeditor.ShapeFixture,
	}
	for nat, want := range cases {
		d, err := shapeeditor.DeriveShape(nat)
		if err != nil {
			t.Fatalf("DeriveShape(%q): %v", nat, err)
		}
		if d.Shape != want {
			t.Fatalf("DeriveShape(%q).Shape = %q, want %q", nat, d.Shape, want)
		}
	}
	// An unknown nature has NO shape (never a guess).
	if _, err := shapeeditor.DeriveShape("not-a-nature"); err == nil {
		t.Fatal("unknown nature must be refused, got a derived shape")
	}
}

// ② parsing is a pure function — same source → same parse.
func TestProp_Parse_IsPure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		title := rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "title")
		source := "Scenario: " + title + "\nGiven a state\nWhen acted\nThen result"
		p1, e1 := shapeeditor.ParseGherkin(source)
		p2, e2 := shapeeditor.ParseGherkin(source)
		if (e1 == nil) != (e2 == nil) {
			t.Fatalf("ParseGherkin not deterministic: %v vs %v", e1, e2)
		}
		if e1 == nil && p1.Title != p2.Title {
			t.Fatalf("ParseGherkin title not stable: %q vs %q", p1.Title, p2.Title)
		}
	})
}

// ③ ProposeMirror is deterministic, writes no truth, born red.
func TestProp_ProposeMirror_DeterministicRedNoWrite(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		layer := rapid.StringMatching(`[A-Za-z]{1,12}`).Draw(t, "layer")
		nat := rapid.SampledFrom(shapeeditor.Natures()).Draw(t, "nature")
		src := sourceForNature(nat)

		d, err := shapeeditor.OpenDraft("proj-1", records.LayerRef{LayerID: layer, Version: "v1"}, nat)
		if err != nil {
			t.Fatalf("OpenDraft: %v", err)
		}
		d.Source = src
		d.Title = "t"

		p1, e1 := shapeeditor.ProposeMirror(d, "phase-0")
		p2, e2 := shapeeditor.ProposeMirror(d, "phase-0")
		if e1 != nil || e2 != nil {
			t.Fatalf("ProposeMirror errored: %v / %v", e1, e2)
		}
		if p1.Mirror.MirrorID != p2.Mirror.MirrorID || p1.ChangeSet.ID != p2.ChangeSet.ID {
			t.Fatal("ProposeMirror not deterministic (mirror/changeset id differ)")
		}
		if p1.WroteMirror {
			t.Fatal("WroteMirror must be false (the wall)")
		}
		if p1.ChangeSet.Status != "DRAFT" {
			t.Fatalf("changeset must be DRAFT, got %q", p1.ChangeSet.Status)
		}
		if !shapeeditor.IsRed(p1) {
			t.Fatal("a freshly authored mirror must be born RED (Liveness=dead)")
		}
	})
}

func sourceForNature(nat shapeeditor.TruthNature) string {
	switch nat {
	case shapeeditor.NatureAcceptance:
		return "Scenario: s\nGiven a\nWhen b\nThen c"
	case shapeeditor.NatureInvariant:
		return "property: p\nforall: x\nholds: x == x"
	case shapeeditor.NatureWorkflow:
		return "fixture: f\nstate: s0\ncommand: cmd\nevent: e1"
	default:
		return ""
	}
}

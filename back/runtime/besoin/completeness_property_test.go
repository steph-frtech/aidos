package besoin

import (
	"encoding/json"
	"testing"

	"pgregory.net/rapid"
)

// completeness_property_test.go — the EL09 reproducibility mirror (∀ invariant, property form, rapid).
// BesoinCompleteness and LevelMirrorForm are DETERMINISTIC pure functions (CLAUDE.md §6/§8): same input
// → same output. These properties pin reproducibility, the completeness LAW (no monster ⇔ every
// resolved node has its right-form mirror and no orphan), and that monster codes stay inside the closed
// set (never invented).

// Property: LevelMirrorForm is TOTAL over the 9 grammar levels and yields a valid closed MirrorForm.
func TestProp_LevelMirrorForm_TotalOverGrammar(t *testing.T) {
	for _, l := range AllLevels() {
		f, ok := LevelMirrorForm(l)
		if !ok {
			t.Fatalf("LevelMirrorForm not total: %q", l)
		}
		if !IsMirrorForm(f) {
			t.Fatalf("LevelMirrorForm(%q)=%q not a closed MirrorForm", l, f)
		}
	}
}

// Property: an out-of-grammar level has NO mirror form (no fabrication for a non-level).
func TestProp_LevelMirrorForm_NonLevelHasNoForm(t *testing.T) {
	for _, l := range OutOfScopeLevels() {
		if _, ok := LevelMirrorForm(l); ok {
			t.Fatalf("LevelMirrorForm fabricated a form for out-of-scope %q", l)
		}
	}
}

// Property: for the 5 rungs derive-mirror covers, this table carries a form CONSISTENT with the KRD
// three-form taxonomy (no fork): entity/invariant → property; control/action/operation/policy →
// fixture. (The derive-mirror agreement, pinned without re-running the LLM skill.)
func TestProp_LevelMirrorForm_AgreesWithDeriveMirrorCovered(t *testing.T) {
	want := map[Level]MirrorForm{
		LevelEntity:    MirrorPropertyN1,
		LevelControl:   MirrorFixtureN2,
		LevelAction:    MirrorFixtureN2,
		LevelOperation: MirrorFixtureN2,
		LevelPolicy:    MirrorFixtureN2,
	}
	for l, w := range want {
		if !DerivedMirrorCovers(l) {
			t.Fatalf("%q should be derive-mirror-covered", l)
		}
		f, _ := LevelMirrorForm(l)
		if f != w {
			t.Fatalf("LevelMirrorForm(%q)=%q, derive-mirror agreement wants %q", l, f, w)
		}
	}
}

// Property: BesoinCompleteness is REPRODUCIBLE — same (graph, mirrors, metadata) → identical report.
func TestProp_Completeness_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		resolved := rapid.Bool().Draw(t, "resolved")
		withMirror := rapid.Bool().Draw(t, "withMirror")
		body, _ := json.Marshal(map[string]any{"intent": "x", "scenarios": []string{"s1"}})
		status := NodeDrafting
		if resolved {
			status = NodeResolved
		}
		g, err := NewGraph("p").AddNode(LevelNode{
			Level: LevelProduct, Body: body, Status: status,
			Provenance: Provenance{Source: "human", Detail: "u"},
		})
		if err != nil {
			t.Fatalf("AddNode: %v", err)
		}
		var mirrors []BesoinLevelMirror
		if withMirror {
			mirrors = []BesoinLevelMirror{{Reflects: LevelProduct, Form: MirrorGherkinN0}}
		}
		meta := map[Level]Metadata{LevelProduct: pElMeta()}
		first := BesoinCompleteness(g, mirrors, meta)
		for i := 0; i < 15; i++ {
			again := BesoinCompleteness(g, mirrors, meta)
			if again.Complete != first.Complete || len(again.Monsters) != len(first.Monsters) {
				t.Fatalf("non-reproducible: %+v vs %+v", first, again)
			}
			for j := range again.Monsters {
				if again.Monsters[j].Code != first.Monsters[j].Code ||
					again.Monsters[j].Level != first.Monsters[j].Level ||
					again.Monsters[j].Explanation != first.Monsters[j].Explanation {
					t.Fatalf("monster order/content drift at %d", j)
				}
			}
		}
	})
}

// Property: the LAW — a graph whose every resolved node has its right-form mirror + live metadata, and
// no orphan mirror, is COMPLETE; otherwise it carries ≥1 monster from the CLOSED code set.
func TestProp_Completeness_LawAndClosedCodes(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		resolved := rapid.Bool().Draw(t, "resolved")
		mirrorPresent := rapid.Bool().Draw(t, "mirrorPresent")
		rightForm := rapid.Bool().Draw(t, "rightForm")
		metaPresent := rapid.Bool().Draw(t, "metaPresent")

		body, _ := json.Marshal(map[string]any{"intent": "x", "scenarios": []string{"s1"}})
		status := NodeDrafting
		if resolved {
			status = NodeResolved
		}
		g, _ := NewGraph("p").AddNode(LevelNode{
			Level: LevelProduct, Body: body, Status: status,
			Provenance: Provenance{Source: "human", Detail: "u"},
		})

		var mirrors []BesoinLevelMirror
		if mirrorPresent {
			form := MirrorGherkinN0
			if !rightForm {
				form = MirrorPropertyN1
			}
			mirrors = []BesoinLevelMirror{{Reflects: LevelProduct, Form: form}}
		}
		meta := map[Level]Metadata{}
		if metaPresent {
			meta[LevelProduct] = pElMeta()
		}

		rep := BesoinCompleteness(g, mirrors, meta)

		// Every emitted monster carries a CLOSED code and a non-empty fix path (never a prison).
		for _, m := range rep.Monsters {
			if !IsMonsterCode(m.Code) {
				t.Fatalf("monster code outside closed set: %q", m.Code)
			}
			if len(m.HowToFix) == 0 {
				t.Fatalf("monster %q has empty how_to_fix (a prison)", m.Code)
			}
		}

		// The law: complete iff resolved ∧ mirrorPresent ∧ rightForm ∧ metaPresent. A non-resolved node
		// carries no obligation, but a present mirror over it is an orphan → not complete.
		shouldBeComplete := resolved && mirrorPresent && rightForm && metaPresent
		if resolved == false && mirrorPresent == false {
			shouldBeComplete = true // no obligation, no orphan.
		}
		if rep.Complete != shouldBeComplete {
			t.Fatalf("law violated: complete=%v want=%v (resolved=%v mirror=%v form=%v meta=%v) monsters=%+v",
				rep.Complete, shouldBeComplete, resolved, mirrorPresent, rightForm, metaPresent, rep.Monsters)
		}
	})
}

// pElMeta mirrors elMeta() for the property file (avoids cross-file helper coupling at parse time).
func pElMeta() Metadata { return elMeta() }

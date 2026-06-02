package lawcoverage

import (
	"testing"

	"pgregory.net/rapid"
)

// matrix_property_test.go is the S45 PROPERTY mirror (test_kind: property,
// cert_language: rapid, authority: below). It proves the law-coverage matrix is
// TOTAL and the harness is DETERMINISTIC — the ∀ statements of the S45 spec:
//
//	∀ law in the §82.1+§29 registry: there is exactly one RED fixture and one GREEN
//	  fixture mapped to it (totality);
//	∀ cell in the matrix: it maps to a registered law (no orphan fixture = no monster);
//	∀ verb it owns: every law is reachable through its owning verb (coverage closure);
//	∀ law: Detect is deterministic — same fragment ⇒ same verdict;
//	∀ green-fragment: Detect → nil; ∀ red-fragment: Detect → a Breach for that law.
//
// These ARE the done criteria (1 law = 1 red + 1 green). The matrix starts FULLY
// RED before the registry + detectors exist; that red IS the /goal.

// TestProp_MatrixIsTotal — every registered law has exactly one matrix cell, and
// every cell maps to a registered law (no law without both fixtures, no orphan).
func TestProp_MatrixIsTotal(t *testing.T) {
	laws := Laws()
	cells := Matrix()
	if len(laws) != len(cells) {
		t.Fatalf("matrix totality: %d laws but %d cells", len(laws), len(cells))
	}
	// every law has exactly one cell.
	for _, l := range laws {
		c, ok := LookupCell(l.ID)
		if !ok {
			t.Fatalf("law %q has no coverage cell (a monster: a law without its fixtures)", l.ID)
		}
		if c.Red == nil || c.Green == nil {
			t.Fatalf("law %q lacks a red or green fixture (1 law = 1 red + 1 green)", l.ID)
		}
	}
	// every cell maps to a registered law (no orphan fixture).
	for _, c := range cells {
		if _, ok := LookupLaw(c.Law); !ok {
			t.Fatalf("orphan fixture: cell %q maps to no registered law (a monster)", c.Law)
		}
	}
}

// TestProp_ExpectedLawSet — the registry is EXACTLY the ten §82.1 laws plus the §29
// completeness law: nothing more, nothing less (the law set is graven, never coined).
func TestProp_ExpectedLawSet(t *testing.T) {
	want := map[LawID]bool{
		LawTruthWithoutKind: true, LawMirrorIncompatible: true, LawScopeAbsent: true,
		LawAuthorityAbsent: true, LawMemoryWithoutGoal: true, LawPhaseNotStable: true,
		LawComposesWeight: true, LawMutationScore: true, LawInvariantTooGlobal: true,
		LawContextDecisionUntst: true, LawCompleteness: true,
	}
	got := map[LawID]bool{}
	for _, l := range Laws() {
		got[l.ID] = true
	}
	if len(got) != len(want) {
		t.Fatalf("law set size: got %d, want %d (exactly §82.1 + §29)", len(got), len(want))
	}
	for id := range want {
		if !got[id] {
			t.Fatalf("law %q missing from the registry", id)
		}
	}
	for id := range got {
		if !want[id] {
			t.Fatalf("law %q is NOT a §82.1/§29 law — no law may be invented", id)
		}
	}
}

// TestProp_RedYieldsBreachGreenYieldsNone — for every law, the RED fragment yields
// a Breach for that law and the GREEN fragment yields nil (the means-test toward
// the human red holds, and a green graph is clean).
func TestProp_RedYieldsBreachGreenYieldsNone(t *testing.T) {
	for _, l := range Laws() {
		c, _ := LookupCell(l.ID)
		red := l.Detect(c.Red)
		if red == nil {
			t.Fatalf("law %q: RED fixture did NOT breach (the law is not detected)", l.ID)
		}
		if red.Law != l.ID {
			t.Fatalf("law %q: breach carries the wrong law id %q", l.ID, red.Law)
		}
		if red.Code == "" || red.Severity == "" || red.Explanation == "" || len(red.HowToFix) == 0 {
			t.Fatalf("law %q: breach is not a complete S13 BlockReason (a prison)", l.ID)
		}
		if green := l.Detect(c.Green); green != nil {
			t.Fatalf("law %q: GREEN fixture breached (false positive: %s)", l.ID, green.Code)
		}
	}
}

// TestProp_CoverageClosure — every law has an owning verb among the five, and every
// law is reachable through it (the keystone rule: no concept exists if no verb
// verifies it).
func TestProp_CoverageClosure(t *testing.T) {
	known := map[Verb]bool{}
	for _, v := range Verbs() {
		known[v] = true
	}
	for _, l := range Laws() {
		if !known[l.OwningVerb] {
			t.Fatalf("law %q has no owning verb among the five (unreachable — a monster)", l.ID)
		}
		if l.DetectorRef == "" {
			t.Fatalf("law %q names no reused detector (a law without an owner is an OpenQuestion, never invented here)", l.ID)
		}
	}
}

// TestProp_DetectIsDeterministic — Detect is a pure function: the same fragment
// yields byte-identical verdicts across repeated calls (no clock, no rng).
func TestProp_DetectIsDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		idx := rapid.IntRange(0, len(Laws())-1).Draw(rt, "law")
		useRed := rapid.Bool().Draw(rt, "red")
		l := Laws()[idx]
		c, _ := LookupCell(l.ID)
		frag := c.Green
		if useRed {
			frag = c.Red
		}
		a := l.Detect(frag)
		b := l.Detect(frag)
		switch {
		case a == nil && b == nil:
			// both green — deterministic.
		case a != nil && b != nil:
			if a.Code != b.Code || a.Law != b.Law || a.Explanation != b.Explanation {
				rt.Fatalf("law %q: Detect not deterministic: %+v vs %+v", l.ID, a, b)
			}
		default:
			rt.Fatalf("law %q: Detect non-deterministic nil-ness", l.ID)
		}
	})
}

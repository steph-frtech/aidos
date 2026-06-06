package besoin

import (
	"testing"

	"pgregory.net/rapid"
)

// thresholds_property_test.go — the EL06 mirror (∀ invariant, property form, rapid). Written RED
// first (CLAUDE.md Mandat A). Two declared, above-the-line capabilities:
//
//   1. BesoinThresholds — ONE content-addressed record holding EVERY gate threshold (the product's
//      ≤N scenarios, the per-rung required fields). EL07 (CanDescend) and EL11 (the Stop hook) read
//      the SAME record — a property pins that no threshold is inlined twice and none drifts. Declared,
//      never learned (CLAUDE.md §8). Pure, deterministic — same defaults → same record + same hash.
//
//   2. OptionSpace(L, L+1) — the ENUMERABLE declared metric per rung-pair: the CLOSED countable set
//      of choices L+1 admits, given L. |OptionSpace(L,L+1)| is an integer computed by a PURE function
//      over a hand-declared closed set, never an LLM judgment. A pair whose OptionSpace is NOT
//      enumerable is a declared OpenQuestion (Enumerable=false), NEVER counted as 0 by default.

// --- BesoinThresholds ---------------------------------------------------------------------------

// Property: DefaultThresholds is REPRODUCIBLE — same call → byte-identical record + identical Hash.
// (declared, never learned; no clock/rng/IO).
func TestThresholds_DefaultsAreReproducible(t *testing.T) {
	first := DefaultThresholds()
	firstHash := first.Hash()
	for n := 0; n < 50; n++ {
		again := DefaultThresholds()
		if again.Hash() != firstHash {
			t.Fatalf("DefaultThresholds() Hash not reproducible: %q vs %q", again.Hash(), firstHash)
		}
		if again.MaxScenarios != first.MaxScenarios {
			t.Fatalf("DefaultThresholds() MaxScenarios drifted: %d vs %d", again.MaxScenarios, first.MaxScenarios)
		}
	}
}

// Property: the product threshold ≤N scenarios is DECLARED in the record (the ROADMAP "≤5 scénarios"),
// and is a positive integer — a single source of truth, not a magic number scattered in callers.
func TestThresholds_ProductMaxScenariosDeclared(t *testing.T) {
	th := DefaultThresholds()
	if th.MaxScenarios <= 0 {
		t.Fatalf("MaxScenarios must be a positive declared bound, got %d", th.MaxScenarios)
	}
	// ROADMAP EL06/EL07: the product's bound is ≤5 scenarios.
	if th.MaxScenarios != 5 {
		t.Fatalf("MaxScenarios = %d, want the declared 5 (ROADMAP ≤5 scénarios)", th.MaxScenarios)
	}
}

// Property: the SINGLE SOURCE RULE — RequiredFieldsFor(level) reads the thresholds record, and that
// record's per-rung required fields are EXACTLY spec.go's RequiredFields (no second, drifting copy).
// EL07 and EL11 must both call RequiredFieldsFor; this pins they cannot read divergent sets.
func TestThresholds_RequiredFieldsHaveNoSecondCopy(t *testing.T) {
	th := DefaultThresholds()
	for _, l := range AllLevels() {
		fromThresholds := th.RequiredFieldsFor(l)
		fromSpec := RequiredFields(l)
		if len(fromThresholds) != len(fromSpec) {
			t.Fatalf("required fields for %q differ: thresholds=%v spec=%v", l, fromThresholds, fromSpec)
		}
		for i := range fromSpec {
			if fromThresholds[i] != fromSpec[i] {
				t.Fatalf("required field drift for %q at %d: thresholds=%q spec=%q", l, i, fromThresholds[i], fromSpec[i])
			}
		}
	}
}

// Property: the thresholds record is TOTAL over the grammar — RequiredFieldsFor is defined for every
// valid Level (no missing rung) and nil for an out-of-grammar level (never a guessed default).
func TestThresholds_RequiredFieldsTotalOverGrammar(t *testing.T) {
	th := DefaultThresholds()
	for _, l := range AllLevels() {
		if th.RequiredFieldsFor(l) == nil {
			t.Fatalf("RequiredFieldsFor(%q) is nil for a valid level", l)
		}
	}
	if got := th.RequiredFieldsFor(Level("saga")); got != nil {
		t.Fatalf("RequiredFieldsFor out-of-grammar saga must be nil, got %v", got)
	}
}

// Property: the record is a VALUE (above-the-line config) — copying it and reading it back yields the
// same Hash (content-addressed). Mutating a returned slice does not change the record.
func TestThresholds_ContentAddressedAndImmutable(t *testing.T) {
	th := DefaultThresholds()
	h := th.Hash()
	got := th.RequiredFieldsFor(LevelProduct)
	if len(got) > 0 {
		got[0] = "tampered"
	}
	if th.Hash() != h {
		t.Fatalf("mutating a returned slice changed the record Hash (not immutable)")
	}
}

// --- OptionSpace --------------------------------------------------------------------------------

// Property: every ENUMERABLE pair has |OptionSpace| as a POSITIVE integer computed by a pure function
// over the declared closed set — never 0, never an LLM judgment. Non-enumerable pairs are skipped
// (they are OpenQuestions, asserted separately).
func TestOptionSpace_EnumerablePairsCountPositiveDeterministic(t *testing.T) {
	for _, p := range OptionSpacePairs() {
		os, ok := OptionSpaceFor(p.From, p.To)
		if !ok {
			t.Fatalf("OptionSpaceFor(%q,%q) not found but listed in OptionSpacePairs()", p.From, p.To)
		}
		if !os.Enumerable {
			continue // an OpenQuestion pair — asserted in the OpenQuestion property
		}
		n := os.Size()
		if n <= 0 {
			t.Fatalf("enumerable OptionSpace(%q→%q) size = %d, must be a positive count", p.From, p.To, n)
		}
		if n != len(os.Choices) {
			t.Fatalf("Size() %d != len(Choices) %d for %q→%q", n, len(os.Choices), p.From, p.To)
		}
	}
}

// Property: a pair WITHOUT an enumerable closed set is a DECLARED OpenQuestion (Enumerable=false,
// non-empty OpenQuestion reason) and is NEVER silently counted to 0 (Size returns -1 as the
// "unknown / not-enumerable" sentinel, never 0). This is the anti-fabrication guard.
func TestOptionSpace_NonEnumerablePairIsOpenQuestionNotZero(t *testing.T) {
	for _, p := range OptionSpacePairs() {
		os, _ := OptionSpaceFor(p.From, p.To)
		if os.Enumerable {
			if os.OpenQuestion != "" {
				t.Fatalf("enumerable pair %q→%q must carry NO OpenQuestion, got %q", p.From, p.To, os.OpenQuestion)
			}
			continue
		}
		if os.OpenQuestion == "" {
			t.Fatalf("non-enumerable pair %q→%q must declare an OpenQuestion reason", p.From, p.To)
		}
		if os.Size() == 0 {
			t.Fatalf("non-enumerable pair %q→%q must NOT be counted as 0 (fabricated metric); want sentinel", p.From, p.To)
		}
		if os.Size() != -1 {
			t.Fatalf("non-enumerable pair %q→%q Size() = %d, want -1 sentinel", p.From, p.To, os.Size())
		}
	}
}

// Property: OptionSpacePairs are exactly the consecutive SOURCE rung pairs (L → NextLevel(L)) — the
// metric is keyed by ADJACENT rungs of the descent, total and closed, no fabricated pair.
func TestOptionSpace_PairsAreAdjacentSourceRungs(t *testing.T) {
	want := map[[2]Level]bool{}
	for _, l := range Levels() {
		if next, ok := NextLevel(l); ok {
			want[[2]Level{l, next}] = true
		}
	}
	got := map[[2]Level]bool{}
	for _, p := range OptionSpacePairs() {
		next, ok := NextLevel(p.From)
		if !ok || next != p.To {
			t.Fatalf("OptionSpace pair %q→%q is NOT an adjacent SOURCE-rung pair", p.From, p.To)
		}
		got[[2]Level{p.From, p.To}] = true
	}
	if len(got) != len(want) {
		t.Fatalf("OptionSpacePairs count %d != adjacent source-rung pairs %d", len(got), len(want))
	}
	for k := range want {
		if !got[k] {
			t.Fatalf("OptionSpacePairs missing adjacent pair %q→%q", k[0], k[1])
		}
	}
}

// Property: REPRODUCIBLE — same pair → same OptionSpace (same Size, same Choices order) every call.
func TestOptionSpace_Reproducible(t *testing.T) {
	pairs := OptionSpacePairs()
	rapid.Check(t, func(rt *rapid.T) {
		p := pairs[rapid.IntRange(0, len(pairs)-1).Draw(rt, "i")]
		first, _ := OptionSpaceFor(p.From, p.To)
		for n := 0; n < 20; n++ {
			again, _ := OptionSpaceFor(p.From, p.To)
			if again.Size() != first.Size() || again.Enumerable != first.Enumerable {
				rt.Fatalf("OptionSpaceFor(%q,%q) not reproducible", p.From, p.To)
			}
			for i := range first.Choices {
				if again.Choices[i] != first.Choices[i] {
					rt.Fatalf("OptionSpaceFor(%q,%q) choices reordered", p.From, p.To)
				}
			}
		}
	})
}

// Property: an out-of-grammar / non-adjacent pair is NOT found (ok=false) — never a fabricated
// OptionSpace. Reuses the wall-honesty discipline: no metric invented for an unknown pair.
func TestOptionSpace_UnknownPairNotFound(t *testing.T) {
	if _, ok := OptionSpaceFor(LevelEntity, LevelProduct); ok {
		t.Fatalf("OptionSpaceFor(entity→product) must NOT be found (not an adjacent descent pair)")
	}
	if _, ok := OptionSpaceFor(Level("saga"), Level("temporal")); ok {
		t.Fatalf("OptionSpaceFor(saga→temporal) must NOT be found (out of grammar)")
	}
}

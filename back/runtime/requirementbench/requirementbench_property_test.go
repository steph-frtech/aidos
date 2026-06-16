package requirementbench

// requirementbench_property_test.go — the DG02 CONTRACT mirror (invariant ∀), the reproducibility +
// purity property test for the RequirementBench port (ADR 0088). Written as the done-criterion of
// DG02: a CompletenessReport is a PURE DERIVATION of (spec, candidates) — same inputs → same report —
// with NO truth written (read-only; the port never touches the truth-store).
//
// The contract proven here, over arbitrary specs + arbitrary candidate outputs:
//
//  1. REPRODUCIBILITY (the reproducibility mirror, §6/§8). RecompileOnlyBench.Run(spec, candidates)
//     is byte-for-byte equal across replays (100×) — same (spec, candidates) → same report. No clock,
//     no rng, no map-iteration leak into the output (every set is sorted).
//  2. PURELY DERIVED. The report's PresentTypes is exactly the union of Extract over each candidate,
//     and MatchPct/MissingTypes are a pure function of (PresentTypes, spec.ExpectedKinds). Nothing
//     else feeds the report — no model identity, no candidate order beyond the union.
//  3. MISSING is counted right. A requirement type EXPECTED by the spec but surfaced by NO candidate
//     is reported MissingType; MatchPct = covered/expected.
//  4. ANTI-FALSE-POSITIVE (like the dissimilar control CE01). A type covered by >=1 candidate is
//     NEVER reported missing — adding a candidate can only SHRINK MissingTypes, never grow it
//     (monotonicity), and a type genuinely present is never a false-negative.
//  5. THE WALL. Run returns a VALUE; this package imports no DB, no kernel/mirrors/fitness writer.
//     (Enforced structurally by the import graph; asserted here by the absence of any such call.)

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// bench is the object under test: the DETERMINISTIC fallback behind the port (the "recompile seul").
// The same property certifies any future model-backed adapter, because the report is re-judged by the
// shared pure Derive — the model's Text is the only thing that varies, and it is always re-extracted.
var bench RequirementBench = RecompileOnlyBench{}

// genTaggedText builds a candidate output that surfaces a RANDOM subset of the closed taxonomy, by
// emitting one tagged line per drawn kind using a real marker for that kind. This makes the candidate
// outputs realistic (tagged requirement notes, the format the DG04 prompt imposes) while keeping the
// extracted SET fully controlled — so the property can assert exact set arithmetic, not approximate.
func genTaggedText(t *rapid.T, label string) (string, []RequirementKind) {
	markers := kindMarkers()
	all := AllKinds()
	chosen := []RequirementKind{}
	text := "# candidate " + label + "\n"
	for _, k := range all {
		if rapid.Bool().Draw(t, label+":has:"+string(k)) {
			chosen = append(chosen, k)
			// use the FIRST declared marker for this kind as the tagged line.
			text += markers[k][0] + " something\n"
		}
	}
	return text, Extract(text) // the extracted set is the ground truth (Extract is the judge)
}

// genSpec builds a spec whose ExpectedKinds is a random subset of the taxonomy.
func genSpec(t *rapid.T) Spec {
	all := AllKinds()
	expected := []RequirementKind{}
	for _, k := range all {
		if rapid.Bool().Draw(t, "expect:"+string(k)) {
			expected = append(expected, k)
		}
	}
	id := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "specID")
	return Spec{ID: id, SpecText: "# besoin " + id, ExpectedKinds: expected}
}

// genCandidates builds 0..4 candidate outputs (one may be the "single" recompile baseline).
func genCandidates(t *rapid.T) []LLMOutput {
	n := rapid.IntRange(0, 4).Draw(t, "nCandidates")
	roles := []string{"single", "A", "B", "C"}
	cands := make([]LLMOutput, 0, n)
	for i := 0; i < n; i++ {
		text, _ := genTaggedText(t, roles[i])
		cands = append(cands, LLMOutput{Role: roles[i], Text: text})
	}
	return cands
}

// TestReproducible — the reproducibility mirror: same (spec, candidates) → same report, 100× replays.
func TestReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpec(t)
		cands := genCandidates(t)

		first, err := bench.Run(spec, cands)
		if err != nil {
			t.Fatalf("Run returned an error on pure inputs: %v", err)
		}
		for i := 0; i < 100; i++ {
			again, err := bench.Run(spec, cands)
			if err != nil {
				t.Fatalf("replay %d errored: %v", i, err)
			}
			if !reflect.DeepEqual(first, again) {
				t.Fatalf("non-reproducible report at replay %d:\n first=%+v\n again=%+v", i, first, again)
			}
		}
	})
}

// TestPurelyDerived — PresentTypes is exactly union(Extract over each candidate), and MatchPct /
// MissingTypes are a pure function of (PresentTypes, ExpectedKinds). The port adds nothing else.
func TestPurelyDerived(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpec(t)
		cands := genCandidates(t)

		rep, err := bench.Run(spec, cands)
		if err != nil {
			t.Fatalf("Run errored: %v", err)
		}

		// PresentTypes must equal the independent re-computation of union(Extract per candidate).
		sets := make([][]RequirementKind, 0, len(cands))
		for _, c := range cands {
			sets = append(sets, Extract(c.Text))
		}
		wantPresent := union(sets...)
		if !reflect.DeepEqual(rep.PresentTypes, wantPresent) {
			t.Fatalf("PresentTypes not the union of Extract:\n got=%v\n want=%v", rep.PresentTypes, wantPresent)
		}
		if rep.PresentCount != len(wantPresent) {
			t.Fatalf("PresentCount=%d, want %d", rep.PresentCount, len(wantPresent))
		}

		// MissingTypes must equal ExpectedKinds \ PresentTypes; MatchPct = covered/expected.
		wantMissing := diff(sortedExpected(spec.ExpectedKinds), wantPresent)
		if !reflect.DeepEqual(rep.MissingTypes, wantMissing) {
			t.Fatalf("MissingTypes wrong:\n got=%v\n want=%v", rep.MissingTypes, wantMissing)
		}
		if rep.ExpectedCount != len(sortedExpected(spec.ExpectedKinds)) {
			t.Fatalf("ExpectedCount=%d, want %d", rep.ExpectedCount, len(sortedExpected(spec.ExpectedKinds)))
		}
		var wantPct float64
		if rep.ExpectedCount == 0 {
			wantPct = 1.0
		} else {
			covered := rep.ExpectedCount - len(wantMissing)
			wantPct = float64(covered) / float64(rep.ExpectedCount)
		}
		if rep.MatchPct != wantPct {
			t.Fatalf("MatchPct=%v, want %v", rep.MatchPct, wantPct)
		}
		if rep.MatchPct < 0 || rep.MatchPct > 1 {
			t.Fatalf("MatchPct out of [0,1]: %v", rep.MatchPct)
		}
		// The report carries the spec's own id (no leakage of another spec).
		if rep.SpecID != spec.ID {
			t.Fatalf("SpecID=%q, want %q", rep.SpecID, spec.ID)
		}
	})
}

// TestMissingNotFalsePositive — anti-false-positive (the dissimilar-control discipline, CE01): a type
// surfaced by >=1 candidate is NEVER reported missing, and adding a candidate can only SHRINK the
// missing set (monotonicity). A type genuinely present is never a false-negative.
func TestMissingNotFalsePositive(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpec(t)
		cands := genCandidates(t)

		rep, err := bench.Run(spec, cands)
		if err != nil {
			t.Fatalf("Run errored: %v", err)
		}
		present := asSet(rep.PresentTypes)
		// No present type appears in MissingTypes.
		for _, m := range rep.MissingTypes {
			if present[m] {
				t.Fatalf("type %q is both present and missing (false positive missing)", m)
			}
		}
		// Every present type that is expected is NOT missing (no false negative).
		missing := asSet(rep.MissingTypes)
		for _, e := range spec.ExpectedKinds {
			if present[e] && missing[e] {
				t.Fatalf("expected type %q is covered yet reported missing", e)
			}
		}

		// Monotonicity: adding one MORE candidate that covers extra types never grows MissingTypes.
		extraText, _ := genTaggedText(t, "extra")
		bigger := append(append([]LLMOutput{}, cands...), LLMOutput{Role: "extra", Text: extraText})
		rep2, err := bench.Run(spec, bigger)
		if err != nil {
			t.Fatalf("Run on bigger set errored: %v", err)
		}
		miss1 := asSet(rep.MissingTypes)
		for _, m := range rep2.MissingTypes {
			if !miss1[m] {
				t.Fatalf("adding a candidate GREW MissingTypes with %q (non-monotone)", m)
			}
		}
		if rep2.MatchPct < rep.MatchPct {
			t.Fatalf("adding a candidate LOWERED MatchPct: %v -> %v", rep.MatchPct, rep2.MatchPct)
		}
	})
}

// TestEmptyCandidatesIsGovernedFloor — the governed degradation: no candidates (a model absent) does
// NOT panic and does NOT error; it yields the honest floor (nothing present ⇒ everything expected is
// missing, MatchPct 0 unless nothing is expected). This is the "recompile seul" fallback contract.
func TestEmptyCandidatesIsGovernedFloor(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpec(t)
		rep, err := bench.Run(spec, nil)
		if err != nil {
			t.Fatalf("empty candidates errored (should be governed, not error): %v", err)
		}
		if len(rep.PresentTypes) != 0 {
			t.Fatalf("empty candidates surfaced types: %v", rep.PresentTypes)
		}
		wantMissing := sortedExpected(spec.ExpectedKinds)
		if !reflect.DeepEqual(rep.MissingTypes, wantMissing) {
			t.Fatalf("empty floor MissingTypes:\n got=%v\n want=%v", rep.MissingTypes, wantMissing)
		}
		if len(spec.ExpectedKinds) == 0 {
			if rep.MatchPct != 1.0 {
				t.Fatalf("vacuous coverage should be 1.0, got %v", rep.MatchPct)
			}
		} else if rep.MatchPct != 0.0 {
			t.Fatalf("no candidates with expected types should give MatchPct 0, got %v", rep.MatchPct)
		}
	})
}

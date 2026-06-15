// measure_test.go — THROWAWAY (DG01 spike). The EXECUTABLE falsifiability proof. A spike is exempt
// from mirror-first (KRD §84), but this test IS the falsifiability check — it answers the ONE
// question with numbers, not hope: does comparing >=2 LLM outputs on a single spec reveal requirement
// TYPES a single deterministic recompile would miss? TestReproducible is the determinism-first
// reproducibility mirror (fixture seam, no network): same input -> same metric.
package diffusiongemma

import "testing"

// TestSpikeVerdict runs the full differential measurement on the fixture seam and PRINTS the report.
// It fails only if the spike is internally inconsistent (claims GO while a guard is violated) — the
// GO/NO-GO verdict itself is data the spike reports, not a pass/fail of the test.
func TestSpikeVerdict(t *testing.T) {
	v, err := Decide(CheckoutSpec, FixtureLLM{}, false)
	if err != nil {
		t.Fatalf("Decide error: %v", err)
	}
	r := v.Report

	t.Logf("=== DG01 SPIKE — differential LLM completeness on spec %q (fixtures) ===", r.SpecID)
	t.Logf("single recompile types (%d): %v", r.SingleCount, r.SingleKinds)
	t.Logf("model A types (%d): %v", len(r.AKinds), r.AKinds)
	t.Logf("model B types (%d): %v", len(r.BKinds), r.BKinds)
	t.Logf("UNION types (%d): %v", r.UnionCount, r.UnionKinds)
	t.Logf("SURPLUS over single recompile (%d, floor=%d): %v", r.SurplusCount, v.SurplusFloor, r.SurplusOverSingle)
	t.Logf("union over BEST single model (%d): %v", r.UnionOverBestModelCnt, r.UnionOverBestModel)
	t.Logf("spec coverage match%%: single=%.1f%% union=%.1f%% (expected types=%d)",
		r.SingleMatchPct*100, r.UnionMatchPct*100, r.ExpectedCount)
	t.Logf("expected types MISSED by single: %v", r.MissingFromSingle)
	t.Logf("expected types MISSED even by union (honest residual): %v", r.MissingFromUnion)
	t.Logf("VERDICT: GO=%v usedRealLLM=%v — %s", v.Go, v.UsedRealLLM, v.Rationale)

	// Internal consistency: a GO verdict must actually clear every gate.
	if v.Go {
		if r.SurplusCount < v.SurplusFloor {
			t.Fatalf("inconsistent: GO but surplus %d < floor %d", r.SurplusCount, v.SurplusFloor)
		}
		if r.UnionOverBestModelCnt < MinUnionOverBestModel {
			t.Fatalf("inconsistent: GO but union does not beat best single model")
		}
		if r.UnionMatchPct <= r.SingleMatchPct {
			t.Fatalf("inconsistent: GO but union match%% does not exceed single match%%")
		}
	}
}

// TestUnionExceedsSingle is the CENTRAL falsifiable claim: the union of two divergent LLM outputs
// surfaces strictly more requirement TYPES than the single recompile. If this fails, the differential
// idea is falsified and the verdict is NO-GO — never a fabricated GO.
func TestUnionExceedsSingle(t *testing.T) {
	rep, err := Measure(CheckoutSpec, FixtureLLM{})
	if err != nil {
		t.Fatalf("Measure error: %v", err)
	}
	if rep.UnionCount <= rep.SingleCount {
		t.Errorf("union (%d) does not exceed single recompile (%d) — differential falsified",
			rep.UnionCount, rep.SingleCount)
	}
	if rep.SurplusCount == 0 {
		t.Errorf("zero surplus types — the differential reveals nothing new")
	}
}

// TestSurplusAreRealMissedTypes asserts the surplus is GROUNDED: every type the union adds over the
// single recompile is a type the single recompile was MISSING from the spec's expected coverage
// (anti-Goodhart — the surplus is not noise/markers that don't matter to the need). At least the
// cross-cutting facets a recompile structurally can't infer must be among them.
func TestSurplusAreRealMissedTypes(t *testing.T) {
	rep, err := Measure(CheckoutSpec, FixtureLLM{})
	if err != nil {
		t.Fatalf("Measure error: %v", err)
	}
	missedBySingle := asSet(rep.MissingFromSingle)
	groundedSurplus := 0
	for _, k := range rep.SurplusOverSingle {
		if missedBySingle[k] {
			groundedSurplus++
		}
	}
	if groundedSurplus == 0 {
		t.Errorf("none of the surplus types %v are in the spec's missed-by-single set %v",
			rep.SurplusOverSingle, rep.MissingFromSingle)
	}
	// The formal facets a happy-path recompile cannot infer must be revealed by the differential.
	want := []RequirementKind{KindInvariant, KindPolicy}
	us := asSet(rep.UnionKinds)
	ss := asSet(rep.SingleKinds)
	for _, k := range want {
		if !us[k] {
			t.Errorf("expected the differential union to reveal %q (a recompile can't infer it)", k)
		}
		if ss[k] {
			t.Errorf("the single recompile unexpectedly already had %q — fixture not representative", k)
		}
	}
}

// TestDifferentialEarnsSecondModel asserts the union beats the BETTER single model — i.e. the second
// model adds at least one type the first lacked. If a single model already covered everything, the
// DIFFERENTIAL (>=2 models) would be pointless and the verdict should reflect that.
func TestDifferentialEarnsSecondModel(t *testing.T) {
	rep, err := Measure(CheckoutSpec, FixtureLLM{})
	if err != nil {
		t.Fatalf("Measure error: %v", err)
	}
	if rep.UnionOverBestModelCnt < MinUnionOverBestModel {
		t.Errorf("the differential does not earn its second model: union adds %d types over best model",
			rep.UnionOverBestModelCnt)
	}
}

// TestExtractIsClosedAndPure asserts the extractor only ever returns kinds from the closed taxonomy
// and never invents one — the metric vocabulary is bounded and declared.
func TestExtractIsClosedAndPure(t *testing.T) {
	all := asSet(AllKinds())
	for _, out := range fixtureOutputs() {
		for _, k := range Extract(out) {
			if !all[k] {
				t.Errorf("Extract returned %q outside the closed taxonomy", k)
			}
		}
	}
}

// TestExtractEmptyIsEmpty asserts the anti-false-positive frontier: an output with NO requirement
// markers yields the EMPTY set (a dissimilar/garbage output fabricates no coverage — like CE01's
// dissimilar control). Guards against a metric that always reports surplus.
func TestExtractEmptyIsEmpty(t *testing.T) {
	for _, junk := range []string{"", "hello world\nthis is prose with no tags", "lorem ipsum dolor"} {
		if got := Extract(junk); len(got) != 0 {
			t.Errorf("Extract(%q) = %v, want empty (no false-positive coverage)", junk, got)
		}
	}
}

// TestReproducible is the DETERMINISM-FIRST reproducibility mirror: the same spec + same fixture seam
// yields the SAME report and verdict every time — the metric is a pure function, no LLM, no clock, no
// rng crosses the seam (FixtureLLM is a pure lookup). Run 100x; any drift fails. This is the property
// the real DG03 port carries: same (spec, outputs) -> same report; model off -> replay stays green.
func TestReproducible(t *testing.T) {
	first, err := Measure(CheckoutSpec, FixtureLLM{})
	if err != nil {
		t.Fatalf("Measure error: %v", err)
	}
	for i := 0; i < 100; i++ {
		got, err := Measure(CheckoutSpec, FixtureLLM{})
		if err != nil {
			t.Fatalf("iter %d: %v", i, err)
		}
		if got.SingleCount != first.SingleCount ||
			got.UnionCount != first.UnionCount ||
			got.SurplusCount != first.SurplusCount ||
			got.UnionMatchPct != first.UnionMatchPct ||
			got.SingleMatchPct != first.SingleMatchPct {
			t.Fatalf("iter %d: metric not reproducible: %+v vs %+v", i, got, first)
		}
		if !equalKinds(got.UnionKinds, first.UnionKinds) || !equalKinds(got.SurplusOverSingle, first.SurplusOverSingle) {
			t.Fatalf("iter %d: kind sets not reproducible", i)
		}
	}
	// And the verdict itself is stable.
	v1, _ := Decide(CheckoutSpec, FixtureLLM{}, false)
	v2, _ := Decide(CheckoutSpec, FixtureLLM{}, false)
	if v1.Go != v2.Go {
		t.Fatalf("verdict not reproducible: %v vs %v", v1.Go, v2.Go)
	}
}

// TestWallRespected asserts the spike writes no truth: Measure/Decide are pure derivations returning
// values, holding no DB handle, no kernel/mirrors/fitness writer. (A structural reminder — the module
// imports nothing but stdlib; see go.mod / the import lists.)
func TestWallRespected(t *testing.T) {
	// The report is a value derived from candidate text; nothing here can write truth. This test
	// documents the invariant; the real guarantee is the standalone module that never imports back/.
	rep, err := Measure(CheckoutSpec, FixtureLLM{})
	if err != nil {
		t.Fatalf("Measure error: %v", err)
	}
	if rep.SpecID != CheckoutSpec.ID {
		t.Fatalf("report drifted from input spec")
	}
}

func equalKinds(a, b []RequirementKind) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

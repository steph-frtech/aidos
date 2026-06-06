// measure_test.go — THROWAWAY (CE01 spike). The EXECUTABLE falsifiability proof: it measures the
// effort delta WITH vs WITHOUT capturing the first goal's pattern, and computes the go/no-go
// verdict. A spike is exempt from mirror-first (KRD §84), but this test IS the falsifiability
// check — it answers "does capturing the 1st goal's motif reduce the 2nd similar goal's
// effort/tokens?" with numbers, not hope. TestReproducible pins same-input -> same-output
// (determinism-first).
package compound

import "testing"

// TestSpikeVerdict runs the full spike and PRINTS the report. It fails only if the spike is
// internally inconsistent (claims GO while the floor/ceiling/reproducibility guards are violated)
// — the verdict itself (GO/NO-GO) is data the spike reports, not a pass/fail of the test.
func TestSpikeVerdict(t *testing.T) {
	v := Decide()

	t.Logf("=== CE01 SPIKE — compound capitalisation: capture goal-1 -> cheaper goal-2 ===")
	s := v.Similar
	t.Logf("[SIMILAR %s] goal1=%d  goal2 no-capture=%d  goal2 with-capture=%d", s.Pair, s.Goal1Cost, s.Goal2WithoutCap, s.Goal2WithCap)
	t.Logf("   saved=%d tokens  reduction=%.1f%%  reused: procedural=%d behavior=%d  pattern=%s",
		s.SavedTokens, s.ReductionFrac*100, s.ReusedProcedural, s.ReusedBehavior, s.PatternHash)
	d := v.Dissimilar
	t.Logf("[DISSIMILAR control %s] goal2 no-capture=%d with-capture=%d reduction=%.1f%% (ceiling=%.1f%%)",
		d.Pair, d.Goal2WithoutCap, d.Goal2WithCap, d.ReductionFrac*100, v.DissimilarCeil*100)
	t.Logf("floor=%.1f%%  reproducible=%v", v.ReductionFloor*100, v.Reproducible)
	t.Logf("VERDICT: GO=%v — %s", v.Go, v.Rationale)

	// Internal consistency: a GO verdict must clear the floor, stay under the dissimilar ceiling,
	// and be reproducible — never a fabricated GO.
	if v.Go && (s.ReductionFrac < v.ReductionFloor || d.ReductionFrac > v.DissimilarCeil || !v.Reproducible) {
		t.Fatalf("inconsistent verdict: GO but guards violated (similar=%.3f floor=%.3f dissimilar=%.3f ceil=%.3f repro=%v)",
			s.ReductionFrac, v.ReductionFloor, d.ReductionFrac, v.DissimilarCeil, v.Reproducible)
	}
}

// TestCaptureReducesSimilarGoal is the central claim: capturing goal-1 strictly reduces goal-2's
// cost when the goals are similar (the compound payoff exists).
func TestCaptureReducesSimilarGoal(t *testing.T) {
	d := MeasureDelta("similar", goal1(), goal2())
	if d.Goal2WithCap >= d.Goal2WithoutCap {
		t.Errorf("capture did not reduce goal-2: %d -> %d", d.Goal2WithoutCap, d.Goal2WithCap)
	}
	if d.SavedTokens <= 0 {
		t.Errorf("no tokens saved: %d", d.SavedTokens)
	}
}

// TestIntrinsicUnitNeverReused asserts the goal-specific (non-shareable) unit is ALWAYS derived
// in full even with capture — capitalisation reuses the MOTIF, never the goal's own substance
// (no fabricated reuse of intrinsic work; honesty of the model).
func TestIntrinsicUnitNeverReused(t *testing.T) {
	p := Capture(goal1())
	set, via := p.CapturedSet()
	c := CostOf(goal2(), set, via)
	for _, uc := range c.PerUnit {
		if uc.Name == "write_operation" {
			if uc.Origin != Derived {
				t.Errorf("intrinsic unit write_operation was reused (origin=%s) — fabricated reuse", uc.Origin)
			}
			if uc.Tokens != 1800 {
				t.Errorf("intrinsic unit not paid in full: %d", uc.Tokens)
			}
		}
	}
}

// TestCaptureHelpsOnlySimilar is the FALSE-POSITIVE guard: capture must NOT manufacture a
// meaningful saving on a dissimilar goal. The reduction on the dissimilar control must stay below
// the declared ceiling.
func TestCaptureHelpsOnlySimilar(t *testing.T) {
	d := MeasureDelta("dissimilar", goal1(), dissimilarGoal())
	if d.ReductionFrac > DissimilarCeil {
		t.Errorf("capture over-claimed on a dissimilar goal: reduction=%.3f > ceiling=%.3f", d.ReductionFrac, DissimilarCeil)
	}
}

// TestCaptureSplitsProceduralVsBehavior asserts the captured pattern routes SPEC units to
// behavior-macro expansion and GESTURE units to procedural recall — the two reuse modes the
// roadmap names (CE03 KindProcedural + CE04 behavior-macro). Both must be exercised.
func TestCaptureSplitsProceduralVsBehavior(t *testing.T) {
	d := MeasureDelta("similar", goal1(), goal2())
	if d.ReusedBehavior == 0 {
		t.Error("no spec unit reused via behavior-macro expansion — §24.6 path not exercised")
	}
	if d.ReusedProcedural == 0 {
		t.Error("no gesture unit reused via procedural recall — S31 KindProcedural path not exercised")
	}
}

// TestReproducible is the DETERMINISM-FIRST reproducibility mirror: the same goals + same capture
// yield the SAME delta, the SAME pattern hash and the SAME verdict every time — the measurement
// (and the pattern EXPANSION) is a pure function, no LLM, no clock, no rng. Run many times; any
// drift fails.
func TestReproducible(t *testing.T) {
	for i := 0; i < 100; i++ {
		v1 := Decide()
		v2 := Decide()
		if v1.Go != v2.Go || v1.Similar.ReductionFrac != v2.Similar.ReductionFrac || v1.Similar.PatternHash != v2.Similar.PatternHash {
			t.Fatalf("verdict not reproducible: %+v vs %+v", v1.Similar, v2.Similar)
		}
		p1 := Capture(goal1())
		p2 := Capture(goal1())
		if p1.Hash != p2.Hash || len(p1.Units) != len(p2.Units) {
			t.Fatalf("Capture not reproducible: %s vs %s", p1.Hash, p2.Hash)
		}
		for name, origin := range p1.Units {
			if p2.Units[name] != origin {
				t.Fatalf("pattern drift at %s: %s vs %s", name, origin, p2.Units[name])
			}
		}
	}
}

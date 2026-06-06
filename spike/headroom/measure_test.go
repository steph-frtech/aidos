// measure_test.go — THROWAWAY (HR01 spike). The EXECUTABLE falsifiability proof: it measures
// token reduction + fidelity on the AIDOS prompts and computes the go/no-go verdict. A spike is
// exempt from mirror-first (KRD §84), but this test IS the falsifiability check — it answers
// "does retrieve∘compress reduce tokens while preserving the carrier facts?" with numbers, not
// hope. The reproducibility check (determinism-first) pins same-input -> same-output.
package headroom

import (
	"strings"
	"testing"
)

// TestSpikeVerdict runs the full spike: measure + fidelity + verdict, and PRINTS the report.
// It fails only if the spike is internally inconsistent (e.g. claims GO but a carrier was lost)
// — the verdict itself (GO/NO-GO) is data the spike reports, not a pass/fail of the test.
func TestSpikeVerdict(t *testing.T) {
	v := Decide()

	t.Logf("=== HR01 SPIKE — headroom retrieve∘compress on AIDOS prompts ===")
	t.Logf("--- LOSSLESS reference-replacement (determinism-safe) ---")
	for _, r := range v.Reductions {
		t.Logf("[%s] tokens %d -> %d (reduction %.1f%%)", r.Prompt, r.TokensBefore, r.TokensAfter, r.ReductionFrac*100)
	}
	for _, f := range v.Fidelities {
		t.Logf("[%s] lossless=%v carriers_checked=%d carriers_lost=%v", f.Prompt, f.Lossless, f.CarriersChecked, f.CarriersLost)
	}
	t.Logf("lossless MEAN reduction=%.1f%% allLossless=%v anyCarrierLost=%v",
		v.LosslessMeanReduction*100, v.AllLossless, v.AnyLosslessCarrierLost)

	t.Logf("--- LOSSY restatement-drop (realistic high-reduction, fidelity ASSERTED) ---")
	for _, lr := range v.LossyReports {
		t.Logf("[%s] tokens %d -> %d (reduction %.1f%%) byteLossless=%v carriers_lost=%v",
			lr.Prompt, lr.TokensBefore, lr.TokensAfter, lr.ReductionFrac*100, lr.ByteLossless, lr.CarriersLost)
	}
	t.Logf("lossy MEAN reduction=%.1f%% MIN=%.1f%% floor=%.1f%% anyCarrierLost=%v",
		v.LossyMeanReduction*100, v.LossyMinReduction*100, v.ReductionFloor*100, v.AnyLossyCarrierLost)
	t.Logf("VERDICT: GO=%v — %s", v.Go, v.Rationale)

	// Internal consistency: a GO verdict must NOT have lost a carrier in either mode, and must
	// have a lossless fallback.
	if v.Go && (v.AnyLossyCarrierLost || v.AnyLosslessCarrierLost || !v.AllLossless) {
		t.Fatalf("inconsistent verdict: GO but fidelity broken (lossyLost=%v losslessLost=%v lossless=%v)",
			v.AnyLossyCarrierLost, v.AnyLosslessCarrierLost, v.AllLossless)
	}
}

// TestLosslessRoundTrip asserts Retrieve(Compress(x)) == Normalize(x) for every AIDOS prompt —
// the losslessness property the gate's determinism depends on.
func TestLosslessRoundTrip(t *testing.T) {
	for name, p := range AllPrompts() {
		c := Compress(p)
		got := Retrieve(c)
		want := Normalize(p)
		if got != want {
			t.Errorf("[%s] NOT lossless:\n got=%q\nwant=%q", name, got, want)
		}
	}
}

// TestCarrierFactsSurvive asserts every load-bearing carrier fact present in a prompt is still
// present after retrieve∘compress — the "préserve les faits porteurs" claim.
func TestCarrierFactsSurvive(t *testing.T) {
	carriers := CarrierFacts()
	for name, p := range AllPrompts() {
		f := Fidelity(name, p, carriers)
		if len(f.CarriersLost) > 0 {
			t.Errorf("[%s] lost carrier facts: %v", name, f.CarriersLost)
		}
		if f.CarriersChecked == 0 {
			t.Errorf("[%s] no carrier facts checked — fixture/carrier mismatch", name)
		}
	}
}

// TestReductionIsPositive asserts the compression actually removes tokens on each AIDOS prompt
// (the mechanism does something).
func TestReductionIsPositive(t *testing.T) {
	for name, p := range AllPrompts() {
		r := Measure(name, p)
		if r.TokensAfter >= r.TokensBefore {
			t.Errorf("[%s] no reduction: %d -> %d", name, r.TokensBefore, r.TokensAfter)
		}
	}
}

// TestLossyPreservesCarriers asserts the high-reduction (lossy) mode preserves EVERY carrier
// fact — the central fidelity claim for the mode HR02–HR05 would wire. If this ever fails, the
// spike verdict flips to NO-GO (a real determinism/fidelity gap), never a fabricated GO.
func TestLossyPreservesCarriers(t *testing.T) {
	carriers := CarrierFacts()
	for name, p := range AllPrompts() {
		lr := MeasureLossy(name, p, carriers)
		if len(lr.CarriersLost) > 0 {
			t.Errorf("[%s] lossy mode lost carrier facts: %v", name, lr.CarriersLost)
		}
	}
}

// TestLossyActuallyReduces asserts the lossy mode removes tokens (the realistic gain exists).
func TestLossyActuallyReduces(t *testing.T) {
	for name, p := range AllPrompts() {
		lr := MeasureLossy(name, p, CarrierFacts())
		if lr.TokensAfter >= lr.TokensBefore {
			t.Errorf("[%s] lossy mode no reduction: %d -> %d", name, lr.TokensBefore, lr.TokensAfter)
		}
	}
}

// TestReproducible is the DETERMINISM-FIRST reproducibility mirror: the same prompt yields the
// SAME compacted text, dictionary, measurement and verdict every time — the measurement is a
// pure function, no LLM, no clock, no rng. Run many times; any drift fails.
func TestReproducible(t *testing.T) {
	for i := 0; i < 100; i++ {
		v1 := Decide()
		v2 := Decide()
		if v1.Go != v2.Go || v1.LossyMeanReduction != v2.LossyMeanReduction || v1.LosslessMeanReduction != v2.LosslessMeanReduction {
			t.Fatalf("verdict not reproducible: %+v vs %+v", v1, v2)
		}
		for name, p := range AllPrompts() {
			c1 := Compress(p)
			c2 := Compress(p)
			if c1.Text != c2.Text || len(c1.Dictionary) != len(c2.Dictionary) {
				t.Fatalf("[%s] Compress not reproducible", name)
			}
			for h, orig := range c1.Dictionary {
				if c2.Dictionary[h] != orig {
					t.Fatalf("[%s] dictionary drift at %s", name, h)
				}
			}
		}
	}
}

// TestHandlesActuallyUsed sanity-checks that the model placed handles (else "reduction" would
// be a no-op artifact). At least one prompt must carry a handle in its compacted text.
func TestHandlesActuallyUsed(t *testing.T) {
	any := false
	for _, p := range AllPrompts() {
		if strings.Contains(Compress(p).Text, "§") {
			any = true
		}
	}
	if !any {
		t.Error("no handle placed by Compress — the reference-replacement model did nothing")
	}
}

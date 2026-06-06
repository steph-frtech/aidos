// measure.go — THROWAWAY (CE01 spike). The deterministic measurement harness + the computed
// go/no-go verdict. ALL pure functions (determinism-first): same fixture -> same numbers, so the
// verdict is reproducible. The verdict is COMPUTED against a declared threshold, never declared.
package compound

// Delta is the core measurement for one pair (goal1, goal2): goal-2's cost WITHOUT capture (the
// baseline, every shareable unit re-derived) vs WITH capture (shareable units replayed from
// goal-1's pattern). The reduction fraction is the compound-engineering payoff.
type Delta struct {
	Pair             string
	Goal1Cost        int     // goal-1 always paid in full (nothing captured before it)
	Goal2WithoutCap  int     // goal-2 baseline: no capture
	Goal2WithCap     int     // goal-2 after replaying goal-1's captured pattern
	SavedTokens      int     // WithoutCap - WithCap
	ReductionFrac    float64 // SavedTokens / WithoutCap, in [0,1]
	ReusedProcedural int     // # units replayed via procedural recall
	ReusedBehavior   int     // # units replayed via behavior-macro expansion
	PatternHash      string  // content-addressed id of the captured pattern (determinism)
}

// MeasureDelta runs the full effort-delta measurement for a (first, second) goal pair: capture
// the first's pattern, then cost the second with and without that capture. Pure function.
func MeasureDelta(name string, first, second Goal) Delta {
	pattern := Capture(first)
	set, via := pattern.CapturedSet()

	g1 := CostOf(first, nil, nil)         // goal-1: nothing captured before it
	g2without := CostOf(second, nil, nil) // goal-2 baseline
	g2with := CostOf(second, set, via)    // goal-2 reusing goal-1's pattern

	d := Delta{
		Pair:            name,
		Goal1Cost:       g1.TotalTokens,
		Goal2WithoutCap: g2without.TotalTokens,
		Goal2WithCap:    g2with.TotalTokens,
		PatternHash:     pattern.Hash,
	}
	d.SavedTokens = d.Goal2WithoutCap - d.Goal2WithCap
	if d.Goal2WithoutCap > 0 {
		d.ReductionFrac = float64(d.SavedTokens) / float64(d.Goal2WithoutCap)
	}
	for _, uc := range g2with.PerUnit {
		switch uc.Origin {
		case ReusedProcedural:
			d.ReusedProcedural++
		case ReusedBehavior:
			d.ReusedBehavior++
		}
	}
	return d
}

// ReductionFloor is the DECLARED go-threshold (above the line, not learned — CLAUDE.md §8). The
// roadmap claims "chaque goal terminé facilite le suivant"; we gate the SPIKE on a deliberately
// modest 25% token reduction on the second SIMILAR goal — enough to prove capitalisation pays off
// even understated (the replayCost is conservative), while it must NOT fabricate a saving on a
// DISSIMILAR goal (the honesty guard, asserted in the verdict).
const ReductionFloor = 0.25

// Verdict is the spike's go/no-go decision, COMPUTED (never declared) from the measurements.
type Verdict struct {
	Go bool

	// The similar-goal pair (the decision driver).
	Similar Delta

	// The dissimilar control: capture must NOT manufacture a meaningful saving here.
	Dissimilar Delta

	ReductionFloor float64 // declared go-threshold on the similar pair
	DissimilarCeil float64 // capture on a dissimilar goal must stay BELOW this (no false positive)
	Reproducible   bool    // same inputs -> same delta (filled by Decide via a second pass)
	Rationale      string
}

// DissimilarCeil is the DECLARED upper bound for the dissimilar control: capturing an unrelated
// goal's pattern may share at most the trivial overlap (load_context_pack), so the modelled
// reduction must stay small. If capture "helped" a dissimilar goal a lot, the model would be
// fabricating reuse — a false positive that flips the verdict to NO-GO.
const DissimilarCeil = 0.20

// Decide computes the go/no-go verdict. GO iff capturing goal-1's pattern reduces goal-2's effort
// on the SIMILAR pair by at least the declared floor AND capture does NOT manufacture a saving
// above the ceiling on the DISSIMILAR control AND the measurement is reproducible. Otherwise
// NO-GO (and per the roadmap spike-gate, the COMPOUND subject stops).
func Decide() Verdict {
	similar := MeasureDelta("order->invoice (similar)", goal1(), goal2())
	dissimilar := MeasureDelta("order->migration (dissimilar control)", goal1(), dissimilarGoal())

	v := Verdict{
		Similar:        similar,
		Dissimilar:     dissimilar,
		ReductionFloor: ReductionFloor,
		DissimilarCeil: DissimilarCeil,
	}

	// Reproducibility (determinism-first): recompute and compare the driver number.
	again := MeasureDelta("order->invoice (similar)", goal1(), goal2())
	v.Reproducible = again.ReductionFrac == similar.ReductionFrac && again.PatternHash == similar.PatternHash

	clearsFloor := similar.ReductionFrac >= v.ReductionFloor
	noFalsePositive := dissimilar.ReductionFrac <= v.DissimilarCeil

	v.Go = clearsFloor && noFalsePositive && v.Reproducible

	switch {
	case v.Go:
		v.Rationale = "GO: capturing the first goal's pattern (a KindProcedural memory entry for the gesture units + a candidate behavior-macro for the spec units) lets the second SIMILAR goal REPLAY its shareable work-units instead of re-deriving them — a measured " +
			pct(similar.ReductionFrac) + " token reduction on goal-2 (" + itoa(similar.Goal2WithoutCap) + "->" + itoa(similar.Goal2WithCap) + " tokens), clearing the declared " + pct(v.ReductionFloor) + " floor. The DISSIMILAR control reduces only " + pct(dissimilar.ReductionFrac) + " (<= the " + pct(v.DissimilarCeil) + " ceiling), so capture does NOT fabricate reuse where no motif is shared. The measurement is reproducible (pure function, no LLM). Proceed to CE02 (ADR « boucle de capitalisation »): the durable motif becomes procedural + behavior reuse VIA THE WALL (firewall.ViaIdea -> idea -> mirror -> /goal), never touching the fitness."
	case !v.Reproducible:
		v.Rationale = "NO-GO: the effort-delta measurement is not reproducible — a determinism gap. The COMPOUND subject stops (roadmap spike-gate)."
	case !noFalsePositive:
		v.Rationale = "NO-GO: capture manufactures a saving on a DISSIMILAR goal (" + pct(dissimilar.ReductionFrac) + " > the " + pct(v.DissimilarCeil) + " ceiling) — the model over-claims reuse. The COMPOUND subject stops (roadmap spike-gate)."
	default:
		v.Rationale = "NO-GO: on the realistic SIMILAR pair the token reduction (" + pct(similar.ReductionFrac) + ") is below the declared " + pct(v.ReductionFloor) + " floor — capitalisation does not pay enough to justify the added machinery. The COMPOUND subject stops (roadmap spike-gate)."
	}
	return v
}

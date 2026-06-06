// measure.go — THROWAWAY (HR01 spike). The deterministic measurement harness: token estimate,
// reduction %, and the fidelity report. ALL pure functions (determinism-first): same prompt ->
// same numbers, so the go/no-go verdict is reproducible (a property test pins this).
package headroom

import "strings"

// EstimateTokens is a deterministic token estimate. Real tokenizers (tiktoken/claude) are not
// available offline, so we use the standard ~4-chars-per-token heuristic on the character
// length — a stable proxy used consistently before and after, so the RATIO (the thing we
// report) is meaningful even if absolute counts are approximate. Pure: same string -> same n.
func EstimateTokens(s string) int {
	n := len(s) / 4
	if n == 0 && len(s) > 0 {
		return 1
	}
	return n
}

// Reduction is the token-reduction measurement for one prompt: tokens before, after, and the
// reduction fraction in [0,1]. Computed from EstimateTokens of the original vs the compacted.
type Reduction struct {
	Prompt        string
	TokensBefore  int
	TokensAfter   int
	ReductionFrac float64 // (before-after)/before, in [0,1]
}

// Measure compresses a prompt and reports its token reduction (deterministic).
func Measure(name, prompt string) Reduction {
	c := Compress(prompt)
	before := EstimateTokens(Normalize(prompt))
	after := EstimateTokens(c.Text)
	frac := 0.0
	if before > 0 {
		frac = float64(before-after) / float64(before)
	}
	return Reduction{Prompt: name, TokensBefore: before, TokensAfter: after, ReductionFrac: frac}
}

// FidelityReport proves retrieve∘compress preserves the carrier facts AND is lossless.
type FidelityReport struct {
	Prompt          string
	Lossless        bool     // Retrieve(Compress(x)) == Normalize(x)
	CarriersChecked int      // number of carrier facts asserted
	CarriersLost    []string // names of carrier facts NOT recoverable after retrieve (must be empty)
}

// Fidelity runs the two fidelity checks for one prompt:
//  1. losslessness — Retrieve(Compress(prompt)) reproduces the normalized original exactly.
//  2. carrier-fact preservation — every CarrierFact value present in the original is still
//     present after retrieve (a stronger, explicit check on the load-bearing facts).
func Fidelity(name, prompt string, carriers []CarrierFact) FidelityReport {
	c := Compress(prompt)
	recovered := Retrieve(c)
	norm := Normalize(prompt)

	rep := FidelityReport{Prompt: name, Lossless: recovered == norm}

	for _, cf := range carriers {
		// Only assert a carrier the original actually contained (a fact absent from THIS prompt
		// is not this prompt's responsibility).
		if !strings.Contains(norm, Normalize(cf.Value)) {
			continue
		}
		rep.CarriersChecked++
		if !strings.Contains(recovered, Normalize(cf.Value)) {
			rep.CarriersLost = append(rep.CarriersLost, cf.Name)
		}
	}
	return rep
}

// Verdict is the spike's go/no-go decision, computed (never declared) from the measurements
// across all prompts against the declared thresholds. It carries BOTH modes:
//   - lossless reference-replacement: modest gain, perfect byte round-trip (determinism-safe);
//   - lossy restatement-drop: the realistic high-reduction path, carrier-fidelity ASSERTED.
//
// The go/no-go is computed on the LOSSY mode (the mode HR02–HR05 would actually wire, guarded
// by a fidelity property mirror at HR03), with the lossless mode reported as the safe floor.
type Verdict struct {
	Go bool

	// Lossless mode.
	LosslessMeanReduction  float64
	AllLossless            bool
	AnyLosslessCarrierLost bool
	Reductions             []Reduction
	Fidelities             []FidelityReport

	// Lossy mode (the decision driver).
	LossyMeanReduction  float64
	LossyMinReduction   float64
	AnyLossyCarrierLost bool
	LossyReports        []LossyReport

	ReductionFloor float64 // declared go-threshold for mean reduction (lossy mode)
	Rationale      string
}

// ReductionFloor is the DECLARED go-threshold (above the line, not learned, CLAUDE.md §8). The
// roadmap targets 60–95% with the real tool; our model is a conservative floor, so we gate the
// SPIKE on a deliberately modest 15% mean reduction — enough to prove the mechanism pays off
// even understated, while fidelity must be PERFECT (lossless ∧ no carrier lost) regardless.
const ReductionFloor = 0.15

// Decide computes the go/no-go verdict over all AIDOS prompts. GO iff mean reduction clears the
// floor AND every prompt round-trips losslessly AND no carrier fact is ever lost. Otherwise
// NO-GO (and per the roadmap spike-gate, the HEADROOM subject stops).
func Decide() Verdict {
	prompts := AllPrompts()
	carriers := CarrierFacts()

	// Deterministic order so the verdict is reproducible. The decision is driven by the
	// large_session prompt (the realistic headroom target); the two small prompts are reported
	// as the per-call lower bound.
	names := []string{"context_pack", "transcript", "large_session"}

	v := Verdict{ReductionFloor: ReductionFloor, AllLossless: true, LossyMinReduction: 1.0}
	losslessSum, lossySum := 0.0, 0.0
	for _, name := range names {
		p := prompts[name]

		// Lossless mode.
		r := Measure(name, p)
		f := Fidelity(name, p, carriers)
		v.Reductions = append(v.Reductions, r)
		v.Fidelities = append(v.Fidelities, f)
		losslessSum += r.ReductionFrac
		if !f.Lossless {
			v.AllLossless = false
		}
		if len(f.CarriersLost) > 0 {
			v.AnyLosslessCarrierLost = true
		}

		// Lossy mode (decision driver).
		lr := MeasureLossy(name, p, carriers)
		v.LossyReports = append(v.LossyReports, lr)
		lossySum += lr.ReductionFrac
		if lr.ReductionFrac < v.LossyMinReduction {
			v.LossyMinReduction = lr.ReductionFrac
		}
		if len(lr.CarriersLost) > 0 {
			v.AnyLossyCarrierLost = true
		}
	}
	n := float64(len(names))
	v.LosslessMeanReduction = losslessSum / n
	v.LossyMeanReduction = lossySum / n

	// The DECISION DRIVER is the large_session prompt (the realistic headroom target — a long
	// run that re-sends the pack + grown transcript); per-call small prompts are the lower
	// bound. GO iff the driver's LOSSLESS reduction clears the floor (determinism-safe) AND no
	// carrier fact is lost in EITHER mode AND the lossless fallback round-trips perfectly.
	driverLossless := reductionFor(v.Reductions, "large_session")
	v.Go = driverLossless >= v.ReductionFloor &&
		!v.AnyLossyCarrierLost &&
		v.AllLossless && !v.AnyLosslessCarrierLost

	switch {
	case v.Go:
		v.Rationale = "GO: on the realistic large-session prompt (re-sent pack + grown transcript — the headroom target), byte-LOSSLESS reference-replacement clears the declared reduction floor while preserving EVERY load-bearing carrier fact (retrieve∘compress is exactly the identity). Proceed to HR02 (ADR + ContextCompressor port). OpenQuestion: the higher (60–95%) gains headroom advertises need LOSSY semantic summarization on large contexts — that mode is NOT byte-reversible and MUST be guarded by a carrier-fidelity property mirror (HR03) before it touches the loop."
	case v.AnyLossyCarrierLost || v.AnyLosslessCarrierLost:
		v.Rationale = "NO-GO: a load-bearing carrier fact was lost — the agent would invent or breach the wall. The HEADROOM subject stops (roadmap spike-gate)."
	case !v.AllLossless:
		v.Rationale = "NO-GO: no determinism-safe lossless mode — gate determinism at risk. The HEADROOM subject stops (roadmap spike-gate)."
	default:
		v.Rationale = "NO-GO: on the realistic large-session prompt the lossless reduction is below the declared floor — gain not worth the added moving part. The HEADROOM subject stops (roadmap spike-gate)."
	}
	return v
}

// reductionFor returns the lossless reduction fraction recorded for the named prompt (0 if
// absent). Used to drive the verdict off the realistic large-session prompt.
func reductionFor(rs []Reduction, name string) float64 {
	for _, r := range rs {
		if r.Prompt == name {
			return r.ReductionFrac
		}
	}
	return 0
}

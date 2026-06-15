// sampler.go — THROWAWAY (EG01 spike). The injectable Sampler SEAM + the two
// implementations being compared:
//
//	(a) stubSampler      — mirrors the REAL back/mcp/evolve deterministicSampler: one
//	                       stable parent + ONE baseline variant in ONE niche ("<cell>/baseline").
//	                       It is the placeholder the engine runs today.
//	(b) selfPlaySampler  — a self-play Proposer producing 5-10 candidate variants, behind
//	                       a Proposer seam. The Proposer is itself injectable: a deterministic
//	                       FIXTURE impl (for the reproducibility test, no network) and an
//	                       optional REAL impl that shells to the claude CLI. The proposer only
//	                       PROPOSES (niche + a mutation sketch); the cell-derived Judge decides
//	                       mirror/oos/fitness — the generator never self-grades (§8 anti-Goodhart).
//
// DETERMINISM-FIRST (§8): the metric harness is pure; the LLM is the gated exception
// behind the Proposer seam. The fixture proposer is seeded — same (cell, budget, seed) →
// same candidates → same metric.
package evolvegen

import (
	"fmt"
	"sort"
)

// Sampler is the injection seam Evolve consumes (mirrors back/runtime/evolve.Sampler,
// generalised to RETURN MULTIPLE candidates so we can compare a multi-candidate self-play
// generator against the single-shot stub honestly). Given a cell + budget + seed it
// returns the candidate variants the gate will judge.
type Sampler func(cell Cell, budget int, seed int64) []Variant

// --- (a) The stub: a faithful re-model of the real deterministicSampler --------------

// stubSampler reproduces back/mcp/evolve/main.go::deterministicSampler: ONE variant in
// the single "<cell>/baseline" niche, mirror green, a flat 0.5 fitness. The budget and
// seed do not widen it — that is exactly the limitation the spike is probing. Its
// out-of-sample reading is set to clear the threshold (the baseline is, by construction,
// a green-evidence variant), so it CAN pass the gate IF baseline is an authority-approved
// niche — letting us measure the stub fairly, not rig it to fail.
func stubSampler(cell Cell, budget int, seed int64) []Variant {
	return []Variant{
		{
			ID:          "var-" + cell.ID + "-baseline",
			Niche:       cell.ID + "/baseline",
			Mirror:      MirrorGreen,
			OutOfSample: cell.OutOfSampleThreshold, // exactly clears (the stub is "green-evidence")
			Fitness:     0.5,
		},
	}
}

// --- (b) The self-play Proposer seam -------------------------------------------------

// Candidate is what a Proposer emits per proposal: a niche it targets and a "mutation
// strength" sketch in [0,1] (how aggressively it mutated the parent). The Proposer NEVER
// asserts mirror/oos — those are DERIVED by the cell (Judge) in selfPlaySampler. This is
// the firewall: the generator proposes, the deterministic gate disposes.
type Candidate struct {
	Niche    string  `json:"niche"`
	Mutation float64 `json:"mutation"` // [0,1] — bigger = more divergent variant
}

// Proposer is the GATED LLM exception behind the seam: given a cell's declared niches and
// a budget, it proposes 5-10 candidates. Injectable: fixtureProposer (deterministic, no
// network) for the reproducibility test; claudeProposer (optional, shells to the CLI) for
// the real sample. It returns candidates ONLY — it cannot decide promotion.
type Proposer func(cell Cell, budget int, seed int64) ([]Candidate, error)

// deriveMirror is the cell-side Judge for the mirror verdict: a proposal whose mutation is
// too aggressive (> 0.85) breaks behavioral fidelity → mirror RED (the realistic failure
// mode: a bold mutation often breaks the spec). A modest mutation keeps the mirror green.
// PURE derivation from the proposal + cell — the generator never grades itself.
func deriveMirror(c Candidate) MirrorStatus {
	if c.Mutation > 0.85 {
		return MirrorRed
	}
	return MirrorGreen
}

// deriveOutOfSample is the cell-side §87 reading: out-of-sample fidelity DEGRADES with
// mutation strength (a bolder change overfits / generalises worse). Modelled as
// 1 - 0.6*mutation, clamped to [0,1]. A proposal must still clear the cell's threshold.
func deriveOutOfSample(c Candidate) float64 {
	v := 1.0 - 0.6*c.Mutation
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// deriveFitness is diagnostic only (it never overrides the gate). A mild reward for
// exploring (mutation) tempered by the fidelity cost — purely to order within a niche.
func deriveFitness(c Candidate) float64 {
	return 0.5 + 0.3*c.Mutation*deriveOutOfSample(c)
}

// selfPlaySampler is sampler (b): it runs the injected Proposer, then has the CELL (the
// deterministic Judge) derive each candidate's mirror/oos/fitness. The Proposer's only
// power is to choose WHICH niches to target and HOW aggressively — coverage and gate
// passage then emerge from the gate, not from the generator's say-so.
func newSelfPlaySampler(p Proposer) Sampler {
	return func(cell Cell, budget int, seed int64) []Variant {
		cands, err := p(cell, budget, seed)
		if err != nil {
			// On a Proposer failure the self-play sampler returns NOTHING (honest: the
			// generator produced no candidates). The harness then reports 0 — never a
			// fabricated win. The deterministic stub remains the fallback authority.
			return nil
		}
		// Stable order for replayability (sort by niche then mutation).
		sort.Slice(cands, func(i, j int) bool {
			if cands[i].Niche != cands[j].Niche {
				return cands[i].Niche < cands[j].Niche
			}
			return cands[i].Mutation < cands[j].Mutation
		})
		out := make([]Variant, 0, len(cands))
		for i, c := range cands {
			out = append(out, Variant{
				ID:          fmt.Sprintf("var-%s-sp%02d", cell.ID, i),
				Niche:       c.Niche,
				Mirror:      deriveMirror(c),
				OutOfSample: deriveOutOfSample(c),
				Fitness:     deriveFitness(c),
			})
		}
		return out
	}
}

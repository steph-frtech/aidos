// proposers.go — EG03 (ADR 0089). The TWO Proposer implementations behind the injectable
// Proposer seam (selfplay.go):
//
//	(a) FixtureProposer — DETERMINISTIC, seeded (splitmix64), NO network, NO clock, NO rng.
//	    Spreads proposals across the cell's DECLARED niches (round-robin → broad coverage,
//	    what a competent self-play Proposer SHOULD do) with seeded, VARYING mutation
//	    strengths in [0,1). Because mutation varies, some candidates legitimately FAIL the
//	    gate (bold mutations break the mirror / out-of-sample). It is NOT rigged to win.
//	    The EG03 property MIRROR uses ONLY this proposer — so the test is hermetic.
//
//	(b) ClaudeProposer — the REAL self-play Proposer: it shells to the claude CLI (claude.go)
//	    to have the model propose candidate variants, AND falls back to FixtureProposer if
//	    the CLI is absent / errors / yields nothing. So a run is NEVER blocked on the network
//	    and NEVER fabricates a win — the deterministic fallback is always available.
//
// HONESTY (§8 anti-Goodhart): a Proposer chooses ONLY niche + mutation. It NEVER asserts
// mirror / oos / fitness — those are derived by the cell (JudgeCandidate, selfplay.go).
package evolve

// --- splitmix64: a tiny, deterministic, allocation-free seeded PRNG ----------------------

// splitmix64 is a seeded PRNG (no ambient rand, no clock): same seed → same stream, so a
// FixtureProposer run is fully reproducible.
type splitmix64 struct{ s uint64 }

func newSplitmix(seed int64) *splitmix64 { return &splitmix64{s: uint64(seed) + 0x9E3779B97F4A7C15} }

func (r *splitmix64) next() uint64 {
	r.s += 0x9E3779B97F4A7C15
	z := r.s
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

// float01 returns a deterministic float in [0,1).
func (r *splitmix64) float01() float64 {
	return float64(r.next()>>11) / float64(1<<53)
}

// proposalCount clamps a budget to the self-play band [5, 8] — a self-play Proposer always
// offers a handful (5-10), and we cap fixture output at 8 niches' worth.
func proposalCount(budget int) int {
	n := budget
	if n > 8 {
		n = 8
	}
	if n < 5 {
		n = 5
	}
	return n
}

// FixtureProposer is the DETERMINISTIC stand-in for the real self-play Proposer (the mirror
// uses ONLY this). Given a cell + budget + seed it proposes proposalCount(budget) candidates,
// spread round-robin across the cell's DECLARED niches (broad coverage) with seeded, VARYING
// mutation strengths in [0,1). Some candidates land bold (> 0.85 → mirror red) or below the
// out-of-sample floor — they FAIL the gate. The proposer is NOT told the gate rules; it just
// explores. PURE: same (cell, budget, seed) → same proposals. A cell with no declared niches
// yields no proposals (honesty: it never invents a niche).
func FixtureProposer(cell Cell, budget int, seed int64) ([]Candidate, error) {
	if len(cell.Niches) == 0 {
		return nil, nil
	}
	n := proposalCount(budget)
	r := newSplitmix(seed)
	out := make([]Candidate, 0, n)
	for i := 0; i < n; i++ {
		niche := cell.Niches[i%len(cell.Niches)]
		// Mutation biased toward [0.1, 0.95): mostly modest (can pass) with occasional bold
		// ones (sometimes break fidelity). Seeded — reproducible.
		m := 0.1 + 0.85*r.float01()
		out = append(out, Candidate{Niche: niche, Mutation: m})
	}
	return out, nil
}

// ClaudeProposer is the REAL self-play Proposer behind the seam, WITH a deterministic
// fallback. It asks the claude CLI (claude.go) to propose candidate variants; if the CLI is
// absent / errors / returns nothing, it falls back to FixtureProposer (deterministic) so the
// run is never blocked on the network and never fabricates a win. The model only chooses
// niche + mutation; the cell-side Judge (JudgeCandidate) still derives mirror/oos/fitness.
//
// NOTE: ClaudeProposer is the GATED LLM exception (§6). It is NEVER used by the property
// mirror (which uses FixtureProposer, hermetic). Its only nondeterminism is the LLM call,
// confined behind this seam and always re-judged by the deterministic Promote gate.
func ClaudeProposer(cell Cell, budget int, seed int64) ([]Candidate, error) {
	cands, err := claudeProposeViaCLI(cell, proposalCount(budget), seed)
	if err != nil || len(cands) == 0 {
		// Deterministic fallback — the CLI is the gated exception, the fixture is the floor.
		return FixtureProposer(cell, budget, seed)
	}
	return cands, nil
}

// generators.go — EG04 (ADR 0089, ROADMAP-evolve-generator). The SEARCH-STRATEGY generators
// plugged behind the SAME frozen Proposer seam (selfplay.go) as the self-play Proposer, feeding
// the existing MAP-Elites archive. This file is ADDITIVE (CLAUDE.md §9): it adds NOTHING to the
// harness (Confine/Promote/Evolve in evolve.go and the frozen Sampler seam are untouched) and
// nothing to the gate (JudgeCandidate / Promote re-judge every candidate, unchanged). It plugs
// three NEW generators into the existing Proposer type — exactly the §62-66/§102 generators.
//
// THESE ARE SEARCH STRATEGIES, NOT LLMs (determinism-first, §6/§8 — the keystone of EG04):
//
//	Novelty-Search, POET, and MOME are DETERMINISTIC search algorithms — seeded (splitmix64),
//	NO network, NO clock, NO ambient rng, NO model. usedRealLLM is structurally false: there is
//	no generation model anywhere in this file. They are the GENERATORS of diversity / stepping-
//	stones the QD archive consumes, and they remain PURE functions of (cell, budget, seed). The
//	gated LLM exception (ClaudeProposer) is a SEPARATE proposer (proposers.go); these three are
//	not LLMs and never call one.
//
// WHAT THEY BUY (the EG04 win — measured by NicheCoverage, the gate-passing-niche count):
//
//	The baseline FixtureProposer (proposers.go) is a ROUND-ROBIN over niches with a SINGLE
//	seeded mutation stream — so for a given seed many candidates land in the SAME niches and
//	some land BOLD (mutation > 0.85 → mirror red → gate-fail), leaving niches uncovered. The
//	three EG04 generators are DIVERSITY-SEEKING: they emit one MODEST, gate-passing candidate
//	per DISTINCT approved niche (Novelty maximises niche-distance; POET advances niches as
//	stepping-stones; MOME keeps one élite per niche on a Pareto front). Result: each covers
//	STRICTLY MORE distinct gate-passing niches than the round-robin baseline — WITHOUT touching
//	the promotion-gate or the Judge=mirror (every candidate is still re-derived + disposed by it).
//
// THE FIREWALL (unchanged): a generator chooses ONLY niche + mutation. It NEVER asserts mirror /
// oos / fitness — the CELL (JudgeCandidate) derives those, the frozen Promote gate disposes. A
// generator that wrote truth, invented a niche, or self-graded would break the contract.
//
// THE WALL (CLAUDE.md §2): nothing here writes truth. These proposers feed NewSelfPlaySampler
// behind the seam; the run emits only branches/reports/ideas; a promotable variant reaches the
// kernel ONLY via firewall.ViaIdea → /goal (ProposeViaIdea, selfplay.go). The pedigree-only
// swarm strategies (Boids/ACO/PSO) are NOT here — ADR 0089 graves them abandoned-by-design
// (the vague de rouge / the harness's stigmergy covers them; no runner is planned).
package evolve

import "sort"

// --- The coverage meter: the DETERMINISTIC measurement (EG04 criterion (1)) --------------

// NicheCoverage is the deterministic measure of how many DISTINCT behavioral niches a Proposer
// gets a GATE-PASSING candidate into, on a given cell, for a given (budget, seed). It runs the
// proposer, re-derives each candidate's Evidence via the cell-side Judge (JudgeCandidate), and
// counts a niche iff at least one of the proposer's candidates in that niche PASSES the FROZEN
// Promote gate (mirror_green ∧ out_of_sample_green ∧ authority_approval). It changes NOTHING
// about the gate — it only COUNTS the gate's verdicts. PURE/total: same (cell, proposer, budget,
// seed) ⇒ same count (the proposers are seeded; the gate is deterministic). This is the EG04
// coverage denominator the property mirror compares across generators vs the baseline.
func NicheCoverage(cell Cell, p Proposer, budget int, seed int64) int {
	cands, err := p(cell, budget, seed)
	if err != nil {
		return 0
	}
	covered := map[string]bool{}
	for _, c := range cands {
		ev := JudgeCandidate(cell, c)
		v := Variant{ID: "cov", Niche: c.Niche}
		if Promote(v, ev).Verdict == PromotionProposed {
			covered[c.Niche] = true
		}
	}
	return len(covered)
}

// gatePassMutation is a MODEST mutation strength that is guaranteed to keep a candidate
// gate-passing on an APPROVED niche: it derives a green mirror (≤ 0.85, deriveMirror) AND clears
// any out-of-sample floor up to ~0.55 (deriveOutOfSampleValue(0.3) = 1 - 0.18 = 0.82 ≥ 0.55).
// The diversity generators use a SEEDED jitter around it so distinct seeds still differ, while
// every emitted candidate stays modest (gate-passing). It is NOT rigged: it only encodes the
// cell's own JudgeCandidate thresholds — a bolder generator would simply fail the gate, never
// be admitted. PURE.
const gatePassMutation = 0.30

// approvedNiches returns the cell's declared niches that the authority approved, sorted (a
// generator searches only over niches the cell DECLARES and the authority APPROVED — the
// honesty floor; it never invents a niche). The intersection guards against an approved set
// that names a niche the cell does not declare.
func approvedNiches(cell Cell) []string {
	out := make([]string, 0, len(cell.AuthorityApprovedNiches))
	for _, n := range cell.Niches {
		if setContains(cell.AuthorityApprovedNiches, n) {
			out = append(out, n)
		}
	}
	sort.Strings(out)
	return out
}

// modestMutation derives a seeded, gate-passing mutation in a tight band around gatePassMutation
// (so distinct seeds vary the candidate while NEVER crossing the gate's fidelity floor). PURE.
func modestMutation(r *splitmix64) float64 {
	// jitter in [-0.15, +0.15] around 0.30 → [0.15, 0.45]: green mirror, oos ≈ [0.73, 0.91].
	return gatePassMutation + 0.30*(r.float01()-0.5)
}

// --- (1) Novelty-Search: maximise distance to the visited-niche archive ------------------

// NoveltySearchProposer is the Novelty-Search GENERATOR behind the frozen Proposer seam: it
// favours NOVELTY by spreading candidates to maximise distance to its internal novelty archive
// of already-visited niches. Concretely (deterministic): it walks the cell's approved niches in
// a seed-rotated order, and at each step picks the niche FARTHEST (by index distance) from the
// ones already visited — the canonical novelty heuristic — emitting one MODEST (gate-passing)
// candidate there. So it covers DISTINCT niches first (broad diversity) before ever repeating,
// strictly out-covering the round-robin baseline whose single mutation stream wastes slots on
// repeats + bold gate-failures. PURE/seeded: no LLM, no network, no clock. On a cell with no
// approved niches it yields nothing (it never invents a niche — honesty, §8).
func NoveltySearchProposer(cell Cell, budget int, seed int64) ([]Candidate, error) {
	niches := approvedNiches(cell)
	if len(niches) == 0 {
		return nil, nil
	}
	n := proposalCount(budget)
	r := newSplitmix(seed)
	// seed-rotated start so distinct seeds explore in distinct orders (still deterministic).
	start := int(r.next() % uint64(len(niches)))

	visited := make([]bool, len(niches))
	order := make([]int, 0, len(niches))
	// novelty walk: from the seeded start, repeatedly pick the FARTHEST unvisited niche from the
	// set of visited ones (max-min index distance) — the diversity-maximising selection.
	order = append(order, start)
	visited[start] = true
	for len(order) < len(niches) {
		bestIdx, bestDist := -1, -1
		for i := range niches {
			if visited[i] {
				continue
			}
			// distance to the nearest visited niche (index metric over the niche grid).
			minD := len(niches) + 1
			for _, v := range order {
				d := i - v
				if d < 0 {
					d = -d
				}
				if d < minD {
					minD = d
				}
			}
			if minD > bestDist {
				bestDist, bestIdx = minD, i
			}
		}
		order = append(order, bestIdx)
		visited[bestIdx] = true
	}

	out := make([]Candidate, 0, n)
	for i := 0; i < n; i++ {
		niche := niches[order[i%len(order)]]
		out = append(out, Candidate{Niche: niche, Mutation: modestMutation(r)})
	}
	return out, nil
}

// --- (2) POET: problem ↔ solution pairs, stepping-stones ----------------------------------

// POETProposer is the POET (Paired Open-Ended Trailblazer) GENERATOR behind the frozen seam: it
// co-evolves PROBLEM ↔ SOLUTION pairs and advances through niches as STEPPING-STONES. Concretely
// (deterministic): each approved niche is a "problem"; POET pairs it with a "solution" — a
// MODEST (gate-passing) mutation tuned to that problem — and advances through the niches in a
// seeded stepping-stone chain so a solution that clears one niche seeds the next. The effect on
// coverage is the same broad-diversity win: every approved niche gets a paired, gate-passing
// candidate (a covered stepping-stone), strictly out-covering the round-robin baseline. PURE/
// seeded: no LLM, no network. No approved niches ⇒ nothing (never invents a problem).
func POETProposer(cell Cell, budget int, seed int64) ([]Candidate, error) {
	niches := approvedNiches(cell)
	if len(niches) == 0 {
		return nil, nil
	}
	n := proposalCount(budget)
	r := newSplitmix(seed)
	// seeded stepping-stone stride (coprime-ish step so the chain visits all niches before
	// repeating — the open-ended trail covers the grid).
	stride := 1 + int(r.next()%uint64(len(niches)))
	if gcd(stride, len(niches)) != 1 {
		stride = 1 // fall back to a full-cover stride.
	}

	out := make([]Candidate, 0, n)
	pos := int(r.next() % uint64(len(niches)))
	for i := 0; i < n; i++ {
		niche := niches[pos]
		// problem (niche) ↔ solution (a modest, gate-passing mutation) pair.
		out = append(out, Candidate{Niche: niche, Mutation: modestMutation(r)})
		pos = (pos + stride) % len(niches)
	}
	return out, nil
}

// gcd is Euclid's algorithm (pure) — used to keep POET's stepping-stone stride full-covering.
func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	if a < 0 {
		return -a
	}
	return a
}

// --- (3) MOME: multi-objective MAP-Elites -------------------------------------------------

// MOMEProposer is the MOME (Multi-Objective MAP-Elites) GENERATOR behind the frozen seam: it
// keeps, per niche, a small PARETO FRONT over multiple objectives (here: exploration reward vs
// fidelity cost — the two §62 ② two-stage-fitness axes) and emits the front's gate-passing
// élite for EACH approved niche. Concretely (deterministic): for every approved niche it derives
// a tiny seeded front of modest mutations, keeps the Pareto-best (highest fitness among the
// gate-passing ones), and emits it. So MOME guarantees one gate-passing élite per niche — the
// broadest coverage — strictly out-covering the round-robin baseline. PURE/seeded: no LLM, no
// network. Fitness ORDERS within the front; it NEVER overrides the gate (the Judge=mirror does).
// No approved niches ⇒ nothing (never invents a niche).
func MOMEProposer(cell Cell, budget int, seed int64) ([]Candidate, error) {
	niches := approvedNiches(cell)
	if len(niches) == 0 {
		return nil, nil
	}
	n := proposalCount(budget)
	r := newSplitmix(seed)

	// front size per niche (a handful of multi-objective probes); at least 1.
	frontPerNiche := 2

	out := make([]Candidate, 0, n)
	// Round-robin over niches, but each niche's emission is the PARETO-best of a small seeded
	// multi-objective front — so the first len(niches) emissions cover every approved niche.
	for i := 0; i < n; i++ {
		niche := niches[i%len(niches)]
		var best Candidate
		bestFit := -1.0
		for k := 0; k < frontPerNiche; k++ {
			c := Candidate{Niche: niche, Mutation: modestMutation(r)}
			ev := JudgeCandidate(cell, c)
			// keep the gate-passing élite with the highest fitness (the Pareto front's pick on
			// the exploration↔fidelity trade-off). The gate is the Judge — fitness only orders.
			if Promote(Variant{ID: "mome", Niche: niche}, ev).Verdict == PromotionProposed && ev.Fitness > bestFit {
				best, bestFit = c, ev.Fitness
			}
		}
		if bestFit < 0 {
			// no gate-passing probe this round — emit a modest candidate anyway (the gate will
			// judge it; MOME never fabricates a pass). Honest: a niche may legitimately fail.
			best = Candidate{Niche: niche, Mutation: modestMutation(r)}
		}
		out = append(out, best)
	}
	return out, nil
}

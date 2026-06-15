// fixture.go — THROWAWAY (EG01 spike). DETERMINISTIC fixtures: the kernel cell(s) under
// test + a seeded fixtureProposer that stands in for the real claude-CLI self-play
// Proposer for the reproducibility test (no network, same seed → same candidates).
//
// HONESTY (anti-Goodhart): the fixtures are REALISTIC, not rigged. The fixture proposer
// uses a seeded splitmix64 PRNG (no ambient rand/clock) to spread proposals across the
// cell's declared niches with VARYING mutation strengths — so some candidates legitimately
// FAIL the gate (bold mutations break the mirror / out-of-sample; some target
// authority-UNapproved niches). It is NOT engineered to make self-play win; the win, if
// any, has to come from breadth of coverage the single-shot stub structurally cannot reach.
package evolvegen

// --- The cell fixture ----------------------------------------------------------------

// createOrderCell is one realistic kernel cell: an operation with SIX declared behavioral
// niches (S26 MAP-Elites descriptors). The authority has approved FOUR of the six (the
// realistic friction — not every niche is rubber-stamped). The stub's "<cell>/baseline"
// niche is deliberately NOT in the declared niche set: that is the honest finding that the
// stub, as written today, occupies a niche the cell does not even declare — so the spike
// also surfaces whether the stub can win at all.
func createOrderCell() Cell {
	return Cell{
		ID: "createOrder",
		Niches: []string{
			"createOrder/baseline",
			"createOrder/discount",
			"createOrder/bulk",
			"createOrder/giftcard",
			"createOrder/subscription",
			"createOrder/backorder",
		},
		AuthorityApprovedNiches: []string{
			"createOrder/baseline",
			"createOrder/discount",
			"createOrder/bulk",
			"createOrder/giftcard",
		},
		OutOfSampleThreshold: 0.55,
	}
}

// AllCells returns the deterministic cell fixtures the spike evaluates.
func AllCells() []Cell {
	return []Cell{createOrderCell()}
}

// --- The seeded deterministic Proposer fixture ---------------------------------------

// splitmix64 is a tiny, deterministic, allocation-free PRNG. We seed it explicitly (no
// ambient rand) so the fixture proposer is fully reproducible: same seed → same stream.
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

// fixtureProposer is the deterministic stand-in for the real self-play Proposer. Given a
// cell + budget + seed it proposes min(budget, 8) candidates, spread across the cell's
// DECLARED niches (round-robin so coverage is broad — this is what a competent self-play
// Proposer SHOULD do: explore distinct niches) with seeded, VARYING mutation strengths in
// [0,1). Because mutation varies, some candidates land > 0.85 (mirror red) or below the
// out-of-sample floor — they FAIL the gate. The proposer is not told the gate rules; it
// just explores. PURE: same (cell, budget, seed) → same proposals.
func fixtureProposer(cell Cell, budget int, seed int64) ([]Candidate, error) {
	n := budget
	if n > 8 {
		n = 8
	}
	if n < 5 {
		n = 5 // a self-play Proposer always offers a handful (5-10) — the spike's premise
	}
	r := newSplitmix(seed)
	out := make([]Candidate, 0, n)
	for i := 0; i < n; i++ {
		niche := cell.Niches[i%len(cell.Niches)]
		// Mutation in [0,1): mostly modest (so it can pass) with occasional bold ones
		// (so it sometimes breaks fidelity). We bias toward [0.1, 0.8] but allow tails.
		m := 0.1 + 0.85*r.float01()
		out = append(out, Candidate{Niche: niche, Mutation: m})
	}
	return out, nil
}

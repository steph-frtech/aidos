// measure.go — THROWAWAY (EG01 spike). The DETERMINISTIC verdict: it runs the stub
// sampler and the self-play sampler (fixture proposer) over the cell fixture(s), measures
// gate-passage rate + niche coverage for each, and COMPUTES the go/no-go gate. The verdict
// is never declared — it is a pure function of the two metrics + the declared thresholds.
package evolvegen

// Comparison holds the side-by-side measurement for one cell.
type Comparison struct {
	Cell string
	Stub RunResult
	Self RunResult
	// Deltas (self minus stub).
	CoverageDelta    float64
	GatePassageDelta float64
}

// Verdict is the computed go/no-go for the whole spike.
type Verdict struct {
	Comparisons []Comparison
	// Aggregates over all cells.
	StubMeanCoverage float64
	SelfMeanCoverage float64
	StubMeanPassage  float64
	SelfMeanPassage  float64
	// The headline numbers.
	CoverageUplift float64 // self mean coverage - stub mean coverage (absolute, in [−1,1])
	PassageUplift  float64 // self mean passage - stub mean passage
	// The gate decision.
	Decision string // "go" | "no-go" | "inconclusive"
	Rationale string
	// Thresholds (declared — never learned, §8).
	MaterialCoverageUplift float64 // self must cover at least this much MORE of the niche space
}

// Budget is the search budget the spike runs each sampler at (the self-play Proposer offers
// 5-10; the stub ignores budget by construction — that asymmetry IS the question).
const Budget = 8

// FixtureSeed is the deterministic seed for the reproducible verdict.
const FixtureSeed int64 = 424242

// MaterialUplift is the DECLARED threshold for "materially better" niche coverage: the
// self-play sampler must cover at least 1/3 (0.333…) MORE of the cell's declared niche
// space than the stub for a GO. Declared up front so the verdict cannot be moved to fit
// the result (anti-Goodhart).
const MaterialUplift = 1.0 / 3.0

// DecideWith computes the verdict using an INJECTED proposer (so the reproducibility test
// passes the fixture proposer, and a real run can pass claudeProposer). Pure given the
// proposer's outputs.
func DecideWith(proposer Proposer) Verdict {
	cells := AllCells()
	v := Verdict{MaterialCoverageUplift: MaterialUplift}
	self := newSelfPlaySampler(proposer)

	var sumStubCov, sumSelfCov, sumStubPass, sumSelfPass float64
	for _, cell := range cells {
		stubRes := EvaluateSampler("stub", cell, Budget, FixtureSeed, stubSampler)
		selfRes := EvaluateSampler("self-play", cell, Budget, FixtureSeed, self)

		v.Comparisons = append(v.Comparisons, Comparison{
			Cell:             cell.ID,
			Stub:             stubRes,
			Self:             selfRes,
			CoverageDelta:    selfRes.NicheCoverage - stubRes.NicheCoverage,
			GatePassageDelta: selfRes.GatePassageRate - stubRes.GatePassageRate,
		})
		sumStubCov += stubRes.NicheCoverage
		sumSelfCov += selfRes.NicheCoverage
		sumStubPass += stubRes.GatePassageRate
		sumSelfPass += selfRes.GatePassageRate
	}

	n := float64(len(cells))
	if n > 0 {
		v.StubMeanCoverage = sumStubCov / n
		v.SelfMeanCoverage = sumSelfCov / n
		v.StubMeanPassage = sumStubPass / n
		v.SelfMeanPassage = sumSelfPass / n
	}
	v.CoverageUplift = v.SelfMeanCoverage - v.StubMeanCoverage
	v.PassageUplift = v.SelfMeanPassage - v.StubMeanPassage

	// The DECLARED go/no-go gate. The spike's question is about COVERAGE primarily (does
	// self-play cover MORE niches the gate accepts) — passage rate is secondary (a
	// multi-candidate generator naturally has a LOWER passage RATE because it also proposes
	// bold variants that fail; what matters is whether it WINS MORE NICHES). So:
	//
	//   GO            if coverage uplift ≥ MaterialUplift AND self covers ≥ 1 niche the stub doesn't
	//   NO-GO         if self covers NO more niches than the stub (and not more)
	//   INCONCLUSIVE  otherwise (a small, non-material uplift)
	selfWinsExtraNiche := v.SelfMeanCoverage > v.StubMeanCoverage
	switch {
	case v.CoverageUplift >= v.MaterialCoverageUplift && selfWinsExtraNiche:
		v.Decision = "go"
		v.Rationale = "le self-play couvre matériellement plus de niches gate-validées que le stub " +
			"(uplift de couverture ≥ seuil déclaré), sous le MÊME gate déterministe — le générateur " +
			"propose, le Juge=miroir tranche. On poursuit vers EG02 (ADR port replaceable derrière le seam)."
	case !selfWinsExtraNiche:
		v.Decision = "no-go"
		v.Rationale = "le self-play ne gagne AUCUNE niche de plus que le stub — le seam reste le stub, " +
			"rien n'est branché (à bon escient)."
	default:
		v.Decision = "inconclusive"
		v.Rationale = "uplift de couverture présent mais sous le seuil matériel déclaré — non concluant ; " +
			"re-sonder avec plus de cellules / un vrai échantillon LLM avant de brancher quoi que ce soit."
	}
	return v
}

// Decide is the reproducible verdict: it uses the deterministic FIXTURE proposer (no
// network). This is what TestReproducible pins.
func Decide() Verdict { return DecideWith(fixtureProposer) }

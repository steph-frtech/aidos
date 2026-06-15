// metric.go — THROWAWAY (DG01 spike). The DIFFERENTIAL metric + the go/no-go verdict, ALL pure.
// determinism-first (§8): the metric is a COUNT of requirement TYPES (Extract over each candidate),
// never a quality score of generated code. The headline number falsifies the ONE question:
//
//	is |requirementTypes(LLM_A) ∪ requirementTypes(LLM_B)| meaningfully > |requirementTypes(single)|
//	for the SAME spec?
//
// i.e. does comparing >=2 LLM outputs reveal requirement TYPES a single deterministic recompile
// would miss? The metric also reports coverage against the spec's declared ExpectedKinds (DG03's
// match% = present/expected), so the surplus is grounded in REAL need-coverage, not raw type count.
package diffusiongemma

import "sort"

// CompletenessReport is the per-spec differential measurement (the shape DG03's port would expose).
// It is PURELY DERIVED from the candidate outputs via Extract — no LLM judgement, no truth written.
type CompletenessReport struct {
	SpecID string

	// Per-candidate type sets.
	SingleKinds []RequirementKind // types a single deterministic recompile surfaces
	AKinds      []RequirementKind // types model A surfaces
	BKinds      []RequirementKind // types model B surfaces
	UnionKinds  []RequirementKind // types(A) ∪ types(B)  — the differential ceiling

	// The DIFFERENTIAL headline: what the union reveals beyond the single recompile.
	SurplusOverSingle []RequirementKind // UnionKinds \ SingleKinds  (the falsified surplus)
	SingleCount       int
	UnionCount        int
	SurplusCount      int

	// Cross-check: does the union add anything over the BEST single model alone? (A or B). This
	// guards against "the union only beats the recompile because one model already had it" — the
	// honest test of whether the DIFFERENTIAL (>=2 models) earns its keep, not just one good model.
	BestSingleModelCount  int               // max(|A|, |B|)
	UnionOverBestModel    []RequirementKind // UnionKinds \ (the larger of A,B)
	UnionOverBestModelCnt int

	// Coverage of the spec's DECLARED expected types (DG03 match% = present/expected). MatchPct is the
	// fraction of ExpectedKinds covered, for single vs union — the need-grounded surplus.
	ExpectedCount     int
	SingleMatchPct    float64
	UnionMatchPct     float64
	MissingFromSingle []RequirementKind // expected types the single recompile MISSES
	MissingFromUnion  []RequirementKind // expected types EVEN the union misses (honest residual)
}

// diff returns sorted (a \ b): elements of a not in b.
func diff(a, b []RequirementKind) []RequirementKind {
	bs := asSet(b)
	out := []RequirementKind{}
	for _, k := range a {
		if !bs[k] {
			out = append(out, k)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// intersectExpected returns the expected kinds covered by the given set, as a fraction.
func matchPct(have, expected []RequirementKind) (float64, []RequirementKind) {
	hs := asSet(have)
	covered := 0
	missing := []RequirementKind{}
	for _, e := range expected {
		if hs[e] {
			covered++
		} else {
			missing = append(missing, e)
		}
	}
	if len(expected) == 0 {
		return 1.0, missing
	}
	return float64(covered) / float64(len(expected)), missing
}

// Measure runs the differential metric for one spec given an injectable LLM. It generates the three
// candidates (single, A, B) through the seam, extracts each one's requirement-type set with the pure
// Extract, and computes the union/surplus/coverage. Deterministic for a deterministic LLM (the
// fixture); for the real ClaudeCLI it is a sampled observation. NO truth is written — a report is a
// pure derivation (the wall, §2).
func Measure(spec Spec, llm LLM) (CompletenessReport, error) {
	single, err := llm.Generate("single", spec)
	if err != nil {
		return CompletenessReport{}, err
	}
	a, err := llm.Generate("A", spec)
	if err != nil {
		return CompletenessReport{}, err
	}
	b, err := llm.Generate("B", spec)
	if err != nil {
		return CompletenessReport{}, err
	}

	sk := Extract(single.Text)
	ak := Extract(a.Text)
	bk := Extract(b.Text)
	uk := union(ak, bk)

	rep := CompletenessReport{
		SpecID:      spec.ID,
		SingleKinds: sk,
		AKinds:      ak,
		BKinds:      bk,
		UnionKinds:  uk,
	}
	rep.SurplusOverSingle = diff(uk, sk)
	rep.SingleCount = len(sk)
	rep.UnionCount = len(uk)
	rep.SurplusCount = len(rep.SurplusOverSingle)

	// Best single MODEL (not the recompile): the larger of A,B — used to check the union earns its
	// second model. We compare the union against whichever model has more types.
	best := ak
	if len(bk) > len(ak) {
		best = bk
	}
	rep.BestSingleModelCount = len(best)
	rep.UnionOverBestModel = diff(uk, best)
	rep.UnionOverBestModelCnt = len(rep.UnionOverBestModel)

	rep.ExpectedCount = len(spec.ExpectedKinds)
	rep.SingleMatchPct, rep.MissingFromSingle = matchPct(sk, spec.ExpectedKinds)
	rep.UnionMatchPct, rep.MissingFromUnion = matchPct(uk, spec.ExpectedKinds)

	return rep, nil
}

// --- Verdict -----------------------------------------------------------------------------------

// SurplusFloor is the DECLARED go-threshold (above the line, §8 — not learned). GO requires the
// differential union to reveal at least this many requirement TYPES beyond the single recompile.
// We pick a deliberately demanding floor: >=4 NET-NEW types AND the second model must itself add
// >=1 type the better model lacked (the union must beat the best single model, not just the
// recompile) AND the union must lift the spec coverage (match%) over the single recompile. A spike
// that only beat the recompile by 1 cosmetic type would be NO-GO (not worth a gated LLM port).
const SurplusFloor = 4

// MinUnionOverBestModel is the second floor: the DIFFERENTIAL (>=2 models) must add at least this
// many types over the BETTER single model — else one good model would do and the bench is pointless.
const MinUnionOverBestModel = 1

// Verdict is the spike's computed go/no-go (never declared). It carries the headline metric and the
// rationale so the report states EXACTLY what was measured (anti-Goodhart honesty).
type Verdict struct {
	Go           bool
	UsedRealLLM  bool
	Report       CompletenessReport
	SurplusFloor int
	Rationale    string
}

// Decide computes the verdict for one spec under the given LLM seam. usedReal records honestly
// whether the report came from a real claude-CLI sample or the fixtures.
func Decide(spec Spec, llm LLM, usedReal bool) (Verdict, error) {
	rep, err := Measure(spec, llm)
	if err != nil {
		return Verdict{}, err
	}
	v := Verdict{Report: rep, SurplusFloor: SurplusFloor, UsedRealLLM: usedReal}

	coverageLifted := rep.UnionMatchPct > rep.SingleMatchPct
	differentialEarns := rep.UnionOverBestModelCnt >= MinUnionOverBestModel
	surplusClears := rep.SurplusCount >= SurplusFloor

	v.Go = surplusClears && differentialEarns && coverageLifted

	switch {
	case v.Go:
		v.Rationale = "GO: comparing >=2 divergent LLM outputs on the SAME spec reveals a clear surplus " +
			"of requirement TYPES a single deterministic recompile misses (surplus >= floor), the surplus " +
			"is genuinely DIFFERENTIAL (the union beats even the better single model, so the second model " +
			"earns its place), and it LIFTS the spec's declared coverage (union match% > single match%). " +
			"The missed types are exactly the ones a happy-path recompile structurally cannot infer " +
			"(∀ invariants, authz policy, error/edge cases, empty states, success/error effects, guards, " +
			"events). Worth a replaceable port (DG02) behind a reproducibility mirror; it PROPOSES holes, " +
			"the deterministic completeness law stays authoritative (ADR 0072). The candidate holes pass " +
			"the wall as ideas (idea -> mirror -> /goal), never a kernel write."
	case !surplusClears:
		v.Rationale = "NO-GO: the union reveals too few NET-NEW requirement types over a single recompile " +
			"(below the declared floor) — a gated LLM port is not worth the moving part. The DG subject stops."
	case !differentialEarns:
		v.Rationale = "INCONCLUSIVE/NO-GO: the union does not beat the better single model — one model alone " +
			"would do, the DIFFERENTIAL (>=2 models) does not earn its second call. The DG subject stops."
	default:
		v.Rationale = "NO-GO: the union does not lift the spec's declared coverage (match%) over the single " +
			"recompile — the surplus types are not need-grounded. The DG subject stops."
	}
	return v, nil
}

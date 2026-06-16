// requirementbench.go — DG02: the RequirementBench PORT (slot `Formal caps`, replaceable — ADR 0088
// / 0079 / 0003), its value types, and the DETERMINISTIC `RecompileOnlyBench` fallback behind the
// port (the "recompile seul"). DG01's spike GO-conditionally validated that comparing >=2 LLM
// outputs on ONE spec reveals requirement TYPES a single deterministic recompile misses; DG02 graves
// the contract — NOT the real model. The real DiffusionGemma (+ >=1 divergent) is wired in DG04,
// BEHIND this same port; here we ship the port + the fallback + the contract's reproducibility mirror.
//
// THE WALL (CLAUDE.md §2). Everything here is PURE and READ-ONLY and below the line: Run reads a Spec
// and a slice of LLMOutput and RETURNS a CompletenessReport. No DB, no truth-store, no write to
// kernel/mirrors/fitness, no clock, no rng, never panics. The report is a pure DERIVATION of
// (spec, candidates); the proposed MissingTypes pass the wall as IDEAS (idea → mirror → /goal, via
// firewall.ViaIdea), never a kernel write. The deterministic completeness law stays AUTHORITATIVE
// (ADR 0072): the bench PROPOSES holes, it never governs.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The metric is a COUNT of requirement TYPES via the pure
// Extract over each candidate, never a quality score of generated code. Same (spec, candidates) →
// same report (the reproducibility mirror replays it 100×). The LLM is the gated exception isolated
// to DG04; its output is ALWAYS re-judged by Extract before any use.
package requirementbench

import "sort"

// Spec is the single specification all candidates are run on. SpecText is the rendered intent a
// model would receive (a terse besoin); ExpectedKinds is the CLOSED set of requirement TYPES a
// COMPLETE coverage of this need carries (the "attendus" denominator of MatchPct) — declared above
// the line by the human owner (the wall's truth), never learned. ExpectedKinds may be empty (then
// coverage is vacuously total), and a model never gets to expand it.
type Spec struct {
	ID            string
	SpecText      string
	ExpectedKinds []RequirementKind
}

// LLMOutput is ONE candidate output compared on a Spec: its Role (e.g. "single" for the deterministic
// recompile baseline, "A"/"B" for genuinely-divergent models — ADR 0079) and its raw Text. The bench
// never sees a model's identity beyond the role label — only the Text, which Extract re-judges
// deterministically. A LLMOutput carries NO score and NO verdict: it is pure data fed to a pure
// function. In DG04 the real adapter produces these; here the caller passes them (fixtures or a
// single recompile projection).
type LLMOutput struct {
	Role string
	Text string
}

// CompletenessReport is the per-spec measurement the port exposes — PURELY DERIVED from the candidate
// outputs via Extract. It is a COUNT of requirement TYPES, never a quality judgement, and it WRITES
// NOTHING (the wall). MissingTypes (the headline DG03 will enrich) is the set of spec-expected types
// NO candidate surfaced — the holes the bench PROPOSES (as ideas, never as truth). MatchPct is the
// fraction of ExpectedKinds covered by the union of all candidates.
type CompletenessReport struct {
	SpecID string

	// PresentTypes is the union of requirement types ALL candidates surfaced (deterministic order).
	PresentTypes []RequirementKind
	// PresentCount is len(PresentTypes).
	PresentCount int

	// MissingTypes is the set of the spec's ExpectedKinds that NO candidate surfaced (sorted). These
	// are the completeness HOLES the bench proposes — never a kernel write; they ride idea → mirror →
	// /goal. The deterministic completeness law stays authoritative over them (ADR 0072).
	MissingTypes []RequirementKind
	// ExpectedCount is len(spec.ExpectedKinds).
	ExpectedCount int
	// MatchPct = |ExpectedKinds covered by PresentTypes| / |ExpectedKinds|, in [0,1]. Vacuously 1.0
	// when ExpectedKinds is empty (nothing required ⇒ fully covered). DG03 enriches this metric; DG02
	// ships its minimal pure form.
	MatchPct float64
}

// RequirementBench is the PORT (ADR 0088, slot `Formal caps` replaceable). Run derives a
// CompletenessReport from a Spec and a slice of candidate outputs. Implementations may be the
// deterministic RecompileOnlyBench (the fallback, no LLM) or — in DG04 — a model-backed adapter; in
// EITHER case the report is re-judged by the pure Extract, so the contract is identical. The port
// NEVER writes truth: Run returns a value, the caller routes MissingTypes through firewall.ViaIdea.
type RequirementBench interface {
	Run(spec Spec, candidates []LLMOutput) (CompletenessReport, error)
}

// RecompileOnlyBench is the DETERMINISTIC fallback behind the port — the "recompile seul". It derives
// the present requirement types from whatever candidates it is given (at the floor, a single
// deterministic recompile projection) via the pure Extract — NO LLM enters. This is the impl that
// runs when no model is available: a model absent ⇒ this fallback, NEVER a screen error (the
// degradation is governed; the replay stays green without AI). It is also the impl the reproducibility
// mirror certifies, so the contract is provable with zero network.
type RecompileOnlyBench struct{}

// statically assert the fallback satisfies the port.
var _ RequirementBench = RecompileOnlyBench{}

// Run derives the CompletenessReport. PURE and TOTAL: it Extracts each candidate's type set, unions
// them, computes the spec coverage and the missing (proposed) holes, and returns — no error path
// other than the (nil-safe) total computation. Determinism: candidates are processed in slice order,
// every set is sorted, so the SAME (spec, candidates) yields the SAME report byte-for-byte. A nil or
// empty candidates slice yields PresentTypes == [] (the honest floor: nothing surfaced ⇒ everything
// expected is missing) rather than a panic — the governed degradation.
func (RecompileOnlyBench) Run(spec Spec, candidates []LLMOutput) (CompletenessReport, error) {
	return Derive(spec, candidates), nil
}

// Derive is the PURE kernel of the bench, extracted so both the fallback and (in DG04) a model-backed
// adapter share the SAME deterministic judgement (§8 — the LLM's output is always re-judged here).
// It is exported so the reproducibility mirror can pin it directly, and so a DG04 adapter that
// produced candidate LLMOutputs can re-use the identical derivation rather than re-implementing it
// (the model proposes Text; this function counts types — the gated-exception split).
func Derive(spec Spec, candidates []LLMOutput) CompletenessReport {
	sets := make([][]RequirementKind, 0, len(candidates))
	for _, c := range candidates {
		sets = append(sets, Extract(c.Text))
	}
	present := union(sets...)

	rep := CompletenessReport{
		SpecID:        spec.ID,
		PresentTypes:  present,
		PresentCount:  len(present),
		ExpectedCount: len(spec.ExpectedKinds),
	}

	// MissingTypes = ExpectedKinds \ present, in the taxonomy's declared order (diff sorts).
	rep.MissingTypes = diff(sortedExpected(spec.ExpectedKinds), present)

	// MatchPct = covered/expected, vacuously 1.0 when nothing is expected.
	if rep.ExpectedCount == 0 {
		rep.MatchPct = 1.0
	} else {
		covered := rep.ExpectedCount - len(rep.MissingTypes)
		rep.MatchPct = float64(covered) / float64(rep.ExpectedCount)
	}
	return rep
}

// sortedExpected returns the spec's ExpectedKinds de-duplicated and sorted, so MissingTypes is
// independent of the order the human declared them in (determinism: same expected SET → same report).
func sortedExpected(expected []RequirementKind) []RequirementKind {
	seen := map[RequirementKind]bool{}
	out := make([]RequirementKind, 0, len(expected))
	for _, k := range expected {
		if !seen[k] {
			seen[k] = true
			out = append(out, k)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

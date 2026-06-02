package mutation

import (
	"math"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Verdict is the gate's decision over the stable phase. There is no third value
// (the rapid property pins this): a score either clears the declared bar or it
// does not.
type Verdict string

const (
	// VerdictPass — score ≥ threshold: the densimètre reads dense enough, the
	// stable phase may proceed (on this conjunct).
	VerdictPass Verdict = "pass"
	// VerdictBlock — score < threshold, or the report/threshold is unusable: the
	// mutation conjunct of the non-gameable Stop is false; the phase is blocked.
	VerdictBlock Verdict = "block"
)

// Local BlockReason codes (ADR 0030). Following the established hook precedent
// (pretooluse, posttooluse, sessionstart/selftest each declare their own codes —
// ADR 0029 §3): these reuse the S13 blockreason.BlockReason *shape* (code,
// severity, explanation, how_to_fix[]) but are declared HERE, not folded into
// S13's CLOSED Code enum. Extending that enum in place would edit a prior
// contract (§9) for a code S13 does not need.
const (
	// CodeMissingThreshold — Gate was asked to grade a report with no declared
	// threshold. The gate never invents its own bar (§8 anti-Goodhart): a missing
	// threshold is a BLOCK made explicit, never a silent self-chosen pass.
	CodeMissingThreshold blockreason.Code = "MISSING_THRESHOLD"
	// CodeUnparsableReport — the report carries no coverable mutant (total ==
	// not_covered, an empty denominator) or could not be parsed from the runner's
	// output. A score cannot be computed ⇒ BLOCK, never a silent 1.0 (KRD §82 the
	// .passthrough() anti-pattern, §1831 "une fitness function buggée passe tout").
	CodeUnparsableReport blockreason.Code = "UNPARSABLE_REPORT"
)

// blockReasonFor renders the local mutation-sensor BlockReason for a code. It
// mirrors blockreason.For's shape (code, severity, explanation, non-empty
// how_to_fix) without touching S13's closed registry — a wall without a door is a
// prison (KRD §44.5), so every code names the way out.
func blockReasonFor(code blockreason.Code) blockreason.BlockReason {
	switch code {
	case CodeMissingThreshold:
		return blockreason.BlockReason{
			Code:        CodeMissingThreshold,
			Severity:    blockreason.SeverityBlocking,
			Explanation: "the mutation gate was given no declared threshold; it does not invent its own bar (the agent never authors the fitness it is graded against)",
			HowToFix: []string{
				"read the mutation-score threshold SELECT-only from the fitness schema",
				"engrave the threshold above the waterline via an approved ChangeSet (the aidos writer role), never from the agent",
				"pass the read threshold into Gate(report, threshold)",
			},
		}
	case CodeUnparsableReport:
		return blockreason.BlockReason{
			Code:        CodeUnparsableReport,
			Severity:    blockreason.SeverityBlocking,
			Explanation: "the mutation report has no coverable mutant (or could not be parsed); a score cannot be computed, so the gate blocks rather than assume a silent 1.0",
			HowToFix: []string{
				"check the gremlins / StrykerJS run produced a parsable report with at least one coverable mutant",
				"add coverage so there are mutants to kill, then re-run the mutation sensor",
				"treat an unparsable run as a failure to surface, never as a pass",
			},
		}
	default:
		// Defensive: this package only ever blocks with its own two codes.
		return blockreason.BlockReason{
			Code:        code,
			Severity:    blockreason.SeverityBlocking,
			Explanation: "the mutation gate blocked",
			HowToFix:    []string{"inspect the mutation report and the declared threshold"},
		}
	}
}

// MutationReport is the runner-agnostic shape every runner adapter parses its
// tool's own report into (gremlins JSON for Go, Stryker JSON for the front). No
// operator logic lives here — only the killed/survived/timed-out/not-covered
// tally and, when blocked, the surviving mutants (the holes to plug).
type MutationReport struct {
	// Scope names what was mutated — "go" (gremlins) or "front" (StrykerJS).
	Scope string `json:"scope"`
	// Runner names the frozen tool whose report this was parsed from.
	Runner string `json:"runner"`
	// Killed — mutants a mirror caught (a test went red). These are the kills.
	Killed int `json:"killed"`
	// Survived — mutants no mirror caught (the tests stayed green). Each is a hole.
	Survived int `json:"survived"`
	// TimedOut — mutants whose run exceeded the budget. Counted as caught
	// (gremlins/Stryker both treat a timeout as a kill) but tracked separately.
	TimedOut int `json:"timed_out"`
	// NotCovered — mutants on uncovered code. Excluded from the denominator (the
	// ADR 0030 convention: score = killed / (total − not_covered)).
	NotCovered int `json:"not_covered"`
	// Total — every mutant the runner generated.
	Total int `json:"total"`
	// SurvivingMutants — the surviving-mutant list carried into the result (the
	// holes to plug): file · line · operator · the mirror gap.
	SurvivingMutants []SurvivingMutant `json:"surviving_mutants,omitempty"`
}

// SurvivingMutant is one mutant no mirror killed — the hole the densimètre found.
type SurvivingMutant struct {
	File     string `json:"file"`
	Line     int    `json:"line"`
	Operator string `json:"operator"`
	// Gap describes the missing invariant/fixture (the test gap), for the panel.
	Gap string `json:"gap,omitempty"`
}

// coverable is the gate's denominator: the mutants that COULD have been killed,
// i.e. every mutant minus the ones on uncovered code (ADR 0030). A timeout is a
// kill, so it stays in the numerator via Killed+TimedOut; not_covered is excluded
// from BOTH so an uncovered file neither helps nor hurts the score.
func (r MutationReport) coverable() int {
	return r.Total - r.NotCovered
}

// kills is the gate's numerator: killed + timed-out (a timeout counts as caught,
// matching gremlins and Stryker).
func (r MutationReport) kills() int {
	return r.Killed + r.TimedOut
}

// Score is the mutation score in [0,1]: killed / (total − not_covered) — the
// ADR 0030 denominator (uncovered mutants excluded). It is pure and total. When
// there is no coverable mutant the score is UNDEFINED (ok=false): the gate must
// BLOCK rather than divide by zero or assume a silent 1.0.
func (r MutationReport) Score() (score float64, ok bool) {
	denom := r.coverable()
	if denom <= 0 {
		return 0, false
	}
	s := float64(r.kills()) / float64(denom)
	// Clamp guards against a malformed report (kills > coverable); score stays in
	// [0,1] (the rapid property pins this).
	if s < 0 {
		s = 0
	}
	if s > 1 {
		s = 1
	}
	return s, true
}

// Gated is the gate's result: the verdict, the score it graded, the threshold it
// graded against, the surviving mutants, and — when blocked for a structural
// reason (no threshold / unparsable) — the actionable BlockReason. Content for
// the mutation_runs row and the /mutation-score panel.
type Gated struct {
	Verdict          Verdict                  `json:"verdict"`
	Score            float64                  `json:"score"`
	Threshold        float64                  `json:"threshold"`
	SurvivingMutants []SurvivingMutant        `json:"surviving_mutants,omitempty"`
	BlockReason      *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// Gate grades a mutation report against a DECLARED threshold (read SELECT-only
// from fitness, passed in as an input — never authored here). It is pure, total
// and deterministic:
//
//   - threshold == nil            ⇒ Block(MISSING_THRESHOLD) — never a self-chosen bar.
//   - report has no coverable mutant (or threshold out of [0,1])
//     ⇒ Block(UNPARSABLE_REPORT)  — never a silent 1.0.
//   - score ≥ threshold           ⇒ Pass.
//   - score < threshold           ⇒ Block, carrying the surviving mutants.
//
// threshold is a *float64 so an ABSENT bar (nil) is distinct from a declared
// 0.0 bar — the gate never confuses "no bar" with "bar at zero".
func Gate(report MutationReport, threshold *float64) Gated {
	if threshold == nil {
		br := blockReasonFor(CodeMissingThreshold)
		return Gated{Verdict: VerdictBlock, BlockReason: &br, SurvivingMutants: report.SurvivingMutants}
	}
	bar := *threshold
	if bar < 0 || bar > 1 || math.IsNaN(bar) {
		// A malformed bar is treated as unusable: BLOCK, never grade against it.
		br := blockReasonFor(CodeUnparsableReport)
		return Gated{Verdict: VerdictBlock, Threshold: bar, BlockReason: &br, SurvivingMutants: report.SurvivingMutants}
	}
	score, ok := report.Score()
	if !ok {
		br := blockReasonFor(CodeUnparsableReport)
		return Gated{Verdict: VerdictBlock, Threshold: bar, BlockReason: &br, SurvivingMutants: report.SurvivingMutants}
	}
	if score >= bar {
		return Gated{Verdict: VerdictPass, Score: score, Threshold: bar}
	}
	return Gated{Verdict: VerdictBlock, Score: score, Threshold: bar, SurvivingMutants: report.SurvivingMutants}
}

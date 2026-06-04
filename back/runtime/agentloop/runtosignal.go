// runtosignal.go — BA30: the GATEWAY RunToSignal(run) → (reality.Signal, ok) with
// IDENTITY-BY-PATTERN (gap I1/I2). The reality engine (S43) exists but has NO on-ramp from a
// build-agent run: a failed/abandoned run, or a GREEN run of abnormal SHAPE, is exactly the
// kind of recurring world-failure the RealityMirror was built to learn from — yet nothing
// wired a run to reality.Observe. This file is that bridge, and ONLY that bridge: it maps a
// run to the reality.Signal the external loop already knows how to digest (Observe → Learn →
// Idea), so the run becomes a SENSOR that injects ideas.
//
// IDENTITY-BY-PATTERN (gap I2 — the load-bearing decision). The signal's identity is
// content-addressed on the PATTERN (failure-class + dominant refusal code + layer/cause
// class), NOT the run id. Two DISTINCT runs that share a failure mode MUST collapse into ONE
// recurring signal — otherwise reality.Observe (which hashes Ref+Signal+CauseSketch+Taint+
// LinkedBranches) would re-observe a fresh incident every time and Recurrence would never
// exceed 1. So ToObserveInput is built ENTIRELY from the pattern: it carries NO run id, no
// goal id, no timestamp — only the pattern. The run id / goal id ride the PROVENANCE prose
// (Provenance), surfaced for the human, never folded into the content address.
//
// THE WALL (CLAUDE.md §2): this gateway writes NOTHING and declares NO truth. The CauseSketch
// it produces is an explicit HYPOTHESIS (reality carries cause_sketch, never a falsifiable
// assertion); the signal it builds is reality (incident_derived taint, no version, no mirror).
// The far edge stays idea → mirror → /goal → human. RunToSignal proposes; it never governs.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the classifier is a PURE, TOTAL function — a tally and
// a switch over the run's recorded shape, never an LLM "judge this run" agent. Same run +
// same declared thresholds ⇒ same signal (the reproducibility mirror runtosignal_property_test.go
// pins it). The thresholds are DECLARED knobs (above the line, §8 "weights declared, never
// learned"), never inferred. An ordinary green run yields (_, false) — no signal invented.
package agentloop

import (
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/reality"
)

// FailureClass is the closed classification of a run's shape for signal purposes. It is the
// FIRST component of the pattern identity (gap I2). A run maps to exactly one class.
type FailureClass string

const (
	// ClassNone — an ordinary green run of normal shape: NO signal (RunToSignal returns false).
	ClassNone FailureClass = "none"
	// ClassStillRed — the run ended without closing the goal (still_red): the red set survived.
	ClassStillRed FailureClass = "still_red"
	// ClassAbandoned — the run was halted (abandoned): a budget axis breached mid-run (BA27).
	ClassAbandoned FailureClass = "abandoned"
	// ClassBlocked — the run was blocked: it could not even legally act.
	ClassBlocked FailureClass = "blocked"
	// ClassGreenHollow — the run closed the goal (green) but with an ABNORMAL shape (gap I1):
	// thrashing against the wall, or a determinism gap surfacing. Lower severity than a failure.
	ClassGreenHollow FailureClass = "green_hollow"
)

// Severity ranks how loud the signal is. A failed/abandoned/blocked run is HIGH; a hollow
// green is LOW (it succeeded, but its shape warns). It is carried for the panel/triage and is
// NOT part of the pattern identity (so a pattern's recurrence still collapses across severity
// — severity is a property of the class, which IS in the identity, so it is consistent).
type Severity string

const (
	SeverityHigh Severity = "high"
	SeverityLow  Severity = "low"
)

// SignalThresholds are the DECLARED knobs the green-hollow detector reads (§8: declared,
// never learned). A run that closed its goal still emits a LOW-severity signal when its
// refusal count reaches ThrashRefusals (thrashing against the wall) OR it carries a
// determinism-gap refusal (an Arbitrate→LLMGated surfacing). The zero value disables the
// hollow-green detector for ThrashRefusals (0 means "never thrash-trip"), which keeps an
// ordinary green run silent by default.
type SignalThresholds struct {
	// ThrashRefusals is the refusal count at/above which a GREEN run is flagged hollow
	// (thrashing against the wall). 0 disables the count-based trip.
	ThrashRefusals int `json:"thrash_refusals"`
}

// DefaultThresholds is the canonical declared knob set used by the MCP tool / panel when the
// caller supplies none. The value is a DECLARATION (above the line), pinned here so the
// gateway is reproducible without a config read.
func DefaultThresholds() SignalThresholds {
	return SignalThresholds{ThrashRefusals: 3}
}

// PatternSignal is the gateway's typed result. Signal is the reality.Signal the external loop
// digests; Pattern is the content-address key (failure-class + dominant code + cause class)
// the identity is built from; Severity ranks it; Provenance is the human-facing prose ("agent
// run R failed on goal G") carried OUTSIDE the content address (it never collapses two runs).
type PatternSignal struct {
	// Signal is the reality.Signal (operation / error / recurrence). Its Operation+Error are
	// pattern-derived (no run id) so two runs of the same pattern produce the SAME signal.
	Signal reality.Signal `json:"signal"`
	// Class is the run's classification (the first identity component).
	Class FailureClass `json:"class"`
	// Pattern is the stable identity key: "<class>|<dominant_code>|<cause_class>". Two runs
	// sharing a failure mode share this key — the basis of Recurrence (gap I2).
	Pattern string `json:"pattern"`
	// Severity ranks the signal (high for failures, low for hollow-green).
	Severity Severity `json:"severity"`
	// CauseSketch is the root-cause HYPOTHESIS (never a truth) the signal carries into Learn.
	CauseSketch string `json:"cause_sketch"`
	// Provenance is the human-facing prose ("agent run R failed on goal G"). It is NOT folded
	// into the content address (it names the specific run; the identity is the pattern).
	Provenance string `json:"provenance"`
}

// Classify is the PURE, TOTAL classifier: it maps a run + declared thresholds to its
// FailureClass. A failed/abandoned/blocked run maps to its class directly; a green run maps to
// ClassGreenHollow iff it is abnormal (thrash refusals ≥ threshold, OR a determinism-gap
// refusal present), else ClassNone. Same input ⇒ same class; no clock, no rng, no I/O, no LLM.
func Classify(run agentrun.AgentRun, th SignalThresholds) FailureClass {
	switch run.Result {
	case agentrun.ResultStillRed:
		return ClassStillRed
	case agentrun.ResultAbandoned:
		return ClassAbandoned
	case agentrun.ResultBlocked:
		return ClassBlocked
	case agentrun.ResultGreen:
		if isHollowGreen(run, th) {
			return ClassGreenHollow
		}
		return ClassNone
	default:
		// An out-of-enum result is not classified into a signal (defensive; Record refuses it).
		return ClassNone
	}
}

// isHollowGreen reports whether a green run's SHAPE is abnormal (gap I1): the wall-refusal
// count reaches the declared thrash threshold (thrashing against the wall), OR it carries at
// least one determinism-gap refusal (AGENT_DETERMINISM_GAP — an Arbitrate→LLMGated surfacing).
// Pure, total.
func isHollowGreen(run agentrun.AgentRun, th SignalThresholds) bool {
	refusals := refusalsOf(run)
	total := 0
	for _, n := range refusals {
		total += n
	}
	if th.ThrashRefusals > 0 && total >= th.ThrashRefusals {
		return true
	}
	if refusals[blockreason.CodeAgentDeterminismGap] > 0 {
		return true
	}
	return false
}

// dominantRefusalCode returns the single refusal code that best characterises the run's
// failure mode: the most frequent wall-refusal code, ties broken by the code's string order
// (deterministic). Empty when the run had no refusal (e.g. a still_red run that simply ran out
// of moves). This is the SECOND identity component. Pure, total.
func dominantRefusalCode(run agentrun.AgentRun) blockreason.Code {
	refusals := refusalsOf(run)
	if len(refusals) == 0 {
		return ""
	}
	codes := make([]blockreason.Code, 0, len(refusals))
	for c := range refusals {
		codes = append(codes, c)
	}
	sort.Slice(codes, func(i, j int) bool {
		if refusals[codes[i]] != refusals[codes[j]] {
			return refusals[codes[i]] > refusals[codes[j]] // most frequent first
		}
		return codes[i] < codes[j] // tie: lexical, for determinism
	})
	return codes[0]
}

// causeClass is the THIRD identity component: a coarse, stable bucket of WHY the run is a
// signal, derived purely from the class + dominant code. It is part of the pattern (so two
// runs with the same cause collapse) but is deliberately coarse (it is a CLASS, never the
// run's specific story — that lives in the provenance prose). Pure, total.
func causeClass(class FailureClass, code blockreason.Code) string {
	switch {
	case code == blockreason.CodeAgentDeterminismGap:
		return "determinism_gap"
	case code == blockreason.CodeAgentWriteAboveWaterline:
		return "wall_thrash"
	case code != "":
		return "refused_" + string(code)
	case class == agentrunClass(agentrun.ResultAbandoned):
		return "budget_breach"
	default:
		return "goal_unmet"
	}
}

// agentrunClass maps a Result to its FailureClass label (used only by causeClass to compare
// without importing the switch twice). Pure.
func agentrunClass(r agentrun.Result) FailureClass {
	switch r {
	case agentrun.ResultAbandoned:
		return ClassAbandoned
	default:
		return ClassNone
	}
}

// RunToSignal is the GATEWAY (gap I1/I2). It classifies the run; an ordinary green run yields
// (PatternSignal{}, false) — NO signal invented. Any failure class, and an abnormal green,
// yields (signal, true). The signal's identity is the PATTERN (class + dominant refusal code +
// cause class) — NOT the run id — so two distinct runs sharing a failure mode produce the SAME
// Signal (Operation+Error) and thus the SAME incident when handed to reality.Observe, letting
// Recurrence climb. PURE, TOTAL: same run + thresholds ⇒ same result; no clock, no rng, no
// I/O, no LLM. The CauseSketch is a HYPOTHESIS (never a truth); the run/goal id rides the
// human-facing Provenance, outside the content address.
func RunToSignal(run agentrun.AgentRun, th SignalThresholds) (PatternSignal, bool) {
	class := Classify(run, th)
	if class == ClassNone {
		return PatternSignal{}, false
	}
	code := dominantRefusalCode(run)
	cause := causeClass(class, code)
	pattern := fmt.Sprintf("%s|%s|%s", class, code, cause)

	sev := SeverityHigh
	if class == ClassGreenHollow {
		sev = SeverityLow
	}

	// The Signal.Operation/Error are PATTERN-derived — they MUST NOT carry the run id or goal
	// id (those would defeat identity-by-pattern). "Operation" is the pattern's failure class;
	// "Error" is the cause class (+ the dominant code when present). Recurrence starts at 1;
	// reality.Observe collapses identical signals and the caller's reality.Observe bumps it.
	op := "agent_run:" + string(class)
	errStr := cause
	if code != "" {
		errStr = string(code) + " (" + cause + ")"
	}

	return PatternSignal{
		Signal: reality.Signal{
			Operation:  op,
			Error:      errStr,
			Recurrence: 1,
		},
		Class:    class,
		Pattern:  pattern,
		Severity: sev,
		// The cause sketch is an explicit HYPOTHESIS — never a falsifiable assertion. It names
		// the SHAPE, not a root cause the gateway is not entitled to declare.
		CauseSketch: causeSketchFor(class, code, sev),
		// Provenance carries the SPECIFIC run + goal for the human, OUTSIDE the content address.
		Provenance: fmt.Sprintf("agent run %s %s on goal %q", shortRun(run.ID), class, run.Goal),
	}, true
}

// causeSketchFor builds the root-cause HYPOTHESIS prose for the signal. It is a hypothesis (it
// says "the kernel may be incomplete here", never "the kernel IS wrong"); the human writes the
// falsifiable assertion at /goal. Pure, total.
func causeSketchFor(class FailureClass, code blockreason.Code, sev Severity) string {
	base := fmt.Sprintf(
		"HYPOTHESIS (not a truth): a build-agent run of class %q is a recurring signal "+
			"(severity %s). The kernel may be incomplete or the goal under-specified here — "+
			"the human decides the assertion at /goal.", class, sev)
	if code != "" {
		base += fmt.Sprintf(" Dominant wall-refusal: %s.", code)
	}
	return base
}

// shortRun returns a short prefix of a content-hash run id for human-facing prose (the full id
// would clutter the sketch; the provenance is prose, not an address). Pure.
func shortRun(id string) string {
	if len(id) <= 12 {
		return id
	}
	return id[:12]
}

// ToObserveInput builds the reality.ObserveInput for a PatternSignal — the input handed to
// reality.Observe. It is built ENTIRELY from the PATTERN (gap I2): the Ref is the pattern key
// (not "#NNNN" and not the run id), the Signal is the pattern signal, the CauseSketch is the
// hypothesis, the Taint always contains incident_derived (it is reality). It carries NO run
// id, no goal id, no timestamp — so reality.Observe produces the SAME incident id for any two
// runs of the same pattern, and Recurrence climbs across runs. Pure, total.
func (ps PatternSignal) ToObserveInput() reality.ObserveInput {
	return reality.ObserveInput{
		Ref:            ps.Pattern, // the pattern IS the recurring reference (not a run id)
		Signal:         ps.Signal,
		CauseSketch:    ps.CauseSketch,
		Taint:          []firewall.Taint{firewall.TaintIncidentDerived},
		LinkedBranches: nil,
	}
}

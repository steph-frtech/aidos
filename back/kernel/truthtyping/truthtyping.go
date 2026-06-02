// Package truthtyping is the pure classifier of KRD §13.4–13.5 "épistémologie
// opérationnelle" — typing the true before the ratchet is allowed to bite.
//
// KRD §13.4: "Toute affirmation doit déclarer son type de vérité […] son mode de
// vérification, et son droit à entrer — ou non — dans le noyau." Every Truth carries
// a TruthKind (its EPISTEMIC type — behavioral/structural/… — distinct from a
// mirror's test_kind) and a VerifiabilityLevel (CAN the ratchet bite this signal at
// all). KRD §13.5's rule is mechanical here: "Si le signal n'est pas vérifiable, KRD
// ne certifie pas. Il passe en /spike, en expérimentation ou en revue humaine."
//
// Classify is the verdict:
//   - a Truth with an ABSENT truth_kind is REJECTED (it cannot even be considered);
//   - a Truth with an UNKNOWN (out-of-enum) truth_kind is REJECTED at the boundary;
//   - otherwise the VerifiabilityLevel's allowed_mode decides the zone: allowed_mode
//     == kernel admits it to the kernel; any other allowed_mode ROUTES it away —
//     to /spike, experiment, or manual_review — the ratchet stays OFF (NOT a failure).
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O. It reads a
// Truth value handed to it and returns a Routing verdict. READ-ONLY against truth; it
// writes nothing (the wall, CLAUDE.md §2). BELOW the waterline (computational): the
// typing RULE is the human's (KRD §13.4/§13.5); this step only ENFORCES it.
package truthtyping

import (
	"errors"
	"fmt"
)

// TruthKind is the EPISTEMIC type of a Truth — exactly the seven members of KRD
// §13.4. It is NOT a mirror's test_kind: the law is "toute vérité a un type
// épistémique, et son miroir doit être du même type" — the kind says what KIND of
// claim it is (and thus which mirror form proves it), not how the mirror runs.
type TruthKind string

const (
	// KindBehavioral — hard behaviour: auth, payment, permissions (KRD §13.4).
	KindBehavioral TruthKind = "behavioral"
	// KindStructural — architecture, dependencies, schema, contracts.
	KindStructural TruthKind = "structural"
	// KindExperiential — UX, perception, clarity, trust.
	KindExperiential TruthKind = "experiential"
	// KindEconomic — cost, conversion, business performance.
	KindEconomic TruthKind = "economic"
	// KindRegulatory — law, compliance, GDPR.
	KindRegulatory TruthKind = "regulatory"
	// KindStatistical — A/B, observation, experimentation.
	KindStatistical TruthKind = "statistical"
	// KindExploratory — not yet verifiable, stays in /spike.
	KindExploratory TruthKind = "exploratory"
)

// kindOrder is the canonical enumeration order of the seven TruthKinds (KRD §13.4
// order). Declared, never derived from map iteration, so Kinds() and every
// projection are stable.
var kindOrder = []TruthKind{
	KindBehavioral,
	KindStructural,
	KindExperiential,
	KindEconomic,
	KindRegulatory,
	KindStatistical,
	KindExploratory,
}

// Kinds returns the seven KRD §13.4 TruthKinds in canonical order.
func Kinds() []TruthKind {
	out := make([]TruthKind, len(kindOrder))
	copy(out, kindOrder)
	return out
}

// IsKnownKind reports whether k is one of the seven KRD §13.4 TruthKinds. The empty
// kind is NOT a known kind (it is the "absent" case, distinguished from an out-of-enum
// value by Classify).
func IsKnownKind(k TruthKind) bool {
	for _, kk := range kindOrder {
		if kk == k {
			return true
		}
	}
	return false
}

// VerifiabilityLevel is how strongly a Truth's signal can be proven — exactly the
// five members of KRD §13.5. It answers "CAN the ratchet bite this signal at all?".
type VerifiabilityLevel string

const (
	// LevelDeterministic — exact test, yes/no (KRD §13.5).
	LevelDeterministic VerifiabilityLevel = "deterministic"
	// LevelStatistical — A/B, interval, probability.
	LevelStatistical VerifiabilityLevel = "statistical"
	// LevelDelayed — truth observable later.
	LevelDelayed VerifiabilityLevel = "delayed"
	// LevelHumanJudged — UX, strategy, taste.
	LevelHumanJudged VerifiabilityLevel = "human_judged"
	// LevelUnverifiable — not ratchetable.
	LevelUnverifiable VerifiabilityLevel = "unverifiable"
)

// levelOrder is the canonical enumeration order of the five VerifiabilityLevels.
var levelOrder = []VerifiabilityLevel{
	LevelDeterministic,
	LevelStatistical,
	LevelDelayed,
	LevelHumanJudged,
	LevelUnverifiable,
}

// Levels returns the five KRD §13.5 VerifiabilityLevels in canonical order.
func Levels() []VerifiabilityLevel {
	out := make([]VerifiabilityLevel, len(levelOrder))
	copy(out, levelOrder)
	return out
}

// IsKnownLevel reports whether l is one of the five KRD §13.5 VerifiabilityLevels.
func IsKnownLevel(l VerifiabilityLevel) bool {
	for _, ll := range levelOrder {
		if ll == l {
			return true
		}
	}
	return false
}

// AllowedMode is the admission gate of a VerifiabilityLevel — exactly the four
// members of KRD §13.5's allowed_mode. Only kernel admits a Truth to the kernel;
// the other three route it away (the ratchet stays off).
type AllowedMode string

const (
	// ModeKernel — the ratchet may bite: admitted to the kernel (KRD §13.5).
	ModeKernel AllowedMode = "kernel"
	// ModeExperiment — routed to experimentation (statistical signal).
	ModeExperiment AllowedMode = "experiment"
	// ModeSpike — routed to /spike (not yet ratchetable).
	ModeSpike AllowedMode = "spike"
	// ModeManualReview — routed to human review (taste/strategy).
	ModeManualReview AllowedMode = "manual_review"
)

// allowedMode maps each VerifiabilityLevel to its admission gate. This is the
// DECLARED human rule of KRD §13.5 (never learned, CLAUDE.md §8) made data, not a
// scattered switch: only `deterministic` may enter the kernel; a statistical signal
// goes to experiment; a delayed/unverifiable signal goes to /spike; a human_judged
// signal goes to manual_review. The verdict reads this table; nothing else decides.
var allowedMode = map[VerifiabilityLevel]AllowedMode{
	LevelDeterministic: ModeKernel,
	LevelStatistical:   ModeExperiment,
	LevelDelayed:       ModeSpike,
	LevelHumanJudged:   ModeManualReview,
	LevelUnverifiable:  ModeSpike,
}

// AllowedModeOf returns the admission gate of a level, and whether the level is a
// known member of the closed enum. It invents nothing.
func AllowedModeOf(l VerifiabilityLevel) (AllowedMode, bool) {
	m, ok := allowedMode[l]
	return m, ok
}

// Truth is the minimal projection of a kernel Truth record this classifier reads —
// just its two epistemic-typing fields. It is NOT the full records.Record (which is
// content-addressed JSONB); the classifier is pure and only needs these two fields,
// which the migration adds as nullable columns on kernel.truth. An empty string is
// the "not set" case (a nullable column read as NULL).
type Truth struct {
	TruthKind          TruthKind          `json:"truth_kind"`
	VerifiabilityLevel VerifiabilityLevel `json:"verifiability_level"`
}

// Zone is the destination a Truth is routed to by Classify. Only ZoneKernel admits
// it to the ratchet; the rest keep the ratchet OFF.
type Zone string

const (
	// ZoneKernel — admitted: the truth enters the kernel, the ratchet may bite.
	ZoneKernel Zone = "kernel"
	// ZoneSpike — routed to /spike (the exploration zone, for /harvest later).
	ZoneSpike Zone = "/spike"
	// ZoneExperiment — routed to experimentation.
	ZoneExperiment Zone = "experiment"
	// ZoneManualReview — routed to human review.
	ZoneManualReview Zone = "manual_review"
	// ZoneRejected — not even considered: no/unknown TruthKind.
	ZoneRejected Zone = "rejected"
)

// BlockCode is the S14-local refusal code carried by a rejected Routing. It is NOT a
// member of the closed runtime/blockreason.Code enum (that set is frozen, uppercase,
// and CLAUDE.md §9 forbids inventing members there): these kebab-case codes name the
// two typing-rejection cases of KRD §13.4 and are surfaced verbatim by the mirror.
type BlockCode string

const (
	// CodeMissingTruthKind — the truth declares no epistemic type; it cannot be
	// considered (KRD §13.4: "toute affirmation doit déclarer son type de vérité").
	CodeMissingTruthKind BlockCode = "missing-truth-kind"
	// CodeUnknownTruthKind — the truth declares a truth_kind outside the seven KRD
	// §13.4 members; rejected at the boundary, never silently coerced.
	CodeUnknownTruthKind BlockCode = "unknown-truth-kind"
	// CodeUnknownVerifiabilityLevel — the truth declares a verifiability_level
	// outside the five KRD §13.5 members. Defensive: the DB CHECK constraint pins
	// the column, so this is reachable only for an in-memory Truth built outside the
	// store; rejected at the boundary, never silently admitted.
	CodeUnknownVerifiabilityLevel BlockCode = "unknown-verifiability-level"
)

// Routing is the classifier's verdict over a Truth: the Zone it lands in, the
// AllowedMode that gated it (empty when rejected), whether it is Admitted to the
// kernel, and the BlockReason when rejected (empty Code otherwise).
type Routing struct {
	// Zone is where the truth is routed.
	Zone Zone `json:"zone"`
	// AllowedMode is the level's admission gate that produced the zone (empty when
	// the truth was rejected before a level was consulted).
	AllowedMode AllowedMode `json:"allowed_mode,omitempty"`
	// Admitted is true iff the truth may enter the kernel (Zone == ZoneKernel).
	Admitted bool `json:"admitted"`
	// Code is the rejection BlockReason code (empty unless Zone == ZoneRejected).
	Code BlockCode `json:"code,omitempty"`
}

// Classification errors. A rejected truth returns a typed error AND a Routing whose
// Zone is ZoneRejected carrying the BlockReason Code — callers may branch on either.
var (
	// ErrMissingTruthKind — the truth has no truth_kind set.
	ErrMissingTruthKind = errors.New("truthtyping: truth has no truth_kind (missing-truth-kind)")
	// ErrUnknownTruthKind — the truth's truth_kind is out of the §13.4 enum.
	ErrUnknownTruthKind = errors.New("truthtyping: unknown truth_kind (unknown-truth-kind)")
	// ErrUnknownLevel — the truth's verifiability_level is out of the §13.5 enum.
	ErrUnknownLevel = errors.New("truthtyping: unknown verifiability_level")
)

// Classify is the pure verdict of KRD §13.4–13.5 over a Truth. It REJECTS an
// absent/unknown truth_kind (returning a Routing with Zone ZoneRejected + a
// BlockReason Code, and a typed error), and otherwise routes by the
// VerifiabilityLevel's allowed_mode: ModeKernel admits the truth (ZoneKernel,
// Admitted), any other mode routes it away with the ratchet OFF (NOT a failure).
//
// Pure: no DB, no clock, no rng, no I/O. Same input → same verdict (the
// reproducibility mirror pins this).
func Classify(t Truth) (Routing, error) {
	// 1. The truth must declare its epistemic type at all (KRD §13.4).
	if t.TruthKind == "" {
		return Routing{Zone: ZoneRejected, Code: CodeMissingTruthKind}, ErrMissingTruthKind
	}
	// 2. The declared kind must be one of the seven §13.4 members — rejected at the
	//    boundary, never silently coerced into a string column.
	if !IsKnownKind(t.TruthKind) {
		return Routing{Zone: ZoneRejected, Code: CodeUnknownTruthKind},
			fmt.Errorf("%w: %q", ErrUnknownTruthKind, t.TruthKind)
	}
	// 3. The verifiability_level decides admission via its allowed_mode (KRD §13.5).
	mode, ok := AllowedModeOf(t.VerifiabilityLevel)
	if !ok {
		return Routing{Zone: ZoneRejected, Code: CodeUnknownVerifiabilityLevel},
			fmt.Errorf("%w: %q", ErrUnknownLevel, t.VerifiabilityLevel)
	}
	return Routing{
		Zone:        zoneForMode(mode),
		AllowedMode: mode,
		Admitted:    mode == ModeKernel,
	}, nil
}

// zoneForMode maps an admission gate to the routing zone. Only ModeKernel admits;
// the rest route the truth away (the ratchet stays off).
func zoneForMode(m AllowedMode) Zone {
	switch m {
	case ModeKernel:
		return ZoneKernel
	case ModeExperiment:
		return ZoneExperiment
	case ModeManualReview:
		return ZoneManualReview
	default: // ModeSpike
		return ZoneSpike
	}
}

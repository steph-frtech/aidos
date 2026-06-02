// Package temporal is the pure AST + decision functions of KRD §49.3 "TemporalInvariant
// — toute vérité temporelle doit déclarer son horloge".
//
// A TemporalInvariant is a first-class invariant KIND whose property is TIME-DEPENDENT
// and which therefore MUST declare its `clock` (clock ∈ system | external | logical) and
// its `tolerance` (a duration), and whose mirror is a TEMPORAL form (mirror ∈ statechart
// | TLA+ | UPPAAL). The canonical KRD §49.3 example is
// "payment_captured implies order_confirmed within 5 minutes" with clock: system,
// tolerance: 10s, mirror: statechart. §49.3 covers délais, ordre des événements,
// expiration, retries, timeouts, horloges différentes, événements en retard, idempotence
// et eventual consistency.
//
// THREE DISTINCTIONS (held verbatim from the spec — do NOT collapse them):
//  1. A TemporalInvariant is NOT the temporal AXIS of the DAG / ChangeSet (that edge —
//     WHEN truths CHANGED — already exists). It is a truth ABOUT TIME INSIDE the domain
//     behaviour (a deadline / ordering / expiry), riding on the kernel.truth record.
//  2. A TemporalInvariant is NOT scope.TimeWindow (S15). TimeWindow{From,To} is the
//     OPAQUE validity window (WHEN a truth applies; S15 pins NO clock semantics). A
//     TemporalInvariant is a CLOCK-BEARING property (a time RELATION between events:
//     within / before / after / eventually) with a declared clock AND a tolerance. A
//     TimeWindow has neither a clock nor a tolerance; a TemporalInvariant requires both.
//  3. It IS a first-class invariant KIND with clock + tolerance + a TEMPORAL MIRROR FORM,
//     living here in back/kernel/temporal, extending the S06 mirror cert_language enum
//     with statechart / tla+ (uppaal reserved for catastrophic real-time, §778).
//
// It lands the typed AST (TemporalInvariant), a pure Validate(inv) shape guard, and a
// pure Evaluate(inv, obs) → Verdict:
//
//   - Validate(inv) — the LOAD-BEARING rule of §49.3: a temporal truth with NO declared
//     clock (or a zero/unknown clock) is REJECTED ("toute vérité temporelle doit déclarer
//     son horloge"). Also: non-empty Property; a parseable, NON-NEGATIVE Tolerance; a
//     Mirror in {statechart, tla+, uppaal}; a recognised Relation; and a non-negative
//     Bound. A `logical` clock paired with a wall-clock (non-zero) tolerance is rejected
//     (a logical clock counts steps, not seconds — see OQ-S50-logical-tolerance).
//
//   - Evaluate(inv, obs) → Verdict — PURE, deterministic, TOTAL (always Held | Violated,
//     never a third state, never a panic). For a `within` deadline it compares the
//     PASSED-IN Observation.Elapsed against the property Bound WIDENED by Tolerance:
//     Elapsed ≤ Bound + Tolerance ⇒ Held; Elapsed > Bound + Tolerance ⇒ Violated /
//     TEMPORAL_INVARIANT_VIOLATED (the band is applied EXACTLY ONCE, one-sided for a
//     deadline — see ADR 0034). Event ORDER is part of the property (§49.3 "ordre des
//     événements"): a `within` implication whose consequent appears BEFORE the antecedent
//     (order_confirmed before payment_captured) is Violated regardless of Elapsed.
//
// PURE (CLAUDE.md §6/§8 determinism-first): NO time.Now(), NO sleep, NO real clock, NO
// rng, NO I/O, NO LLM. The `clock` field NAMES which clock the runtime will LATER sample;
// this step samples NOTHING — the elapsed/ordering datum is PASSED IN via the Observation.
// Validate / Evaluate are total and deterministic — same (invariant, observation) ⇒ same
// verdict — so the temporal proof is replayable (the rapid property mirror pins this; the
// reproducibility mirror). READ-ONLY against truth; it writes nothing (the wall, §2). The
// content-hash row id reuses the S02 records substrate (records.Hash(Canonicalize(body)));
// the BlockReason reuses the S13 shape. The runtime sensor that SAMPLES a real clock and
// feeds Observations, and any model-checker / TLA+ / UPPAAL runner, are LATER steps.
package temporal

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Clock is the FROZEN KRD §49.3 clock enum — the horloge a temporal truth MUST declare.
// Closed set of three; "toute vérité temporelle doit déclarer son horloge".
type Clock string

const (
	// ClockSystem — the wall clock of the system that emits the events (the default for a
	// deadline like "within 5 minutes"). Tolerance is a wall-clock duration.
	ClockSystem Clock = "system"
	// ClockExternal — an external time source (NTP, a partner's clock). Tolerance accounts
	// for skew between the external source and the system.
	ClockExternal Clock = "external"
	// ClockLogical — a logical clock (Lamport / vector / step counter): it counts CAUSAL
	// steps, not seconds. A logical clock with a wall-clock tolerance is a contradiction
	// (Validate rejects it — OQ-S50-logical-tolerance).
	ClockLogical Clock = "logical"
)

// clockOrder is the canonical enumeration order of the three §49.3 clocks. Declared,
// never derived from map iteration, so Clocks() and every projection are stable.
var clockOrder = []Clock{ClockSystem, ClockExternal, ClockLogical}

// Clocks returns the three frozen §49.3 clocks in canonical order.
func Clocks() []Clock {
	out := make([]Clock, len(clockOrder))
	copy(out, clockOrder)
	return out
}

// IsKnownClock reports whether c is one of the three §49.3 clocks. The empty clock is
// NOT a known clock (it is the "absent" case — the §49.3 violation Validate rejects).
func IsKnownClock(c Clock) bool {
	for _, cc := range clockOrder {
		if cc == c {
			return true
		}
	}
	return false
}

// MirrorForm is the FROZEN KRD §49.3 temporal mirror cert_language enum — how the
// temporal property is certified. Closed set of three; never extended here.
type MirrorForm string

const (
	// MirrorStatechart — certified by a statechart fixture (the pragmatic Tome winner for
	// N2/temporal, KRD §796: statechart 18 vs model-check 14). The default for this step.
	MirrorStatechart MirrorForm = "statechart"
	// MirrorTLAPlus — certified by a TLA+ model (formal, T2 — reserved for catastrophic
	// truths, KRD §778).
	MirrorTLAPlus MirrorForm = "tla+"
	// MirrorUPPAAL — certified by a UPPAAL timed-automaton model (T2 — reserved for hard
	// real-time, KRD §778). Held in the enum because §49.3 lists it; a row uses it only
	// for a catastrophic hard-real-time truth (the DB CHECK admits it).
	MirrorUPPAAL MirrorForm = "uppaal"
)

// mirrorOrder is the canonical enumeration order of the three §49.3 mirror forms.
var mirrorOrder = []MirrorForm{MirrorStatechart, MirrorTLAPlus, MirrorUPPAAL}

// MirrorForms returns the three frozen §49.3 temporal mirror forms in canonical order.
func MirrorForms() []MirrorForm {
	out := make([]MirrorForm, len(mirrorOrder))
	copy(out, mirrorOrder)
	return out
}

// IsKnownMirrorForm reports whether m is one of the three §49.3 temporal mirror forms.
func IsKnownMirrorForm(m MirrorForm) bool {
	for _, mm := range mirrorOrder {
		if mm == m {
			return true
		}
	}
	return false
}

// Relation is the time relation a temporal property asserts between the antecedent and
// the consequent event. §49.3 covers within / before / after / eventually; this step
// lands the `within` deadline (the canonical example) and the relation field is closed
// so an unrecognised relation is rejected (honesty — never invent a business rule).
type Relation string

const (
	// RelationWithin — the consequent must occur WITHIN the bound after the antecedent
	// (the canonical "order_confirmed within 5 minutes" deadline). The tolerance widens
	// the upper bound only (one-sided — you violate a deadline by being LATE, ADR 0034).
	RelationWithin Relation = "within"
)

// relationOrder is the canonical enumeration order of the recognised relations.
var relationOrder = []Relation{RelationWithin}

// Relations returns the recognised time relations in canonical order.
func Relations() []Relation {
	out := make([]Relation, len(relationOrder))
	copy(out, relationOrder)
	return out
}

// IsKnownRelation reports whether r is a recognised time relation.
func IsKnownRelation(r Relation) bool {
	for _, rr := range relationOrder {
		if rr == r {
			return true
		}
	}
	return false
}

// EventName is the name of a domain event the property orders (e.g. payment_captured).
type EventName string

// TemporalInvariant is the KRD §49.3 time-dependent invariant KIND AST. It is a value
// object, content-addressed inside its truth body (the S02 substrate). JSON keys match
// §49.3. Tolerance is held as a Go duration string ("10s") so the canonical body is
// stable text; ParsedTolerance parses it to time.Duration (never a bare int).
type TemporalInvariant struct {
	// Property is the human-readable time property, VERBATIM KRD §49.3 (e.g.
	// "payment_captured implies order_confirmed within 5 minutes"). Non-empty.
	Property string `json:"property"`
	// Antecedent is the triggering event (payment_captured). Non-empty.
	Antecedent EventName `json:"antecedent"`
	// Consequent is the event that must follow within the bound (order_confirmed). Non-empty.
	Consequent EventName `json:"consequent"`
	// Relation is the time relation (within). Closed enum.
	Relation Relation `json:"relation"`
	// Bound is the deadline (5 minutes), held as a Go duration string ("5m"). Non-negative.
	Bound string `json:"bound"`
	// Clock is the declared horloge (system | external | logical). The §49.3 load-bearing
	// field: a temporal truth with no/zero/unknown clock is rejected.
	Clock Clock `json:"clock"`
	// Tolerance is the band that prevents a flaky proof, held as a Go duration string
	// ("10s"). Non-negative; zero is allowed (a strict deadline).
	Tolerance string `json:"tolerance"`
	// Mirror is the temporal mirror form (statechart | tla+ | uppaal).
	Mirror MirrorForm `json:"mirror"`
}

// Validation errors.
var (
	// ErrEmptyProperty — the temporal invariant asserts no property.
	ErrEmptyProperty = errors.New("temporal: temporal invariant has no property")
	// ErrEmptyAntecedent — the property names no antecedent event.
	ErrEmptyAntecedent = errors.New("temporal: temporal invariant has no antecedent event")
	// ErrEmptyConsequent — the property names no consequent event.
	ErrEmptyConsequent = errors.New("temporal: temporal invariant has no consequent event")
	// ErrUnknownRelation — the relation is not a recognised time relation.
	ErrUnknownRelation = errors.New("temporal: unknown time relation (this step lands the `within` deadline only)")
	// ErrMissingClock — the LOAD-BEARING §49.3 rule: a temporal truth declares no clock.
	ErrMissingClock = errors.New("temporal: a temporal invariant MUST declare its clock — toute vérité temporelle doit déclarer son horloge (KRD §49.3)")
	// ErrUnknownClock — the clock is outside the §49.3 enum {system, external, logical}.
	ErrUnknownClock = errors.New("temporal: unknown clock (not a KRD §49.3 clock — system | external | logical)")
	// ErrUnparsableBound — the bound does not parse as a Go duration.
	ErrUnparsableBound = errors.New("temporal: bound does not parse as a duration")
	// ErrNegativeBound — the bound is negative (a deadline cannot be negative).
	ErrNegativeBound = errors.New("temporal: bound must be non-negative")
	// ErrUnparsableTolerance — the tolerance does not parse as a Go duration.
	ErrUnparsableTolerance = errors.New("temporal: tolerance does not parse as a duration")
	// ErrNegativeTolerance — the tolerance is negative (a tolerance widens; it never narrows).
	ErrNegativeTolerance = errors.New("temporal: tolerance must be non-negative")
	// ErrUnknownMirror — the mirror is outside the §49.3 enum {statechart, tla+, uppaal}.
	ErrUnknownMirror = errors.New("temporal: unknown mirror form (not a KRD §49.3 temporal mirror — statechart | tla+ | uppaal)")
	// ErrLogicalClockWallTolerance — a logical clock paired with a wall-clock tolerance is a
	// contradiction: a logical clock counts steps, not seconds (OQ-S50-logical-tolerance).
	ErrLogicalClockWallTolerance = errors.New("temporal: a logical clock cannot carry a wall-clock tolerance (a logical clock counts causal steps, not seconds — OQ-S50-logical-tolerance)")
)

// ParsedBound parses the Bound string to a time.Duration. It is the single parser, reused
// by Validate and Evaluate so they never diverge.
func (inv TemporalInvariant) ParsedBound() (time.Duration, error) {
	return time.ParseDuration(inv.Bound)
}

// ParsedTolerance parses the Tolerance string to a time.Duration.
func (inv TemporalInvariant) ParsedTolerance() (time.Duration, error) {
	return time.ParseDuration(inv.Tolerance)
}

// Validate is the PURE shape guard of a TemporalInvariant (KRD §49.3):
//   - property, antecedent, consequent non-empty;
//   - relation is a recognised relation (within);
//   - bound parses as a non-negative duration;
//   - the LOAD-BEARING rule: clock is declared and is one of {system, external, logical}
//     (a missing/zero clock is rejected — "toute vérité temporelle doit déclarer son
//     horloge"); a missing clock returns ErrMissingClock, an out-of-enum clock returns
//     ErrUnknownClock (the two cases are distinguished, like S14's missing/unknown kind);
//   - tolerance parses as a non-negative duration (zero allowed);
//   - mirror is one of {statechart, tla+, uppaal};
//   - a logical clock carries no wall-clock (non-zero) tolerance.
//
// Pure: no DB, no clock read, no I/O.
func Validate(inv TemporalInvariant) error {
	if inv.Property == "" {
		return ErrEmptyProperty
	}
	if inv.Antecedent == "" {
		return ErrEmptyAntecedent
	}
	if inv.Consequent == "" {
		return ErrEmptyConsequent
	}
	if !IsKnownRelation(inv.Relation) {
		return fmt.Errorf("%w: %q", ErrUnknownRelation, inv.Relation)
	}
	bound, err := inv.ParsedBound()
	if err != nil {
		return fmt.Errorf("%w: %q: %v", ErrUnparsableBound, inv.Bound, err)
	}
	if bound < 0 {
		return fmt.Errorf("%w: %q", ErrNegativeBound, inv.Bound)
	}
	// The §49.3 load-bearing rule: a temporal truth MUST declare its clock.
	if inv.Clock == "" {
		return ErrMissingClock
	}
	if !IsKnownClock(inv.Clock) {
		return fmt.Errorf("%w: %q", ErrUnknownClock, inv.Clock)
	}
	tol, err := inv.ParsedTolerance()
	if err != nil {
		return fmt.Errorf("%w: %q: %v", ErrUnparsableTolerance, inv.Tolerance, err)
	}
	if tol < 0 {
		return fmt.Errorf("%w: %q", ErrNegativeTolerance, inv.Tolerance)
	}
	if !IsKnownMirrorForm(inv.Mirror) {
		return fmt.Errorf("%w: %q", ErrUnknownMirror, inv.Mirror)
	}
	// A logical clock counts causal steps, not seconds — a wall-clock tolerance on a
	// logical clock is a contradiction (OQ-S50-logical-tolerance; not pinned by §49.3, so
	// the conservative reading is to reject it rather than silently coerce it).
	if inv.Clock == ClockLogical && tol > 0 {
		return ErrLogicalClockWallTolerance
	}
	return nil
}

// Verdict is Evaluate's result — exactly one of two. Evaluate is total: it always returns one.
type Verdict string

const (
	// VerdictHeld — the temporal property holds for the observation (inside the band, and
	// the event order is correct).
	VerdictHeld Verdict = "held"
	// VerdictViolated — the temporal property is broken (over tolerance, or out of order).
	VerdictViolated Verdict = "violated"
)

// CodeTemporalInvariantViolated is the refusal code carried by a violated Verdict (KRD
// §49.3 + §44.5). It is a LOCAL temporal-evaluation code — like sagas.CodeSagaInvariantViolated
// — NOT a member of the CLOSED runtime/blockreason.Code wall-refusal enum (extending that
// frozen enum needs a ChangeSet + SemanticDiff; this code names a runtime decision, not a
// wall write). Surfaced verbatim by the mirror and the /temporal-invariants panel.
const CodeTemporalInvariantViolated = "TEMPORAL_INVARIANT_VIOLATED"

// BlockReason is the actionable refusal (KRD §44.5: code, severity, explanation,
// how_to_fix[]). Same shape as the kernel's other BlockReasons (saga, authority,
// globalinvariant) — a code, a severity, a human explanation, and a non-empty how_to_fix.
type BlockReason struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

// Observation is the measured datum the runtime LATER samples and PASSES IN — never read
// here. For a `within` deadline it carries the ordered events the federation emitted and
// the Elapsed time between the antecedent and the consequent (on the declared clock).
type Observation struct {
	// EventOrder is the ordered events as observed (e.g. [payment_captured, order_confirmed]).
	// Event ORDER is part of the property (§49.3 "ordre des événements").
	EventOrder []EventName `json:"event_order"`
	// Elapsed is the measured time between the antecedent and the consequent, on the
	// declared clock. It is PASSED IN (the runtime samples it later) — this step reads no
	// wall clock. For a logical clock this is a step count expressed as a Duration unit.
	Elapsed time.Duration `json:"elapsed"`
}

// TemporalVerdict is Evaluate's result: the Verdict plus a BlockReason when violated.
type TemporalVerdict struct {
	Verdict     Verdict      `json:"verdict"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
}

// Evaluate is the PURE temporal property evaluator (KRD §49.3). For a `within` deadline:
//
//   - the event ORDER must be correct (the antecedent before the consequent, §49.3 "ordre
//     des événements"): a consequent observed BEFORE the antecedent ⇒ Violated, regardless
//     of Elapsed (confirmation before capture violates the implication);
//   - the antecedent absent ⇒ Held (the implication's antecedent is false, vacuously true);
//   - the consequent absent (the deadline never met) ⇒ Violated;
//   - Elapsed ≤ Bound + Tolerance ⇒ Held (the band widens the deadline one-sided — a
//     confirmation at 5m04s under tolerance 10s is HELD, NOT a flake);
//   - Elapsed > Bound + Tolerance ⇒ Violated / TEMPORAL_INVARIANT_VIOLATED.
//
// The tolerance band is applied EXACTLY ONCE, ONE-SIDED for a deadline (you violate a
// deadline by being LATE, never by being early — ADR 0034; §49.3 leaves `tolerance: ...`
// opaque so the conservative reading for a `within` relation is the one-sided upper band).
//
// Evaluate is TOTAL (always Held | Violated), DETERMINISTIC (same (inv, obs) ⇒ same
// verdict — the reproducibility mirror), and NEVER PANICS. PURE: NO time.Now(), no sleep,
// no real clock, no rng, no I/O. If the invariant itself is malformed (Validate would
// reject it) Evaluate treats it as Violated, actionably — it never silently passes.
func Evaluate(inv TemporalInvariant, obs Observation) TemporalVerdict {
	if err := Validate(inv); err != nil {
		return TemporalVerdict{Verdict: VerdictViolated, BlockReason: malformedReason(err)}
	}
	bound, _ := inv.ParsedBound()   // Validate guarantees these parse.
	tol, _ := inv.ParsedTolerance() //

	// Locate the antecedent and the consequent in the observed order.
	antIdx := indexOf(obs.EventOrder, inv.Antecedent)
	consIdx := indexOf(obs.EventOrder, inv.Consequent)

	// The antecedent never occurred: the implication is vacuously true (Held).
	if antIdx < 0 {
		return TemporalVerdict{Verdict: VerdictHeld}
	}
	// The antecedent occurred but the consequent never did: the deadline is never met (Violated).
	if consIdx < 0 {
		return TemporalVerdict{Verdict: VerdictViolated, BlockReason: violatedReason(missingConsequent)}
	}
	// Event ORDER: the consequent observed BEFORE the antecedent violates the implication
	// (order_confirmed before payment_captured) — §49.3 "ordre des événements".
	if consIdx < antIdx {
		return TemporalVerdict{Verdict: VerdictViolated, BlockReason: violatedReason(outOfOrder)}
	}
	// The deadline, widened by the tolerance band exactly once (one-sided upper).
	if obs.Elapsed <= bound+tol {
		return TemporalVerdict{Verdict: VerdictHeld}
	}
	return TemporalVerdict{Verdict: VerdictViolated, BlockReason: violatedReason(overTolerance)}
}

// indexOf returns the index of the first occurrence of e in es, or -1.
func indexOf(es []EventName, e EventName) int {
	for i, x := range es {
		if x == e {
			return i
		}
	}
	return -1
}

// violationCause is the internal reason a deadline was violated — it tunes the explanation
// without inventing new BlockReason codes (the code is always TEMPORAL_INVARIANT_VIOLATED).
type violationCause int

const (
	overTolerance violationCause = iota
	outOfOrder
	missingConsequent
)

// violatedReason is the actionable BlockReason for a violated temporal property (KRD
// §49.3 + §44.5). The code is always TEMPORAL_INVARIANT_VIOLATED; the explanation names
// the concrete cause and how_to_fix names confirming within the deadline or compensating.
func violatedReason(cause violationCause) *BlockReason {
	explanation := "La propriété temporelle est violée : la confirmation dépasse le délai déclaré, " +
		"même élargi par la tolérance (KRD §49.3 — toute vérité temporelle doit déclarer son horloge)."
	switch cause {
	case outOfOrder:
		explanation = "La propriété temporelle est violée : l'événement conséquent (order_confirmed) est " +
			"observé AVANT l'antécédent (payment_captured). L'ordre des événements fait partie de la " +
			"propriété (KRD §49.3 — ordre des événements) : une confirmation avant la capture brise l'implication."
	case missingConsequent:
		explanation = "La propriété temporelle est violée : l'antécédent (payment_captured) a eu lieu mais le " +
			"conséquent (order_confirmed) n'est jamais survenu — le délai n'est jamais atteint (KRD §49.3)."
	}
	return &BlockReason{
		Code:        CodeTemporalInvariantViolated,
		Severity:    "blocking",
		Explanation: explanation,
		HowToFix: []string{
			"confirm_within_5m_or_compensate : confirmez la commande dans le délai déclaré (la borne ± la tolérance) ou déclenchez la compensation de la saga (KRD §49.2/§49.3).",
			"widen_tolerance_only_if_declared : la tolérance n'est élargie que si l'humain la déclare (au-dessus de la ligne) — jamais silencieusement par l'agent ; ouvrez une idea → mirror → /goal.",
			"rerun aidos check : le blocage se lève dès que l'observation retombe dans la borne ± la tolérance, dans le bon ordre.",
		},
	}
}

// malformedReason is the actionable BlockReason for a temporal invariant that fails
// Validate (a hand-built invariant Evaluate guards). It surfaces the validation error.
func malformedReason(err error) *BlockReason {
	return &BlockReason{
		Code:     CodeTemporalInvariantViolated,
		Severity: "blocking",
		Explanation: "L'invariant temporel est mal formé et ne peut pas être évalué (KRD §49.3) : " +
			err.Error() + ". Une vérité temporelle doit déclarer son horloge, une borne et une tolérance valides.",
		HowToFix: []string{
			"declare_clock_and_tolerance : déclarez une horloge ∈ {system, external, logical}, une borne et une tolérance (durées non négatives), un mirror ∈ {statechart, tla+, uppaal}.",
			"rerun aidos check : le blocage se lève dès que l'invariant temporel passe Validate.",
		},
	}
}

// SerializeBody renders a minimal kernel.truth body carrying the temporal invariant, so it
// rides INSIDE the content-addressed body (the S02 substrate): a body produced here
// round-trips through records.NewRecord as id == version == Hash(Canonicalize(body)), and
// changing any field yields a different version (a new row, never an in-place mutation).
// The "kind":"truth" discriminator matches records.Validate. The property / clock /
// tolerance / mirror live INSIDE the JSONB body (a version-pinned truth fragment, the same
// nullable-expand discipline as S14 — existing rows are untouched).
func SerializeBody(inv TemporalInvariant) ([]byte, error) {
	body := map[string]any{
		"kind":               string(records.KindTruth),
		"temporal_invariant": inv,
	}
	return json.Marshal(body)
}

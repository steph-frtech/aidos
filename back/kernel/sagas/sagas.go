// Package sagas is the pure AST + distributed-transaction decision functions of KRD §49.2
// "SagaInvariant + CoherenceTest — un changement dans une cellule ne bloque ni ne corrompt la
// fédération".
//
// A SagaInvariant is a CROSS-CELL distributed-transaction invariant: it binds named
// `participants` (e.g. order, payment, shipping) to a `property` that must hold across the
// fédération (the canonical "payment_captured implies (order_confirmed or
// compensation_executed)"), each participant carrying its `compensation` step. It is — per
// KRD §49.1 — an EXPENSIVE, EXPLICIT EXCEPTION, not the normal mode: a saga lives at the
// `contract_pair` / `federation_policy` scope, NEVER `local_cell` (a saga is transverse by
// definition). This package specialises the S48 GlobalInvariant frame to the distributed-
// transaction case.
//
// It lands the typed AST (SagaInvariant + SagaParticipant + CoherenceTest), a pure
// Validate(saga) shape guard, and three pure functions:
//
//   - Evaluate(saga, trace) → SagaOutcome — given a saga and the ordered events the fédération
//     actually emitted (the statechart's terminal state), returns satisfied | violated PLUS, when
//     violated, an actionable BlockReason (KRD §44.5). The happy path (every leg commits) ⇒
//     satisfied; a leg that fails after payment_captured whose declared compensation ran
//     (compensation_executed present) ⇒ satisfied (the property holds VIA compensation); a
//     captured payment with NEITHER order_confirmed NOR compensation_executed ⇒ violated /
//     SAGA_INVARIANT_VIOLATED (the dangling-money monster), how_to_fix names running the
//     compensation. The `property` is encoded over the S08 Expr DSL (reused, never free Go).
//
//   - RunCompensation(saga, failedTrace) → Compensation — given a saga and a trace where a leg
//     failed, returns the ordered compensation events the saga runs (each participant's declared
//     compensation legs, then the compensation_executed marker) + the post-compensation trace.
//     This is the statechart's compensation transition — it REFERENCES the S10 operations
//     pinned id@version; it does NOT execute them against a live store (a later runtime step).
//
//   - CheckCoherence(coherenceTest, heads) → CoherenceOutcome — given the pinned consumed
//     contract refs and the heads map (reusing the S17 Resolve staleness primitive — NOT forked),
//     returns coherent | incompatible: an event consumed at a version the producer no longer
//     produces at head ⇒ incompatible / INCOMPATIBLE_CONTRACT_VERSION.
//
// PURE (CLAUDE.md §6/§8 determinism-first): no DB, no clock, no rng, no I/O. Validate /
// Evaluate / RunCompensation / CheckCoherence are total and deterministic — same input ⇒ same
// output — so the saga proof is replayable (the rapid property mirror pins this). There is NO
// LLM in this step's loop. The content-hash row id reuses the S02 records substrate
// (records.Hash(Canonicalize(body))); the property reuses the S08 Expr DSL; the compensation
// legs + participant contracts reuse the S17 links.Ref (id@version) + Resolve — none is forked
// here. READ-ONLY against truth; it writes nothing (the wall, CLAUDE.md §2). It proves the saga
// INVARIANT + its compensation property; the saga EXECUTOR / federation runtime is a later step,
// and TemporalInvariant (§49.3) / RedWorkQueue (§49.4) are OUT OF SCOPE here (no clock).
package sagas

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/expr"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Scope is the FROZEN saga scope enum (KRD §49.1). A saga is transverse by definition, so the
// set is exactly the two cross-cell scopes — local_cell is deliberately EXCLUDED (a saga can
// never be declared cell-local).
type Scope string

const (
	// ScopeContractPair — the saga binds exactly the two cells either side of a contract.
	ScopeContractPair Scope = "contract_pair"
	// ScopeFederationPolicy — the saga binds a federation of cells (the checkout example).
	ScopeFederationPolicy Scope = "federation_policy"
)

// Scopes returns the two frozen saga scopes in canonical order (local_cell is NOT one of them).
func Scopes() []Scope { return []Scope{ScopeContractPair, ScopeFederationPolicy} }

// IsKnownScope reports whether s is one of the two transverse saga scopes. local_cell is false.
func IsKnownScope(s Scope) bool {
	switch s {
	case ScopeContractPair, ScopeFederationPolicy:
		return true
	default:
		return false
	}
}

// CertLanguage is the FROZEN KRD §49.2 mirror cert_language enum — how the saga's property is
// certified. Closed set of three; never extended here.
type CertLanguage string

const (
	// CertStatechart — the saga is certified by a statechart fixture (state → command → events).
	CertStatechart CertLanguage = "statechart"
	// CertPact — the saga is certified by a Pact contract between participants.
	CertPact CertLanguage = "pact"
	// CertTLAPlus — the saga is certified by a TLA+ model (formal, T2).
	CertTLAPlus CertLanguage = "tla+"
)

// CertLanguages returns the three frozen §49.2 cert languages in canonical order.
func CertLanguages() []CertLanguage { return []CertLanguage{CertStatechart, CertPact, CertTLAPlus} }

// IsKnownCertLanguage reports whether cl is one of the three frozen §49.2 cert languages.
func IsKnownCertLanguage(cl CertLanguage) bool {
	switch cl {
	case CertStatechart, CertPact, CertTLAPlus:
		return true
	default:
		return false
	}
}

// EventName is a saga event name (e.g. payment_captured, order_confirmed). It is the vocabulary
// the property predicate is evaluated over.
type EventName string

// CellRef is a reference to a participant cell (bounded context), e.g. "order". Non-empty.
type CellRef string

// SagaParticipant is one cell in the saga: the events it commits and its compensation legs (each
// an S10 operation pinned id@version, reusing the S17 links.Ref shape — never free code).
type SagaParticipant struct {
	// Cell is the participant's bounded context (e.g. order). Non-empty.
	Cell CellRef `json:"cell"`
	// Commits are the events this participant commits on success (e.g. order_confirmed).
	Commits []EventName `json:"commits"`
	// Compensation are the compensation legs (S10 operations pinned id@version) the saga runs
	// when this participant must be undone. May be empty (a leaf participant with nothing to undo).
	Compensation []links.Ref `json:"compensation"`
}

// MirrorSpec carries the saga mirror's cert_language (KRD §49.2).
type MirrorSpec struct {
	// CertLanguage is how the saga's property is certified (one of the three §49.2 languages).
	CertLanguage CertLanguage `json:"cert_language"`
}

// CoherenceTest is the sibling KRD §49.2 invariant: « aucun événement consommé n'est produit par
// une version incompatible ». It pins the consumed contract refs (id@version) and its property.
type CoherenceTest struct {
	// Contracts are the pinned consumed contract refs (e.g. order.events@v3, payment.commands@v2).
	Contracts []links.Ref `json:"contracts"`
	// Property is the human-readable coherence predicate (verbatim KRD §49.2).
	Property string `json:"property"`
}

// SagaInvariant is the KRD §49.2 cross-cell distributed-transaction invariant AST. It is a value
// object, content-addressed inside its truth body (the S02 substrate). JSON keys match §49.2.
type SagaInvariant struct {
	// Name is the saga's stable name (e.g. "checkout-payment-shipping"). Non-empty.
	Name string `json:"name"`
	// Scope is the saga's transverse scope (contract_pair | federation_policy — never local_cell).
	Scope Scope `json:"scope"`
	// Participants are the cells the saga spans (≥2 — a single-participant saga is a monster).
	Participants []SagaParticipant `json:"participants"`
	// Property is the cross-cell predicate (the human-readable form, verbatim KRD §49.2). It is
	// encoded over the S08 Expr DSL at evaluation time (predicateExpr).
	Property string `json:"property"`
	// Mirror carries the saga mirror's cert_language.
	Mirror MirrorSpec `json:"mirror"`
	// CoherenceTest is the optional sibling §49.2 coherence invariant.
	CoherenceTest *CoherenceTest `json:"coherence_test,omitempty"`
}

// Validation errors.
var (
	// ErrEmptyName — the saga has no name.
	ErrEmptyName = errors.New("sagas: saga has no name")
	// ErrEmptyProperty — the saga asserts no property.
	ErrEmptyProperty = errors.New("sagas: saga has no property")
	// ErrUnknownScope — scope is not a transverse saga scope (local_cell is rejected).
	ErrUnknownScope = errors.New("sagas: unknown scope — a saga is transverse by definition (contract_pair | federation_policy), never local_cell (KRD §49.1)")
	// ErrUnknownCertLanguage — cert_language is out of the frozen §49.2 enum.
	ErrUnknownCertLanguage = errors.New("sagas: unknown cert_language (not a KRD §49.2 cert language)")
	// ErrTooFewParticipants — a saga names < 2 participants (a single-participant saga is a monster).
	ErrTooFewParticipants = errors.New("sagas: a saga must span ≥2 participants (a single-participant saga is not a distributed transaction)")
	// ErrMalformedParticipant — a participant has an empty cell ref.
	ErrMalformedParticipant = errors.New("sagas: malformed participant (empty cell ref)")
	// ErrUnpinnedCompensation — a compensation stepRef is not a pinned id@version ref (S17).
	ErrUnpinnedCompensation = errors.New("sagas: a compensation stepRef must be pinned id@version (an unpinned compensation leg is a monster)")
	// ErrUnpinnedContract — a CoherenceTest contract ref is not a pinned id@version ref (S17).
	ErrUnpinnedContract = errors.New("sagas: a CoherenceTest contract ref must be pinned id@version")
	// ErrUnparsableProperty — the property does not encode to an Expr AST.
	ErrUnparsableProperty = errors.New("sagas: property does not parse as an Expr predicate")
)

// Validate is the PURE shape guard of a SagaInvariant (KRD §49.1/§49.2):
//   - name and property non-empty;
//   - scope is one of the two transverse scopes (local_cell rejected — a saga is transverse);
//   - cert_language in the frozen §49.2 three-set;
//   - ≥2 participants (a single-participant saga is a monster), each with a non-empty cell ref;
//   - every compensation stepRef is a pinned id@version ref (S17 — an unpinned leg is a monster);
//   - the property encodes to an Expr AST (the predicate over the participants' event vocabulary);
//   - if a CoherenceTest is present, every contract ref is pinned id@version.
//
// Pure: no DB, no clock, no I/O.
func Validate(s SagaInvariant) error {
	if s.Name == "" {
		return ErrEmptyName
	}
	if s.Property == "" {
		return ErrEmptyProperty
	}
	if !IsKnownScope(s.Scope) {
		return fmt.Errorf("%w: %q", ErrUnknownScope, s.Scope)
	}
	if !IsKnownCertLanguage(s.Mirror.CertLanguage) {
		return fmt.Errorf("%w: %q", ErrUnknownCertLanguage, s.Mirror.CertLanguage)
	}
	if len(s.Participants) < 2 {
		return fmt.Errorf("%w: %d participant(s)", ErrTooFewParticipants, len(s.Participants))
	}
	for _, p := range s.Participants {
		if p.Cell == "" {
			return ErrMalformedParticipant
		}
		for _, c := range p.Compensation {
			if !c.IsPinned() {
				return fmt.Errorf("%w: %q", ErrUnpinnedCompensation, c.String())
			}
		}
	}
	if _, err := predicateExpr(s.Property); err != nil {
		return fmt.Errorf("%w: %v", ErrUnparsableProperty, err)
	}
	if s.CoherenceTest != nil {
		for _, c := range s.CoherenceTest.Contracts {
			if !c.IsPinned() {
				return fmt.Errorf("%w: %q", ErrUnpinnedContract, c.String())
			}
		}
	}
	return nil
}

// Outcome is Evaluate's verdict — exactly one of two. Evaluate is total: it always returns one.
type Outcome string

const (
	// OutcomeSatisfied — the saga property holds for the trace (happy path OR via compensation).
	OutcomeSatisfied Outcome = "satisfied"
	// OutcomeViolated — the saga property is broken (the dangling-money monster).
	OutcomeViolated Outcome = "violated"
)

// CodeSagaInvariantViolated is the refusal code carried by a violated SagaOutcome: a captured
// payment with neither order_confirmed nor compensation_executed (KRD §49.2 + §44.5).
const CodeSagaInvariantViolated = "SAGA_INVARIANT_VIOLATED"

// CodeIncompatibleContractVersion is the refusal code carried by an incompatible CoherenceOutcome:
// a consumed event pinned to a non-head producer version (KRD §49.2 + §44.5).
const CodeIncompatibleContractVersion = "INCOMPATIBLE_CONTRACT_VERSION"

// BlockReason is the actionable refusal (KRD §44.5: code, severity, explanation, how_to_fix[]).
// Same shape as the kernel's other BlockReasons (authority, propagation, globalinvariant).
type BlockReason struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

// SagaOutcome is Evaluate's verdict: the Outcome plus a BlockReason when violated (nil otherwise).
type SagaOutcome struct {
	Outcome     Outcome      `json:"outcome"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
}

// Trace is the ordered events the fédération actually emitted — the statechart's terminal state.
type Trace []EventName

// Evaluate is the PURE saga property evaluator (KRD §49.2). It evaluates the canonical property
// "payment_captured implies (order_confirmed or compensation_executed)" over the trace, encoded
// as an S08 Expr AST (De Morgan over the closed catalogue: !(payment_captured && (!order_confirmed
// && !compensation_executed)) — the catalogue has !, && but not || / implies, so the equivalent
// negation form is used; extending the Expr catalogue would be an S08 contract change).
//
//   - the happy path (payment_captured, order_confirmed) ⇒ satisfied;
//   - a leg that fails after payment_captured whose compensation ran (compensation_executed) ⇒
//     satisfied (the property holds VIA compensation);
//   - a captured payment with NEITHER order_confirmed NOR compensation_executed ⇒ violated /
//     SAGA_INVARIANT_VIOLATED, how_to_fix [run_compensation_on_failure, declare_compensation...];
//   - a trace WITHOUT payment_captured ⇒ satisfied (the antecedent is false, vacuously true).
//
// Evaluate is TOTAL (always satisfied | violated), DETERMINISTIC (same (saga, trace) ⇒ same
// outcome), and NEVER PANICS on a malformed/partial trace (the Expr Eval recovers; a missing
// event is bound to false). PURE: no DB, no clock, no rng, no I/O. The rapid property mirror pins
// totality / determinism / the core safety property.
func Evaluate(s SagaInvariant, trace Trace) SagaOutcome {
	pred, err := predicateExpr(s.Property)
	if err != nil {
		// An unparsable property cannot be satisfied — treat as violated, actionably. (Validate
		// rejects this before a saga is persisted; this guards a hand-built saga.)
		return SagaOutcome{Outcome: OutcomeViolated, BlockReason: unparsablePropertyReason(s.Property, err)}
	}

	// Bind every event referenced by the property to its presence in the trace (true | false).
	present := map[EventName]bool{}
	for _, e := range trace {
		present[e] = true
	}
	// NewEnv resolves $-rooted refs from the value under the "$" key, so the event presences
	// live under "$" (the evaluator walks $.payment_captured, …).
	data := map[string]any{"$": map[string]any{
		"payment_captured":      present["payment_captured"],
		"order_confirmed":       present["order_confirmed"],
		"compensation_executed": present["compensation_executed"],
	}}
	env := expr.NewEnv(data, expr.Providers{})
	v, evalErr := expr.Eval(pred, env)
	if evalErr != nil {
		return SagaOutcome{Outcome: OutcomeViolated, BlockReason: unparsablePropertyReason(s.Property, evalErr)}
	}
	holds, ok := v.AsBool()
	if !ok {
		return SagaOutcome{Outcome: OutcomeViolated, BlockReason: unparsablePropertyReason(s.Property, errors.New("property did not evaluate to a boolean"))}
	}
	if holds {
		return SagaOutcome{Outcome: OutcomeSatisfied}
	}
	return SagaOutcome{Outcome: OutcomeViolated, BlockReason: sagaViolatedReason()}
}

// sagaViolatedReason is the actionable BlockReason for the dangling-money monster: a captured
// payment with neither order_confirmed nor compensation_executed (KRD §49.2 + §44.5).
func sagaViolatedReason() *BlockReason {
	return &BlockReason{
		Code:     CodeSagaInvariantViolated,
		Severity: "blocking",
		Explanation: "Un paiement capturé (payment_captured) reste sans commande confirmée (order_confirmed) " +
			"ni compensation exécutée (compensation_executed) : la propriété de la saga est violée. Une jambe a " +
			"échoué après la capture et la compensation déclarée n'a pas été exécutée — la fédération laisse de " +
			"l'argent capturé contre rien (KRD §49.2).",
		HowToFix: []string{"run_compensation_on_failure", "declare_compensation_for_the_failed_leg"},
	}
}

// unparsablePropertyReason is the actionable BlockReason for a property that does not parse /
// evaluate. Surfaced when a hand-built saga carries a broken predicate.
func unparsablePropertyReason(property string, cause error) *BlockReason {
	return &BlockReason{
		Code:        CodeSagaInvariantViolated,
		Severity:    "blocking",
		Explanation: fmt.Sprintf("La propriété de la saga %q n'a pas pu être évaluée : %v.", property, cause),
		HowToFix:    []string{"fix_the_property_predicate", "run_compensation_on_failure"},
	}
}

// Compensation is RunCompensation's result: the ordered compensation events the saga runs (each
// participant's declared compensation legs in canonical order, then the compensation_executed
// marker) and the post-compensation trace (the failed trace + those events).
type Compensation struct {
	// Events are the ordered compensation events (e.g. refundPayment@v3, cancelOrder@v2,
	// compensation_executed). The legs are referenced S10 operations (id@version) — NOT executed.
	Events []string `json:"events"`
	// Trace is the post-compensation trace (the failed trace with compensation_executed appended).
	Trace Trace `json:"trace"`
}

// RunCompensation is the PURE statechart compensation transition (KRD §49.2): given a saga and a
// trace where a leg failed, it returns the ordered compensation events the saga runs — the
// declared compensation legs of the participants whose commit events are present (their work must
// be undone), in REVERSE participant order (the last-committed leg is compensated first, the saga
// pattern), then the terminal compensation_executed marker.
//
// The legs are REFERENCED S10 operations pinned id@version (links.Ref) — RunCompensation does NOT
// execute them against a live store (a later runtime step); it produces the compensation event
// sequence the statechart would emit. PURE, TOTAL, DETERMINISTIC.
func RunCompensation(s SagaInvariant, failed Trace) Compensation {
	present := map[EventName]bool{}
	for _, e := range failed {
		present[e] = true
	}
	events := []string{}
	// Reverse participant order: compensate the most-recently-committed leg first.
	for i := len(s.Participants) - 1; i >= 0; i-- {
		p := s.Participants[i]
		// A participant is compensated iff one of its commit events is present in the trace
		// (its work landed and must now be undone).
		committed := false
		for _, c := range p.Commits {
			if present[c] {
				committed = true
				break
			}
		}
		if !committed {
			continue
		}
		for _, leg := range p.Compensation {
			events = append(events, leg.String())
		}
	}
	events = append(events, "compensation_executed")

	out := append(Trace{}, failed...)
	out = append(out, "compensation_executed")
	return Compensation{Events: events, Trace: out}
}

// Coherence is CheckCoherence's verdict — exactly one of two. Total: always one of these.
type Coherence string

const (
	// CoherenceCoherent — every consumed contract ref pins exactly the producer's head.
	CoherenceCoherent Coherence = "coherent"
	// CoherenceIncompatible — some consumed ref pins a non-head (stale/absent) producer version.
	CoherenceIncompatible Coherence = "incompatible"
)

// CoherenceOutcome is CheckCoherence's verdict: the Coherence plus a BlockReason when
// incompatible (nil otherwise), and the offending refs.
type CoherenceOutcome struct {
	Coherence   Coherence    `json:"coherence"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
	Offending   []string     `json:"offending,omitempty"`
}

// CheckCoherence is the PURE coherence check of KRD §49.2: « aucun événement consommé n'est
// produit par une version incompatible ». For each pinned consumed contract ref, it COMPOSES the
// S17 links.Resolve staleness primitive (NOT forked): a ref is incompatible iff Resolve against
// the heads is NOT green (stale = pinned to a non-head version; absent = no head at all). The
// outcome is incompatible iff ANY consumed ref is not at head, coherent only when all are.
//
//   - the saga pins order.events@v3, payment.commands@v2; heads {payment.commands: v4} ⇒
//     payment.commands is stale ⇒ incompatible / INCOMPATIBLE_CONTRACT_VERSION;
//   - heads {payment.commands: v2} (and order.events: v3) ⇒ every ref at head ⇒ coherent.
//
// CheckCoherence is TOTAL, DETERMINISTIC, and NEVER PANICS. PURE: no DB, no clock, no rng, no I/O.
func CheckCoherence(ct CoherenceTest, heads links.Heads) CoherenceOutcome {
	offending := []string{}
	for _, ref := range ct.Contracts {
		// Compose S17 Resolve: model the consumed ref as a contracts_with link's `to` target.
		// Resolve keys only on the `to` ref against heads; a from is required for Validate but
		// does not change staleness, so a self-pinned from suffices here.
		l := links.Link{Kind: links.KindContractsWith, From: ref, To: ref}
		if links.Resolve(l, heads) != links.StatusGreen {
			offending = append(offending, ref.String())
		}
	}
	if len(offending) == 0 {
		return CoherenceOutcome{Coherence: CoherenceCoherent}
	}
	return CoherenceOutcome{
		Coherence:   CoherenceIncompatible,
		Offending:   offending,
		BlockReason: incompatibleContractReason(offending),
	}
}

// incompatibleContractReason is the actionable BlockReason for a consumed event produced by an
// incompatible (non-head) producer version (KRD §49.2 + §44.5).
func incompatibleContractReason(offending []string) *BlockReason {
	return &BlockReason{
		Code:     CodeIncompatibleContractVersion,
		Severity: "blocking",
		Explanation: fmt.Sprintf("Un événement consommé est épinglé à une version producteur incompatible "+
			"(non-head) : %v. La fédération ne reste cohérente que si chaque contrat consommé pointe la version "+
			"head du producteur (KRD §49.2).", offending),
		HowToFix: []string{"repin_consumed_contract_to_producer_head", "open_a_changeset_to_migrate_the_consumer"},
	}
}

// predicateExpr encodes the saga property string as an S08 Expr AST. The canonical KRD §49.2
// property "payment_captured implies (order_confirmed or compensation_executed)" is encoded via
// De Morgan over the closed Expr catalogue (which has !, && but neither || nor implies, by
// design — extending it would be an S08 contract change requiring a ChangeSet + SemanticDiff):
//
//	payment_captured implies (order_confirmed or compensation_executed)
//	  ≡ !(payment_captured && !(order_confirmed or compensation_executed))
//	  ≡ !(payment_captured && (!order_confirmed && !compensation_executed))
//
// The events are bound as $-rooted refs ($.payment_captured, …) the evaluator resolves from the
// trace-presence Env. A property string this package does not recognise is rejected (ErrUnparsable
// at Validate) — the honesty rule: this step proves the canonical §49.2 property only, it does not
// invent a free predicate parser.
func predicateExpr(property string) (expr.Expr, error) {
	switch property {
	case "payment_captured implies (order_confirmed or compensation_executed)":
		// !(payment_captured && (!order_confirmed && !compensation_executed))
		return expr.Call("!",
			expr.Call("&&",
				expr.Ref("$.payment_captured"),
				expr.Call("&&",
					expr.Call("!", expr.Ref("$.order_confirmed")),
					expr.Call("!", expr.Ref("$.compensation_executed")),
				),
			),
		), nil
	default:
		return nil, fmt.Errorf("sagas: unrecognised saga property %q (this step proves the canonical KRD §49.2 property only)", property)
	}
}

// SerializeBody renders a minimal kernel.truth body carrying the saga, so it rides INSIDE the
// content-addressed body (the S02 substrate): a body produced here round-trips through
// records.NewRecord as id == version == Hash(Canonicalize(body)), and changing any field yields a
// different version (a new row, never an in-place mutation). The "kind":"truth" discriminator
// matches records.Validate. The participant lists, the property, the pinned compensation/contract
// refs and the cert_language live INSIDE the JSONB body (version-pinned refs, not foreign keys —
// a stale/absent target must stay inspectable to be shown red, never forbidden by an FK).
func SerializeBody(s SagaInvariant) ([]byte, error) {
	body := map[string]any{
		"kind":           string(records.KindTruth),
		"saga_invariant": s,
	}
	return json.Marshal(body)
}

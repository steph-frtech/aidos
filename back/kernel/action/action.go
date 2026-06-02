// Package action is the AIDOS action-spec — the Kernel SOURCE that BINDS a control
// to an operation (KRD §24.2, §94): {on: click(controlRef), invoke: operation@version
// with {…}, on_success[], on_error[]}. It carries "behaviour in DSL, never free code"
// all the way down to the button's action.
//
// An action is NOT an event handler. The generated onClick is a later PROJECTION (S38
// web emitter); the action-spec is the SOURCE above the waterline. Its truth is an
// EVENT fixture (event → invoke/effect) — KRD §27.
//
// THE LINKS (KRD §28, §41). `on` holds the control→event the action fires on; `binds`
// is the action→operation link, held as the `invoke` ref INSIDE the body (not a
// separate link table). Validate proves both the `on` control ref and the `invoke`
// operation ref resolve to known refs — an orphan bind is a monster the completeness
// law forbids.
//
// PLAN RESOLVES, IT DOES NOT EXECUTE. Plan(action, event) resolves the bind: it
// returns the operation ref, the resolved `with {…}` Expr args, and the on_success /
// on_error effect lists — WITHOUT invoking the operation or running an effect. The
// actual handler is a later projection, not this step.
//
// THE EXPR DSL IS REUSED (ADR 0007). The `with {…}` args and the effect arguments are
// expr.Expr ASTs from the FROZEN back/kernel/expr; this package does not re-implement
// Expr. Effect verbs (navigate, toast, toast.error) are taken VERBATIM from KRD §24.2
// — opaque verb descriptors, no invented effect semantics.
//
// THE WALL (CLAUDE.md §2). PURE — no DB, no I/O, no clock, no RNG (determinism-first).
// The kernel.action truth table is SELECT-only to the agent role; an action AST is
// written only by the aidos CLI through an approved ChangeSet.
package action

import (
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/expr"
)

// Validation / Plan errors — all TYPED, never a panic.
var (
	// ErrOrphanBind is returned by Validate when the `invoke` operation ref does not
	// resolve to a known operation (no orphan bind = no monster).
	ErrOrphanBind = errors.New("action: invoke does not resolve to a known operation ref")
	// ErrOrphanOnControl is returned when the `on` control ref does not resolve to a
	// known control.
	ErrOrphanOnControl = errors.New("action: on control does not resolve to a known control ref")
	// ErrUnknownEventKind is returned for an `on` event whose kind is not "click".
	ErrUnknownEventKind = errors.New("action: unknown event kind (only click is supported)")
	// ErrEventNotForThisAction is returned by Plan when the event does not match the
	// action's `on` (e.g. a click on a different control).
	ErrEventNotForThisAction = errors.New("action: event does not match the action's `on`")
)

// EventKind is the closed set of event kinds an action fires on. KRD §24.2 names
// exactly one: click. Extending it is a contract change (ChangeSet + SemanticDiff).
type EventKind string

const (
	// EventClick — on: click("checkout-button"). The only event kind this step pins.
	EventClick EventKind = "click"
)

// On is the action's trigger event: the kind plus the control it fires on (the
// control→event reference). KRD §24.2: `on: click("checkout-button")`.
type On struct {
	Kind    EventKind
	Control string
}

// Event is a concrete event presented to Plan (e.g. Click("checkout-button")). Plan
// resolves a bind only when the event matches the action's `on`.
type Event struct {
	Kind    EventKind
	Control string
}

// Click builds a click Event on a control.
func Click(controlRef string) Event {
	return Event{Kind: EventClick, Control: controlRef}
}

// Effect is one on_success / on_error effect: a verb (verbatim from KRD §24.2 —
// navigate / toast / toast.error) and its argument expression. It is an OPAQUE
// descriptor — Plan lists it, it never executes it (no invented effect semantics).
type Effect struct {
	Verb string
	Arg  expr.Expr
}

// Action is one content-addressed action-spec (KRD §24.2, §94). It is read from the
// kernel.action AST; this package validates and plans it.
type Action struct {
	// Name is the action identifier (e.g. "checkout-submit").
	Name string
	// On is the trigger event: click(controlRef) — the control→event reference.
	On On
	// Invoke is the operation ref the action binds to (the action→operation link).
	Invoke string
	// With are the invoke arguments, by name, each an Expr DSL AST ($.cart, $.auth.user).
	With map[string]expr.Expr
	// OnSuccess / OnError are the ordered effect lists.
	OnSuccess []Effect
	OnError   []Effect
}

// RefSet is a set of known refs (controls or operations). Validate uses it to reject
// an orphan on-control / orphan bind. It is a value object (no I/O).
type RefSet map[string]struct{}

// KnownControls builds a RefSet of known control refs.
func KnownControls(refs ...string) RefSet { return refSet(refs) }

// KnownOperations builds a RefSet of known operation refs.
func KnownOperations(refs ...string) RefSet { return refSet(refs) }

func refSet(refs []string) RefSet {
	s := make(RefSet, len(refs))
	for _, r := range refs {
		s[r] = struct{}{}
	}
	return s
}

// Has reports whether ref is in the set.
func (s RefSet) Has(ref string) bool {
	_, ok := s[ref]
	return ok
}

// Validate checks an action's shape and that BOTH links resolve: the `on` control ref
// against knownControls, and the `invoke` operation ref against knownOperations. An
// unresolved ref is an orphan link (a monster). Validate is PURE — no DB, no I/O.
func Validate(a Action, knownControls, knownOperations RefSet) error {
	if a.On.Kind != EventClick {
		return fmt.Errorf("%w: %q", ErrUnknownEventKind, a.On.Kind)
	}
	if !knownControls.Has(a.On.Control) {
		return fmt.Errorf("%w: %q", ErrOrphanOnControl, a.On.Control)
	}
	if !knownOperations.Has(a.Invoke) {
		return fmt.Errorf("%w: %q", ErrOrphanBind, a.Invoke)
	}
	return nil
}

// Plan is the resolved bind: the operation to invoke, the resolved with{…} args, and
// the effect lists — WITHOUT executing anything. It is the green of the event fixture
// (Plan resolves click("checkout-button") → invoke operation "createOrder").
type PlanResult struct {
	// Invoke is the bound operation ref (the action BINDS this operation).
	Invoke string
	// Args are the invoke arguments by name (the with{…} Expr ASTs, unevaluated).
	Args map[string]any
	// OnSuccess / OnError are the ordered effect lists, copied verbatim.
	OnSuccess []Effect
	OnError   []Effect
}

// Plan resolves the action's bind for a given event. It fires only when the event
// matches the action's `on` (kind + control); a foreign event yields a typed error.
// It RESOLVES the bind (operation ref + with args + effect lists) without executing
// the operation or any effect. PURE and deterministic: same (action, event) ⇒ same
// PlanResult.
func Plan(a Action, ev Event) (PlanResult, error) {
	if ev.Kind != a.On.Kind || ev.Control != a.On.Control {
		return PlanResult{}, fmt.Errorf("%w: got %s(%q), want %s(%q)",
			ErrEventNotForThisAction, ev.Kind, ev.Control, a.On.Kind, a.On.Control)
	}
	args := make(map[string]any, len(a.With))
	for k, e := range a.With {
		args[k] = e
	}
	return PlanResult{
		Invoke:    a.Invoke,
		Args:      args,
		OnSuccess: append([]Effect(nil), a.OnSuccess...),
		OnError:   append([]Effect(nil), a.OnError...),
	}, nil
}

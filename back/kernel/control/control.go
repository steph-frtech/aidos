// Package control is the AIDOS control-spec — a BUTTON AS A KERNEL SOURCE (KRD
// §24.1, §94): a typed AST {view, label, visible_when, enabled_when, triggers} whose
// two conditions are Expr DSL ASTs. It carries "behaviour in DSL, never free code"
// all the way down to the button.
//
// A control is NOT a rendered component. The rendered <button>/<Pressable>/voice
// command is a later PROJECTION (S38 web emitter) guarded by this control's mirror;
// the control-spec is the SOURCE above the waterline. Its truth is a STATE fixture
// (given → button.visible/enabled) — KRD §27.
//
// THE EXPR DSL IS REUSED, NEVER RE-INVENTED (ADR 0007). visible_when / enabled_when
// are expr.Expr ASTs evaluated by the FROZEN back/kernel/expr interpreter over the
// closed catalogue (>, length, &&, !). This package depends on that contract; it
// does not re-implement Expr.
//
// THE LINKS (KRD §28, §41). `triggers` is the versioned control→action link, held as
// a ref INSIDE the body (not a separate link table). Validate proves it resolves to
// a known action ref — an orphan trigger is a monster the completeness law forbids.
//
// THE WALL (CLAUDE.md §2). This package is PURE — no DB calls, no I/O, no clock, no
// RNG (determinism-first, CLAUDE.md §6). The kernel.control truth table is SELECT-only
// to the agent role; a control AST is written only by the aidos CLI through an
// approved ChangeSet. EvalState is a pure function of (control, given): same inputs ⇒
// same {visible, enabled}.
package control

import (
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/expr"
)

// Validation errors — all TYPED, never a panic.
var (
	// ErrOrphanTrigger is returned by Validate when a control's `triggers` does not
	// resolve to a known action ref (no orphan trigger = no monster).
	ErrOrphanTrigger = errors.New("control: triggers does not resolve to a known action ref")
	// ErrMissingView is returned when a control has no view.
	ErrMissingView = errors.New("control: missing view")
	// ErrMissingCondition is returned when visible_when or enabled_when is nil.
	ErrMissingCondition = errors.New("control: missing visible_when/enabled_when condition")
	// ErrConditionNotBool is returned when a condition Expr does not evaluate to a
	// boolean on the canonical given (it must be a bool predicate — KRD §24.1).
	ErrConditionNotBool = errors.New("control: visible_when/enabled_when must be a boolean Expr")
)

// Control is one content-addressed control-spec (KRD §24.1, §94). It is read from
// the kernel.control AST; this package evaluates its two conditions and validates
// its trigger.
type Control struct {
	// Name is the control identifier (e.g. "checkout-button").
	Name string
	// View is the screen the button lives on (e.g. "cart").
	View string
	// Label is the i18n key for the button text (e.g. i18n("cart.checkout")). Held
	// as the raw i18n key string; the rendered label is a projection concern.
	Label string
	// VisibleWhen is the Expr DSL predicate deciding button.visible (KRD §24.1).
	VisibleWhen expr.Expr
	// EnabledWhen is the Expr DSL predicate deciding button.enabled. Consulted ONLY
	// when VisibleWhen is true (a hidden button has no enabled state).
	EnabledWhen expr.Expr
	// Triggers is the action ref this control fires — the control→action link
	// (KRD §28). Held as a ref inside the body; Validate proves it resolves.
	Triggers string
}

// State is the computed button state for a given situation: the result of EvalState.
type State struct {
	// Visible is the value of visible_when over the given.
	Visible bool
	// Enabled is the value of enabled_when over the given — false whenever Visible is
	// false (enabled_when is consulted only when visible_when holds).
	Enabled bool
}

// ActionSet is the set of known action refs a control's `triggers` may resolve to.
// Validate uses it to reject an orphan trigger. It is a value object (no I/O); the
// caller (the aidos check validator, a ChangeSet pre-flight) supplies the heads.
type ActionSet map[string]struct{}

// KnownActions builds an ActionSet from a list of known action refs.
func KnownActions(refs ...string) ActionSet {
	s := make(ActionSet, len(refs))
	for _, r := range refs {
		s[r] = struct{}{}
	}
	return s
}

// Has reports whether ref is a known action.
func (s ActionSet) Has(ref string) bool {
	_, ok := s[ref]
	return ok
}

// Validate checks a control's shape and that its `triggers` resolves to a known
// action ref (no orphan trigger). It also checks each condition is a well-typed
// boolean Expr by evaluating it over an EMPTY env: a condition that errors on a
// dangling ref is allowed (refs resolve against the runtime given), but a condition
// that evaluates to a non-bool literal is rejected. Validate is PURE — no DB, no I/O.
func Validate(c Control, known ActionSet) error {
	if c.View == "" {
		return ErrMissingView
	}
	if c.VisibleWhen == nil || c.EnabledWhen == nil {
		return ErrMissingCondition
	}
	if !known.Has(c.Triggers) {
		return fmt.Errorf("%w: %q", ErrOrphanTrigger, c.Triggers)
	}
	if err := checkBoolShape(c.VisibleWhen); err != nil {
		return fmt.Errorf("visible_when: %w", err)
	}
	if err := checkBoolShape(c.EnabledWhen); err != nil {
		return fmt.Errorf("enabled_when: %w", err)
	}
	return nil
}

// checkBoolShape evaluates an Expr over an empty env: if it resolves to a value, that
// value must be a bool; if it errors (a dangling ref against the empty env), the shape
// is accepted (the condition reads the runtime given, absent here). A literal non-bool
// (e.g. a number condition) is rejected.
func checkBoolShape(e expr.Expr) error {
	env := expr.NewEnv(nil, expr.FixedProviders("", "", ""))
	v, err := expr.Eval(e, env)
	if err != nil {
		// Refs dangle against an empty env — that is expected; shape is fine.
		return nil
	}
	if _, ok := v.AsBool(); !ok {
		return ErrConditionNotBool
	}
	return nil
}

// EvalState computes the button state for a given situation: it evaluates
// visible_when, and — only when visible — enabled_when, over the $-rooted `given`.
// It is PURE and deterministic: same (control, given) ⇒ same State. It never panics
// (the Expr interpreter's no-panic guarantee); a dangling ref / type mismatch yields
// a typed error. A condition that resolves to a non-bool is ErrConditionNotBool.
func EvalState(c Control, given map[string]any) (State, error) {
	if c.VisibleWhen == nil || c.EnabledWhen == nil {
		return State{}, ErrMissingCondition
	}
	env := expr.NewEnv(map[string]any{"$": given}, expr.FixedProviders("", "", ""))

	visible, err := evalBool(c.VisibleWhen, env)
	if err != nil {
		return State{}, fmt.Errorf("visible_when: %w", err)
	}
	if !visible {
		// Hidden ⇒ enabled is not meaningful; report false without consulting
		// enabled_when (a hidden button can never be enabled).
		return State{Visible: false, Enabled: false}, nil
	}
	enabled, err := evalBool(c.EnabledWhen, env)
	if err != nil {
		return State{}, fmt.Errorf("enabled_when: %w", err)
	}
	return State{Visible: true, Enabled: enabled}, nil
}

// evalBool evaluates an Expr to a bool, returning a typed error if it is not boolean.
func evalBool(e expr.Expr, env expr.Env) (bool, error) {
	v, err := expr.Eval(e, env)
	if err != nil {
		return false, err
	}
	b, ok := v.AsBool()
	if !ok {
		return false, ErrConditionNotBool
	}
	return b, nil
}

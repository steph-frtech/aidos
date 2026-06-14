package operation

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/expr"
)

// State is the $-rooted data bag threaded through an operation's steps: $.input
// (the command payload), $.auth (the caller identity), and the named slots a read
// or a create mutate binds (e.g. $.cart, $.order). It is the "state" of the N2
// `state → command → events` truth form.
//
// State is mutable WITHIN one Interpret walk (read/mutate bind new slots) but each
// Interpret call starts from a freshly-built State, so the function stays pure: the
// same (op, command, deps) always yields the same (events, result). No clock, no
// RNG, no I/O lives here.
type State struct {
	root map[string]any
}

// NewState builds a State from the command input ($.input) and the caller auth
// ($.auth). These are the two slots present before any step runs; read/mutate add
// named slots as the pipeline walks.
func NewState(input, auth map[string]any) *State {
	return &State{root: map[string]any{
		"input": input,
		"auth":  auth,
	}}
}

// Root returns the underlying $-rooted map (for the resolver / diagnostics). It is
// the value the "$" prefix of a selector points at.
func (s *State) Root() map[string]any { return s.root }

// Bind sets the value at a $-rooted slot path (e.g. "$.cart", "$.order"). A read
// binds the loaded entity; a create mutate binds its result. Bind walks/creates
// intermediate objects so a nested slot (rare) still resolves. A non-$-rooted path
// is rejected (returned error), keeping the selector grammar closed.
func (s *State) Bind(path string, value any) error {
	if !strings.HasPrefix(path, "$") {
		return fmt.Errorf("operation: slot must be $-rooted: %q", path)
	}
	segs := strings.Split(path, ".")[1:]
	if len(segs) == 0 {
		return fmt.Errorf("operation: cannot bind the root %q", path)
	}
	cur := s.root
	for _, seg := range segs[:len(segs)-1] {
		next, ok := cur[seg].(map[string]any)
		if !ok {
			next = map[string]any{}
			cur[seg] = next
		}
		cur = next
	}
	cur[segs[len(segs)-1]] = value
	return nil
}

// Resolve walks a $-rooted dotted path through the state, with the SAME semantics
// as expr/policy resolveSelector: a ".length" segment yields a collection/string
// length; a missing segment is a "not found" error. Reuse, don't reinvent
// (ADR 0007) — the operation selector is the Expr ref path, not a new engine.
func (s *State) Resolve(path string) (any, error) {
	if !strings.HasPrefix(path, "$") {
		return nil, fmt.Errorf("operation: selector must be $-rooted: %q", path)
	}
	segs := strings.Split(path, ".")
	var cur any = s.root
	for _, seg := range segs[1:] {
		if seg == "length" {
			switch t := cur.(type) {
			case []any:
				return float64(len(t)), nil
			case string:
				return float64(len(t)), nil
			default:
				return nil, fmt.Errorf("operation: .length on non-collection %q", path)
			}
		}
		m, ok := cur.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("operation: %q not an object at %q", path, seg)
		}
		next, ok := m[seg]
		if !ok {
			return nil, fmt.Errorf("operation: %q absent at %q", path, seg)
		}
		cur = next
	}
	return cur, nil
}

// resolveValue resolves one data/where value to the concrete value the Mutator/Reader
// seam receives. Three cases, in order:
//
//   - an Expr AST (expr.Expr) — e.g. the §93 anchor's `total: sum($.cart.items,
//     "price")` — is EVALUATED through the REUSED kernel Expr interpreter
//     (expr.Eval) against the current State (the wall / determinism-first §6/§8: the
//     sum is computed by the existing Expr engine, never an ad-hoc fold in a seam).
//     The evaluated Value is unwrapped to its raw Go value so the row stays a plain
//     map of scalars/lists the Mutator can encode.
//   - a $-rooted selector string ($.auth.user.id, $.cart.items) resolves against the
//     State, exactly as before.
//   - any other value (a literal "pending", a number) is returned verbatim.
//
// A selector or an Expr that fails to resolve yields its error so the step can
// surface it (totality is the evaluator's choice, not the resolver's).
func (s *State) resolveValue(v any) (any, error) {
	if e, ok := v.(expr.Expr); ok {
		val, err := expr.Eval(e, s.exprEnv())
		if err != nil {
			return nil, err
		}
		return val.Raw(), nil
	}
	str, ok := v.(string)
	if ok && strings.HasPrefix(str, "$") {
		return s.Resolve(str)
	}
	return v, nil
}

// exprEnv adapts the operation State into an Expr Env: the $-rooted State root
// becomes the Expr's "$" root, so an Expr ref ($.cart.items) resolves against the
// SAME data the operation selectors do (one $-rooted data tree across the DSLs,
// ADR 0007). Providers are fixed/empty — a Data Expr is pure (sum over resolved
// items); the impure functions (now/uuid/randomToken) are not used in a mutate row,
// and if one ever were it would resolve to the empty fixed value, never a real
// clock/RNG (determinism-first §6).
func (s *State) exprEnv() expr.Env {
	return expr.NewEnv(map[string]any{"$": s.root}, expr.FixedProviders("", "", ""))
}

// resolveMap resolves every value of a data/where map (selectors → state values,
// literals as-is), returning a new map. Keys are preserved. It is how the
// interpreter turns the AST's `{ userId: $.auth.user.id, total: sum(...) }` into the
// concrete row the Mutator seam receives.
func (s *State) resolveMap(m map[string]any) (map[string]any, error) {
	if m == nil {
		return nil, nil
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		rv, err := s.resolveValue(v)
		if err != nil {
			return nil, err
		}
		out[k] = rv
	}
	return out, nil
}

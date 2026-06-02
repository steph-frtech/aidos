package policy

import (
	"fmt"
	"regexp"
	"strings"
)

// Ctx is the authorization context: the $-rooted data tree a selector resolves
// against (e.g. $.auth.user, $.cart.items.length). It is constructed from a JSON
// object whose top key is "$" — the same root convention as the Expr Env.
type Ctx struct {
	root any // the value under "$"
}

// NewCtx builds a Ctx from a decoded data map (expecting a "$" key). A nil/absent
// "$" yields an empty root: selectors then dangle to "not found" (never a panic),
// so Eval stays total.
func NewCtx(data map[string]any) Ctx {
	var root any
	if data != nil {
		root = data["$"]
	}
	return Ctx{root: root}
}

// Eval evaluates a Policy against a Ctx, returning a total Decision (ALLOW/DENY).
// It applies the §93 combination law via the policy's effect gate:
//
//   - effect ALLOW: the policy authorizes (ALLOW) iff its rule HOLDS, else DENY
//     ("tout ALLOW passe" — an ALLOW gate passes only when its rule is satisfied);
//   - effect DENY:  the policy blocks (DENY) iff its rule HOLDS, else ALLOW
//     ("n'importe quel DENY bloque" — a DENY gate blocks when its rule fires, and
//     abstains otherwise).
//
// Eval is PURE and TOTAL: same (policy, ctx) ⇒ same Decision; a dangling selector
// or a type mismatch resolves to "the rule does not hold", never an error or a
// panic. (The error return is reserved for a structurally-malformed AST — an
// unknown rule kind — which Parse would already have rejected before the DB.)
func Eval(p Policy, ctx Ctx) (Decision, error) {
	held, err := Holds(p.Rule, ctx)
	if err != nil {
		return "", err
	}
	switch p.Effect {
	case EffectAllow:
		if held {
			return ALLOW, nil
		}
		return DENY, nil
	case EffectDeny:
		if held {
			return DENY, nil
		}
		return ALLOW, nil
	default:
		return "", fmt.Errorf("policy: unknown effect %q", p.Effect)
	}
}

// Holds reports whether a rule tree holds (is true) under ctx. It is the recursive
// heart of the combination law:
//   - all : every child holds (∧) — empty all holds (vacuous truth);
//   - any : some child holds (∨) — empty any fails;
//   - not : the child does not hold (an involution: not(not(r)) ≡ r);
//   - eq/gt/lt : the comparison of the two resolved operands;
//   - exists : the selector resolves to a non-null value;
//   - matches : the selector resolves to a string matching the pattern.
//
// A failed selector resolution or a type mismatch makes the leaf NOT hold — Holds
// never errors on data shape (totality). The error return is reserved for a
// malformed AST node (an unknown rule kind).
func Holds(r Rule, ctx Ctx) (bool, error) {
	switch n := r.(type) {
	case AllNode:
		for _, c := range n.Children {
			ok, err := Holds(c, ctx)
			if err != nil {
				return false, err
			}
			if !ok {
				return false, nil
			}
		}
		return true, nil

	case AnyNode:
		for _, c := range n.Children {
			ok, err := Holds(c, ctx)
			if err != nil {
				return false, err
			}
			if ok {
				return true, nil
			}
		}
		return false, nil

	case NotNode:
		ok, err := Holds(n.Child, ctx)
		if err != nil {
			return false, err
		}
		return !ok, nil

	case CompareNode:
		return compare(n, ctx), nil

	case ExistsNode:
		v, err := resolveSelector(n.Sel, ctx.root)
		return err == nil && v != nil, nil

	case MatchesNode:
		v, err := resolveSelector(n.Sel, ctx.root)
		if err != nil {
			return false, nil
		}
		s, ok := v.(string)
		if !ok {
			return false, nil
		}
		re, err := regexp.Compile(n.Pattern)
		if err != nil {
			return false, nil // a bad pattern fails the predicate; never a panic
		}
		return re.MatchString(s), nil

	default:
		return false, fmt.Errorf("policy: unknown rule kind %q", r.Kind())
	}
}

// compare resolves both operands and applies the comparison. A failed resolution
// or a type mismatch yields false (the leaf does not hold) — never an error.
func compare(n CompareNode, ctx Ctx) bool {
	l, lerr := resolveOperand(n.Left, ctx)
	rt, rerr := resolveOperand(n.Right, ctx)
	if lerr != nil || rerr != nil {
		return false
	}
	switch n.Op {
	case KindEq:
		return valueEqual(l, rt)
	case KindGt, KindLt:
		lf, lok := asNumber(l)
		rf, rok := asNumber(rt)
		if !lok || !rok {
			return false
		}
		if n.Op == KindGt {
			return lf > rf
		}
		return lf < rf
	default:
		return false
	}
}

// resolveOperand resolves a selector against ctx or returns a literal as-is.
func resolveOperand(o Operand, ctx Ctx) (any, error) {
	switch t := o.(type) {
	case SelectorOperand:
		return resolveSelector(t.Path, ctx.root)
	case LiteralOperand:
		return t.Value, nil
	default:
		return nil, fmt.Errorf("policy: unknown operand")
	}
}

// resolveSelector walks a $-rooted dotted path through the ctx data, with the
// SAME semantics as expr.resolveRef: a ".length" segment yields a collection /
// string length; a missing segment is "not found". Reuse, don't reinvent
// (ADR 0007) — the policy selector is the Expr ref path, not a new engine.
func resolveSelector(path string, root any) (any, error) {
	if !strings.HasPrefix(path, "$") {
		return nil, fmt.Errorf("policy: selector must be $-rooted: %q", path)
	}
	segs := strings.Split(path, ".")
	cur := root
	for _, s := range segs[1:] {
		if s == "length" {
			switch t := cur.(type) {
			case []any:
				return float64(len(t)), nil
			case string:
				return float64(len(t)), nil
			default:
				return nil, fmt.Errorf("policy: .length on non-collection %q", path)
			}
		}
		m, ok := cur.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("policy: %q not an object at %q", path, s)
		}
		next, ok := m[s]
		if !ok {
			return nil, fmt.Errorf("policy: %q absent at %q", path, s)
		}
		cur = next
	}
	return cur, nil
}

// asNumber coerces a resolved value to a float64 (JSON numbers decode as float64).
func asNumber(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	default:
		return 0, false
	}
}

// valueEqual compares two resolved values for equality. Numbers compare
// numerically (so an int literal equals a float64-decoded number); strings,
// bools and nil compare directly.
func valueEqual(a, b any) bool {
	if af, aok := asNumber(a); aok {
		if bf, bok := asNumber(b); bok {
			return af == bf
		}
		return false
	}
	return a == b
}

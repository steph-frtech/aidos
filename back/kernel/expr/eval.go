package expr

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Eval errors — all TYPED, never a panic (the no-panic invariant).
var (
	ErrRefNotFound  = errors.New("expr: ref does not resolve in Env")
	ErrTypeMismatch = errors.New("expr: type mismatch")
)

// Providers supply the values for the impure catalogue functions (now, uuid,
// randomToken) WITHOUT touching a real clock or RNG. Eval calls them, so
// evaluation stays a pure function of (ast, env, providers): same inputs ⇒ same
// Value (CLAUDE.md §6 determinism-first). The runtime injects real providers; the
// mirrors inject fixed ones.
type Providers struct {
	Now         func() string
	UUID        func() string
	RandomToken func() string
}

// FixedProviders returns Providers that always return the given constants — the
// deterministic injection used by the fixture / property mirrors.
func FixedProviders(now, uuid, token string) Providers {
	return Providers{
		Now:         func() string { return now },
		UUID:        func() string { return uuid },
		RandomToken: func() string { return token },
	}
}

// Env is the evaluation environment: the $-rooted data tree a ref resolves
// against, plus the injected providers. It is constructed from a JSON object
// whose top key is "$" (KRD §24.5 roots: $.input, $.auth.user, $.cart…).
type Env struct {
	root      any // the value under "$"
	providers Providers
}

// NewEnv builds an Env from a decoded data map (expecting a "$" key) and
// providers. A nil/absent "$" yields an empty root (refs then dangle to a typed
// error, never a panic).
func NewEnv(data map[string]any, p Providers) Env {
	var root any
	if data != nil {
		root = data["$"]
	}
	return Env{root: root, providers: p}
}

// ParseEnv decodes an Env from JSON ($-rooted), with no-op default providers
// (sufficient for the pure fixture cases that never call now/uuid/randomToken).
// Numbers decode as float64 so comparisons are uniform.
func ParseEnv(b []byte) (Env, error) {
	if len(bytes.TrimSpace(b)) == 0 {
		return NewEnv(nil, FixedProviders("", "", "")), nil
	}
	d := json.NewDecoder(bytes.NewReader(b))
	var m map[string]any
	if err := d.Decode(&m); err != nil {
		return Env{}, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	return NewEnv(m, FixedProviders("", "", "")), nil
}

// Value is the typed result of an evaluation. It wraps one of: string, float64,
// bool, nil, []Value (arr), map[string]Value (obj). Accessors report the type
// safely (no panic on mismatch).
type Value struct{ v any }

func (x Value) AsBool() (bool, bool)      { b, ok := x.v.(bool); return b, ok }
func (x Value) AsString() (string, bool)  { s, ok := x.v.(string); return s, ok }
func (x Value) AsNumber() (float64, bool) { f, ok := x.v.(float64); return f, ok }
func (x Value) Raw() any                  { return x.v }

// ValueEqual reports deep equality of two Values (used by the determinism
// mirror). Delegates to a canonical JSON encoding so nested obj/arr compare
// structurally and order-independently for objects.
func ValueEqual(a, b Value) bool {
	ja, ea := json.Marshal(normalize(a.v))
	jb, eb := json.Marshal(normalize(b.v))
	if ea != nil || eb != nil {
		return false
	}
	return bytes.Equal(ja, jb)
}

// normalize unwraps nested Values for comparison/encoding.
func normalize(v any) any {
	switch t := v.(type) {
	case []Value:
		out := make([]any, len(t))
		for i, e := range t {
			out[i] = normalize(e.v)
		}
		return out
	case map[string]Value:
		out := make(map[string]any, len(t))
		for k, e := range t {
			out[k] = normalize(e.v)
		}
		return out
	default:
		return v
	}
}

// Eval evaluates an Expr against an Env, returning a typed Value. It is PURE: no
// I/O, no real clock/RNG (now/uuid/randomToken resolve through env.providers). It
// never panics — a dangling ref or a type mismatch yields a typed error.
func Eval(e Expr, env Env) (v Value, err error) {
	// Defense in depth: even a future bug must surface as an error, never a crash
	// (the no-panic invariant the property mirror pins).
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%w: recovered %v", ErrTypeMismatch, r)
		}
	}()
	return evalNode(e, env)
}

func evalNode(e Expr, env Env) (Value, error) {
	switch n := e.(type) {
	case LitNode:
		return Value{v: n.Value}, nil

	case RefNode:
		got, err := resolveRef(n.Path, env.root)
		if err != nil {
			return Value{}, err
		}
		return Value{v: got}, nil

	case CallNode:
		return evalCall(n, env)

	case ObjNode:
		out := make(map[string]Value, len(n.Fields))
		for k, fe := range n.Fields {
			fv, err := evalNode(fe, env)
			if err != nil {
				return Value{}, err
			}
			out[k] = fv
		}
		return Value{v: out}, nil

	case ArrNode:
		out := make([]Value, 0, len(n.Items))
		for _, ie := range n.Items {
			iv, err := evalNode(ie, env)
			if err != nil {
				return Value{}, err
			}
			out = append(out, iv)
		}
		return Value{v: out}, nil
	}
	return Value{}, ErrBadNode
}

// resolveRef walks a $-rooted dotted path through the Env data. A ".length"
// segment on an array or string yields its length (the §24.1 example
// $.cart.items.length). A missing segment is a typed ErrRefNotFound.
func resolveRef(path string, root any) (any, error) {
	segs := strings.Split(path, ".")
	// segs[0] == "$" (Parse guarantees the prefix).
	cur := root
	for _, s := range segs[1:] {
		if s == "length" {
			switch t := cur.(type) {
			case []any:
				return float64(len(t)), nil
			case []Value:
				return float64(len(t)), nil
			case string:
				return float64(len(t)), nil
			default:
				return nil, fmt.Errorf("%w: .length on non-collection %q", ErrTypeMismatch, path)
			}
		}
		m, ok := cur.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%w: %q (segment %q not an object)", ErrRefNotFound, path, s)
		}
		next, ok := m[s]
		if !ok {
			return nil, fmt.Errorf("%w: %q (segment %q absent)", ErrRefNotFound, path, s)
		}
		cur = next
	}
	return cur, nil
}

func evalCall(n CallNode, env Env) (Value, error) {
	// Nullary impure functions resolve through injected providers (determinism).
	switch n.Fn {
	case "now":
		return Value{v: env.providers.Now()}, nil
	case "uuid":
		return Value{v: env.providers.UUID()}, nil
	case "randomToken":
		return Value{v: env.providers.RandomToken()}, nil
	}

	// Evaluate args left-to-right.
	args := make([]Value, len(n.Args))
	for i, a := range n.Args {
		av, err := evalNode(a, env)
		if err != nil {
			return Value{}, err
		}
		args[i] = av
	}

	switch n.Fn {
	case "lowercase":
		s, ok := args[0].AsString()
		if !ok {
			return Value{}, fmt.Errorf("%w: lowercase expects string", ErrTypeMismatch)
		}
		return Value{v: strings.ToLower(s)}, nil

	case "concat":
		var sb strings.Builder
		for _, a := range args {
			s, ok := a.AsString()
			if !ok {
				return Value{}, fmt.Errorf("%w: concat expects strings", ErrTypeMismatch)
			}
			sb.WriteString(s)
		}
		return Value{v: sb.String()}, nil

	case "length":
		switch t := args[0].v.(type) {
		case []Value:
			return Value{v: float64(len(t))}, nil
		case []any:
			return Value{v: float64(len(t))}, nil
		case string:
			return Value{v: float64(len(t))}, nil
		default:
			return Value{}, fmt.Errorf("%w: length on non-collection", ErrTypeMismatch)
		}

	case ">":
		l, lok := args[0].AsNumber()
		r, rok := args[1].AsNumber()
		if !lok || !rok {
			return Value{}, fmt.Errorf("%w: > expects numbers", ErrTypeMismatch)
		}
		return Value{v: l > r}, nil

	case "&&":
		l, lok := args[0].AsBool()
		r, rok := args[1].AsBool()
		if !lok || !rok {
			return Value{}, fmt.Errorf("%w: && expects booleans", ErrTypeMismatch)
		}
		return Value{v: l && r}, nil

	case "!":
		b, ok := args[0].AsBool()
		if !ok {
			return Value{}, fmt.Errorf("%w: ! expects boolean", ErrTypeMismatch)
		}
		return Value{v: !b}, nil
	}
	// Parse already rejected non-catalogue names; a name here without a case is a
	// catalogue/impl drift — surface it as a typed error, never a panic.
	return Value{}, fmt.Errorf("%w: %q has no evaluator", ErrUnknownFunc, n.Fn)
}

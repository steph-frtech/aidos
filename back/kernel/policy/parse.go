package policy

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Parse / validation errors. Each is TYPED (never a panic) so a caller — and the
// migration round-trip mirror — can distinguish a rejection from a crash.
var (
	ErrInvalidJSON = errors.New("policy: body is not valid JSON")
	ErrUnknownKind = errors.New("policy: unknown rule kind (closed grammar)")
	ErrBadScope    = errors.New("policy: unknown scope (closed set)")
	ErrBadEffect   = errors.New("policy: unknown effect")
	ErrBadOperand  = errors.New("policy: malformed operand")
	ErrBadSelector = errors.New("policy: selector must be $-rooted")
)

// policyWire is the wire shape of a kernel.policy body.
type policyWire struct {
	Kind   string          `json:"kind"`
	Name   string          `json:"name"`
	Scope  string          `json:"scope"`
	Target string          `json:"target"`
	Effect string          `json:"effect"`
	Rule   json.RawMessage `json:"rule"`
}

type ruleWire struct {
	Kind     string            `json:"kind"`
	Children []json.RawMessage `json:"children"`
	Child    json.RawMessage   `json:"child"`
	Op       string            `json:"op"`
	Left     json.RawMessage   `json:"left"`
	Right    json.RawMessage   `json:"right"`
	Sel      string            `json:"sel"`
	Pattern  string            `json:"pattern"`
}

type operandWire struct {
	Kind  string          `json:"kind"`
	Path  string          `json:"path"`
	Value json.RawMessage `json:"value"`
}

// Parse decodes + validates a Policy from its canonical JSONB. It rejects unknown
// scopes, effects and rule kinds, and malformed selectors. It never evaluates and
// never panics — a bad body yields a typed error. The returned Policy
// re-canonicalizes to the same bytes (the round-trip invariant the DB mirror
// pins).
func Parse(b []byte) (Policy, error) {
	var w policyWire
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	if err := d.Decode(&w); err != nil {
		return Policy{}, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	if !IsScope(w.Scope) {
		return Policy{}, fmt.Errorf("%w: %q", ErrBadScope, w.Scope)
	}
	if w.Effect != string(EffectAllow) && w.Effect != string(EffectDeny) {
		return Policy{}, fmt.Errorf("%w: %q", ErrBadEffect, w.Effect)
	}
	rule, err := parseRule(w.Rule)
	if err != nil {
		return Policy{}, err
	}
	return New(w.Name, Scope(w.Scope), w.Target, rule, Effect(w.Effect)), nil
}

func parseRule(b []byte) (Rule, error) {
	var w ruleWire
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	if err := d.Decode(&w); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	switch w.Kind {
	case "all", "any":
		children := make([]Rule, 0, len(w.Children))
		for _, cb := range w.Children {
			c, err := parseRule(cb)
			if err != nil {
				return nil, err
			}
			children = append(children, c)
		}
		if w.Kind == "all" {
			return AllNode{Children: children}, nil
		}
		return AnyNode{Children: children}, nil
	case "not":
		c, err := parseRule(w.Child)
		if err != nil {
			return nil, err
		}
		return NotNode{Child: c}, nil
	case "compare":
		if !IsRuleKind(w.Op) || (w.Op != string(KindEq) && w.Op != string(KindGt) && w.Op != string(KindLt)) {
			return nil, fmt.Errorf("%w: compare op %q", ErrUnknownKind, w.Op)
		}
		l, err := parseOperand(w.Left)
		if err != nil {
			return nil, err
		}
		r, err := parseOperand(w.Right)
		if err != nil {
			return nil, err
		}
		return CompareNode{Op: RuleKind(w.Op), Left: l, Right: r}, nil
	case "exists":
		if !strings.HasPrefix(w.Sel, "$") {
			return nil, fmt.Errorf("%w: %q", ErrBadSelector, w.Sel)
		}
		return ExistsNode{Sel: w.Sel}, nil
	case "matches":
		if !strings.HasPrefix(w.Sel, "$") {
			return nil, fmt.Errorf("%w: %q", ErrBadSelector, w.Sel)
		}
		return MatchesNode{Sel: w.Sel, Pattern: w.Pattern}, nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrUnknownKind, w.Kind)
	}
}

func parseOperand(b []byte) (Operand, error) {
	var w operandWire
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	if err := d.Decode(&w); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	switch w.Kind {
	case string(OperandSelector):
		if !strings.HasPrefix(w.Path, "$") {
			return nil, fmt.Errorf("%w: %q", ErrBadSelector, w.Path)
		}
		return SelectorOperand{Path: w.Path}, nil
	case string(OperandLiteral):
		v, err := decodeScalar(w.Value)
		if err != nil {
			return nil, err
		}
		return LiteralOperand{Value: v}, nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrBadOperand, w.Kind)
	}
}

// decodeScalar reads a literal into a normalized Go scalar: string, float64 (any
// JSON number), bool, or nil — the same normalization expr uses, so a parsed
// literal re-canonicalizes identically.
func decodeScalar(b json.RawMessage) (any, error) {
	if len(b) == 0 {
		return nil, nil
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	var v any
	if err := d.Decode(&v); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	switch t := v.(type) {
	case json.Number:
		f, err := t.Float64()
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
		}
		return f, nil
	case string, bool, nil:
		return v, nil
	default:
		return nil, fmt.Errorf("%w: literal must be a scalar, got %T", ErrBadOperand, v)
	}
}

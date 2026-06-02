package action

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/expr"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// ErrParse is returned when an action body JSONB cannot be decoded into an Action.
var ErrParse = fmt.Errorf("action: malformed action-spec body")

// wireOn is the JSON shape of the `on` trigger event.
type wireOn struct {
	Kind    string `json:"kind"`    // "click"
	Control string `json:"control"` // the control ref the action fires on
}

// wireEffect is the JSON shape of one on_success / on_error effect: a verbatim verb
// (navigate / toast / toast.error) and its argument Expr (canonical AST JSONB).
type wireEffect struct {
	Verb string          `json:"verb"`
	Arg  json.RawMessage `json:"arg"`
}

// wireAction is the JSON body shape stored in kernel.action. The with{…} args and the
// effect args are stored as their Expr canonical JSONB (nested ASTs), so the whole
// body reuses the SAME content-hash scheme as records / expr / policy / control (one
// address space, never a forked hashing path). `invoke` is the version-pinned
// action→operation ref held INSIDE the body (the `binds` link, KRD §28), not a table.
type wireAction struct {
	Kind      string                     `json:"kind"` // always "action"
	Name      string                     `json:"name"`
	On        wireOn                     `json:"on"`
	Invoke    string                     `json:"invoke"`
	With      map[string]json.RawMessage `json:"with"`
	OnSuccess []wireEffect               `json:"on_success"`
	OnError   []wireEffect               `json:"on_error"`
}

// Canonicalize returns the deterministic JSONB body of an Action: object keys sorted
// lexicographically (recursively), every Expr as its canonical AST. It is the form the
// action is hashed over (content-address), so records.Hash(Canonicalize(a)) is the
// kernel.action id/version. Reuses expr.Canonicalize for nested ASTs and
// records.Canonicalize for the envelope — never a re-invented hashing path.
func Canonicalize(a Action) ([]byte, error) {
	with := make(map[string]json.RawMessage, len(a.With))
	for k, e := range a.With {
		b, err := expr.Canonicalize(e)
		if err != nil {
			return nil, fmt.Errorf("action: with[%q]: %w", k, err)
		}
		with[k] = b
	}
	success, err := canonEffects(a.OnSuccess)
	if err != nil {
		return nil, fmt.Errorf("action: on_success: %w", err)
	}
	failure, err := canonEffects(a.OnError)
	if err != nil {
		return nil, fmt.Errorf("action: on_error: %w", err)
	}
	w := wireAction{
		Kind:      "action",
		Name:      a.Name,
		On:        wireOn{Kind: string(a.On.Kind), Control: a.On.Control},
		Invoke:    a.Invoke,
		With:      with,
		OnSuccess: success,
		OnError:   failure,
	}
	raw, err := json.Marshal(w)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParse, err)
	}
	return records.Canonicalize(raw)
}

func canonEffects(es []Effect) ([]wireEffect, error) {
	out := make([]wireEffect, len(es))
	for i, e := range es {
		b, err := expr.Canonicalize(e.Arg)
		if err != nil {
			return nil, fmt.Errorf("effect[%d] %q: %w", i, e.Verb, err)
		}
		out[i] = wireEffect{Verb: e.Verb, Arg: b}
	}
	return out, nil
}

// Parse decodes an Action from its canonical JSONB body, reusing expr.Parse for every
// nested arg AST. The returned Action re-canonicalizes to the same bytes (the
// round-trip invariant the migration mirror pins).
func Parse(body []byte) (Action, error) {
	var w wireAction
	if err := json.Unmarshal(body, &w); err != nil {
		return Action{}, fmt.Errorf("%w: %v", ErrParse, err)
	}
	if w.Kind != "action" {
		return Action{}, fmt.Errorf("%w: kind=%q want action", ErrParse, w.Kind)
	}
	with := make(map[string]expr.Expr, len(w.With))
	for k, raw := range w.With {
		e, err := expr.Parse(raw)
		if err != nil {
			return Action{}, fmt.Errorf("action: with[%q]: %w", k, err)
		}
		with[k] = e
	}
	success, err := parseEffects(w.OnSuccess)
	if err != nil {
		return Action{}, fmt.Errorf("action: on_success: %w", err)
	}
	failure, err := parseEffects(w.OnError)
	if err != nil {
		return Action{}, fmt.Errorf("action: on_error: %w", err)
	}
	return Action{
		Name:      w.Name,
		On:        On{Kind: EventKind(w.On.Kind), Control: w.On.Control},
		Invoke:    w.Invoke,
		With:      with,
		OnSuccess: success,
		OnError:   failure,
	}, nil
}

func parseEffects(ws []wireEffect) ([]Effect, error) {
	out := make([]Effect, len(ws))
	for i, w := range ws {
		e, err := expr.Parse(w.Arg)
		if err != nil {
			return nil, fmt.Errorf("effect[%d] %q: %w", i, w.Verb, err)
		}
		out[i] = Effect{Verb: w.Verb, Arg: e}
	}
	return out, nil
}

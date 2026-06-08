package dsleditor

// parse_control_action.go — the TYPED CONTROL + ACTION editor parsers (S77, reusing the
// S11 control/action contracts VERBATIM). The verticale: a control's typed body
// ({view,label,visible_when,enabled_when,triggers}, the two conditions Expr ASTs) and an
// action's typed body (on/invoke/with/on_success/on_error). We do NOT re-implement the
// control/action parsers nor the Expr DSL (ADR 0007) — we call the FROZEN control.Parse /
// action.Parse and VALIDATE against the refs the doc carries (an orphan trigger/bind is a
// monster the completeness law forbids). PURE + TOTAL.

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
)

// parseControlDoc decodes a typed control editor body into a control.Control via the
// FROZEN control.Parse, then VALIDATES it against the doc's KnownActions (so `triggers`
// resolves — no orphan trigger). The name is spliced from the doc. PURE + TOTAL.
func parseControlDoc(d DslDoc) (Parsed, error) {
	body, err := spliceName(d.Body, d.Name)
	if err != nil {
		return Parsed{}, fmt.Errorf("%w: %v", ErrBadBody, err)
	}
	c, err := control.Parse(body)
	if err != nil {
		return Parsed{}, fmt.Errorf("%w: %v", ErrBadBody, err)
	}
	known := control.KnownActions(d.KnownActions...)
	if verr := control.Validate(c, known); verr != nil {
		return Parsed{}, fmt.Errorf("%w: %v", ErrBadBody, verr)
	}
	canon, err := control.Canonicalize(c)
	if err != nil {
		return Parsed{}, fmt.Errorf("%w: canonicalise: %v", ErrBadBody, err)
	}
	return Parsed{Kind: KindControl, Name: d.Name, Canonical: canon, Control: &c}, nil
}

// parseActionDoc decodes a typed action editor body into an action.Action via the FROZEN
// action.Parse, then VALIDATES it against the doc's KnownControls + KnownOperations (so
// `on` and `invoke` resolve — no orphan bind). The name is spliced from the doc.
// PURE + TOTAL.
func parseActionDoc(d DslDoc) (Parsed, error) {
	body, err := spliceName(d.Body, d.Name)
	if err != nil {
		return Parsed{}, fmt.Errorf("%w: %v", ErrBadBody, err)
	}
	a, err := action.Parse(body)
	if err != nil {
		return Parsed{}, fmt.Errorf("%w: %v", ErrBadBody, err)
	}
	knownControls := action.KnownControls(d.KnownControls...)
	knownOperations := action.KnownOperations(d.KnownOperations...)
	if verr := action.Validate(a, knownControls, knownOperations); verr != nil {
		return Parsed{}, fmt.Errorf("%w: %v", ErrBadBody, verr)
	}
	canon, err := action.Canonicalize(a)
	if err != nil {
		return Parsed{}, fmt.Errorf("%w: canonicalise: %v", ErrBadBody, err)
	}
	return Parsed{Kind: KindAction, Name: d.Name, Canonical: canon, Action: &a}, nil
}

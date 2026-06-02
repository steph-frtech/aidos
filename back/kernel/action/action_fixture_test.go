package action_test

// Fixture mirror (action: event → invoke/effect).
// reflects=kernel.action/checkout-submit · test_kind=fixture · cert_language=fixture ·
// liveness=live · authority=above.
//
// Materialized source: tests/kernel/checkout-submit_action.fixture.md (the
// human-readable fixture, conceptually stored in the `mirrors` schema; persisted to
// Postgres at S06 — bootstrap exception). It is the LIEN PORTEUR: this test loads the
// bind row; if it disappears the test breaks (no silent rot into a monster).
//
// The action is the KRD §24.2/§94 checkout-submit.action, VERBATIM — the agent invents
// no on, invoke, effect verb or operation ref. Plan resolves the bind WITHOUT executing
// it. The package is PURE — no DB, no HTTP, no clock, no RNG.
//
// DONE CRITERION (the S11 red): the action fixture is green only when
// Plan(action, click("checkout-button")) resolves to invoke operation "createOrder" —
// i.e. THE ACTION BINDS THE OPERATION.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/action"
)

func TestCheckoutSubmitBindsOperation(t *testing.T) {
	a := action.CheckoutSubmit()

	// The action is well-formed: its `on` control ref and `binds` operation ref both
	// resolve in the known sets.
	if err := action.Validate(a,
		action.KnownControls("checkout-button"),
		action.KnownOperations("createOrder"),
	); err != nil {
		t.Fatalf("Validate(checkout-submit): unexpected error %v", err)
	}

	// Plan resolves the click event to the bound operation — without executing it.
	plan, err := action.Plan(a, action.Click("checkout-button"))
	if err != nil {
		t.Fatalf("Plan: unexpected error %v", err)
	}

	// THE BIND: click("checkout-button") → invoke operation "createOrder".
	if plan.Invoke != "createOrder" {
		t.Fatalf("plan.Invoke = %q, want %q (the action must BIND the operation)", plan.Invoke, "createOrder")
	}

	// The with{…} args carry the two Expr refs $.cart and $.auth.user, by name.
	if _, ok := plan.Args["cart"]; !ok {
		t.Fatalf("plan.Args missing %q; got keys %v", "cart", argKeys(plan.Args))
	}
	if _, ok := plan.Args["user"]; !ok {
		t.Fatalf("plan.Args missing %q; got keys %v", "user", argKeys(plan.Args))
	}

	// on_success effects: [navigate(...), toast(...)], ordered, verbatim verbs.
	wantSuccess := []string{"navigate", "toast"}
	if len(plan.OnSuccess) != len(wantSuccess) {
		t.Fatalf("on_success verbs = %v, want %v", verbNames(plan.OnSuccess), wantSuccess)
	}
	for i, v := range wantSuccess {
		if plan.OnSuccess[i].Verb != v {
			t.Fatalf("on_success[%d].Verb = %q, want %q", i, plan.OnSuccess[i].Verb, v)
		}
	}

	// on_error effects: [toast.error(...)], verbatim verb.
	if len(plan.OnError) != 1 || plan.OnError[0].Verb != "toast.error" {
		t.Fatalf("on_error verbs = %v, want [toast.error]", verbNames(plan.OnError))
	}
}

// TestCheckoutSubmitOnIsClickOfControl proves the `on` event binds the control by name.
func TestCheckoutSubmitOnControl(t *testing.T) {
	a := action.CheckoutSubmit()
	if a.On.Kind != "click" || a.On.Control != "checkout-button" {
		t.Fatalf("on = %+v, want click(checkout-button)", a.On)
	}
}

// TestPlanRejectsForeignEvent — Plan only fires for the control the action is `on`;
// a click on a different control does not resolve to a bind.
func TestPlanRejectsForeignEvent(t *testing.T) {
	a := action.CheckoutSubmit()
	_, err := action.Plan(a, action.Click("some-other-button"))
	if err == nil {
		t.Fatalf("Plan resolved a foreign event; want an error (the action is on checkout-button)")
	}
}

func argKeys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func verbNames(es []action.Effect) []string {
	out := make([]string, len(es))
	for i, e := range es {
		out[i] = e.Verb
	}
	return out
}

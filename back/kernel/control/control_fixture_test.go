package control_test

// Fixture mirror (control: state → button.visible/enabled).
// reflects=kernel.control/checkout-button · test_kind=fixture · cert_language=fixture ·
// liveness=live · authority=above.
//
// Materialized source: tests/kernel/checkout-button_control.fixture.md (the
// human-readable fixture, conceptually stored in the `mirrors` schema; persisted to
// Postgres at S06 — bootstrap exception). It is the LIEN PORTEUR: this test loads the
// three given rows; if a row disappears the test breaks (no silent rot into a monster).
//
// The control is the KRD §24.1/§94 checkout-button.control, VERBATIM — the agent
// invents no view, label, condition or trigger. visible_when / enabled_when are Expr
// DSL ASTs evaluated by the FROZEN back/kernel/expr interpreter (reused, never
// re-implemented). The package is PURE — no DB, no HTTP, no clock, no RNG.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/control"
)

// row is one state-fixture row: a given situation and the expected button state.
type row struct {
	name        string
	given       map[string]any // the $-rooted situation ($.cart, $.form, $.submitting)
	wantVisible bool
	wantEnabled bool
}

// checkoutRows are the three KRD §35 fixture rows, verbatim.
func checkoutRows() []row {
	return []row{
		{
			name:        "empty-cart-hides",
			given:       map[string]any{"cart": map[string]any{"items": []any{}}},
			wantVisible: false,
			wantEnabled: false, // hidden ⇒ enabled not meaningful, reported false
		},
		{
			name: "filled-cart-invalid-form-disabled",
			given: map[string]any{
				"cart":       map[string]any{"items": []any{map[string]any{"id": "x"}}},
				"form":       map[string]any{"valid": false},
				"submitting": false,
			},
			wantVisible: true,
			wantEnabled: false,
		},
		{
			name: "filled-cart-valid-form-enabled",
			given: map[string]any{
				"cart":       map[string]any{"items": []any{map[string]any{"id": "x"}}},
				"form":       map[string]any{"valid": true},
				"submitting": false,
			},
			wantVisible: true,
			wantEnabled: true,
		},
	}
}

func TestCheckoutButtonStateFixture(t *testing.T) {
	c := control.CheckoutButton()

	// The control is well-formed and its triggers resolves to the known action ref.
	if err := control.Validate(c, control.KnownActions("checkout-submit")); err != nil {
		t.Fatalf("Validate(checkout-button): unexpected error %v", err)
	}

	for _, r := range checkoutRows() {
		t.Run(r.name, func(t *testing.T) {
			st, err := control.EvalState(c, r.given)
			if err != nil {
				t.Fatalf("EvalState: unexpected error %v", err)
			}
			if st.Visible != r.wantVisible {
				t.Fatalf("visible = %v, want %v (given %v)", st.Visible, r.wantVisible, r.given)
			}
			if st.Enabled != r.wantEnabled {
				t.Fatalf("enabled = %v, want %v (given %v)", st.Enabled, r.wantEnabled, r.given)
			}
		})
	}
}

// TestCheckoutButtonTriggersResolved proves the triggers link points at the action.
func TestCheckoutButtonTriggers(t *testing.T) {
	c := control.CheckoutButton()
	if c.Triggers != "checkout-submit" {
		t.Fatalf("triggers = %q, want %q", c.Triggers, "checkout-submit")
	}
}

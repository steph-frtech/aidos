package control

import "github.com/steph-frtech/aidos/back/kernel/expr"

// CheckoutButton is the KRD §24.1/§94 anchor control-spec, VERBATIM — the agent
// invents no view, label, condition or trigger:
//
//	control "checkout-button" {
//	  view: "cart"
//	  label: i18n("cart.checkout")
//	  visible_when: $.cart.items.length > 0          # Expr DSL (AST typé)
//	  enabled_when: $.form.valid && !$.submitting
//	  triggers: action "checkout-submit"
//	}
//
// It is the slice's anchor: the state-fixture mirror proves EvalState yields
// visible=false for an empty cart, enabled=false for an invalid form, and
// enabled=true for a valid filled form. It is a SOURCE truth above the waterline;
// this function only RECONSTRUCTS it in Go for the mirror / the Workbench projection
// — the authoritative row is written to kernel.control by the aidos CLI through an
// approved ChangeSet, never from here (the wall, CLAUDE.md §2).
//
// The two conditions are expr.Expr ASTs over the FROZEN catalogue:
//   - visible_when  =  >( $.cart.items.length , 0 )
//   - enabled_when  =  &&( $.form.valid , !( $.submitting ) )
//
// They are REUSED from back/kernel/expr, never re-implemented.
func CheckoutButton() Control {
	return Control{
		Name:  "checkout-button",
		View:  "cart",
		Label: "i18n(cart.checkout)",
		// $.cart.items.length > 0
		VisibleWhen: expr.Call(">", expr.Ref("$.cart.items.length"), expr.Lit(0)),
		// $.form.valid && !$.submitting
		EnabledWhen: expr.Call("&&",
			expr.Ref("$.form.valid"),
			expr.Call("!", expr.Ref("$.submitting")),
		),
		Triggers: "checkout-submit",
	}
}

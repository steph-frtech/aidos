package action

import "github.com/steph-frtech/aidos/back/kernel/expr"

// CheckoutSubmit is the KRD §24.2/§94 anchor action-spec, VERBATIM (following the S11
// spec's `with` shape) — the agent invents no on, invoke, effect verb or operation ref:
//
//	action "checkout-submit" {
//	  on: click("checkout-button")
//	  invoke: operation "createOrder" with { cart: $.cart, user: $.auth.user }
//	  on_success: [ navigate("/orders/{result.id}"), toast("order.created") ]
//	  on_error:   [ toast.error($.error.message) ]
//	}
//
// It is the slice's bind: the event-fixture mirror proves Plan(checkout-submit,
// click("checkout-button")) resolves to invoke operation "createOrder" — the action
// BINDS the operation (the S11 done criterion). It is a SOURCE truth above the
// waterline; this function only RECONSTRUCTS it in Go for the mirror / the Workbench
// projection — the authoritative row is written to kernel.action by the aidos CLI
// through an approved ChangeSet, never from here (the wall, CLAUDE.md §2).
//
// The with{…} args are expr.Expr refs ($.cart, $.auth.user); the effect args are
// literal strings (the navigate path template, the toast i18n key, the error ref) —
// all REUSED from back/kernel/expr, never re-implemented. The effect verbs are taken
// VERBATIM from KRD §24.2: navigate, toast, toast.error.
func CheckoutSubmit() Action {
	return Action{
		Name:   "checkout-submit",
		On:     On{Kind: EventClick, Control: "checkout-button"},
		Invoke: "createOrder",
		With: map[string]expr.Expr{
			"cart": expr.Ref("$.cart"),
			"user": expr.Ref("$.auth.user"),
		},
		OnSuccess: []Effect{
			{Verb: "navigate", Arg: expr.Lit("/orders/{result.id}")},
			{Verb: "toast", Arg: expr.Lit("order.created")},
		},
		OnError: []Effect{
			{Verb: "toast.error", Arg: expr.Ref("$.error.message")},
		},
	}
}

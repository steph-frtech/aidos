package policy

// CanPlaceOrder is the KRD §93 anchor policy, VERBATIM — the agent invents no
// scope, field, comparator or rule beyond what the Tome pins:
//
//	policy "canPlaceOrder" {
//	  scope: OPERATION "createOrder"
//	  rule: all([
//	    exists($.auth.user),
//	    eq($.cart.userId, $.auth.user.id),
//	    gt($.cart.items.length, 0)
//	  ])
//	  effect: ALLOW    # tout ALLOW passe ; n'importe quel DENY bloque
//	}
//
// It is the slice's anchor: the property mirror proves it holds ∀ over generated
// contexts (ALLOW iff the three conditions, else DENY). It is a SOURCE truth above
// the waterline; this function only RECONSTRUCTS it in Go for the mirror / the
// Workbench projection — the authoritative row is written to kernel.policy by the
// aidos CLI through an approved ChangeSet, never from here (the wall).
func CanPlaceOrder() Policy {
	return New(
		"canPlaceOrder",
		ScopeOperation,
		"createOrder",
		All(
			Exists("$.auth.user"),
			Eq(Selector("$.cart.userId"), Selector("$.auth.user.id")),
			Gt(Selector("$.cart.items.length"), LitV(0)),
		),
		EffectAllow,
	)
}

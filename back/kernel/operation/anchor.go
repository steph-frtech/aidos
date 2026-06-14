package operation

import "github.com/steph-frtech/aidos/back/kernel/expr"

// CreateOrder is the KRD §93 anchor operation, VERBATIM — the agent invents no
// step, event, total formula or status beyond what the Tome pins:
//
//	operation "createOrder" {
//	  input: "CreateOrderInput"
//	  steps: [
//	    validate  { schema: "CreateOrderInput" },
//	    authorize { policy: "canPlaceOrder" },
//	    read      { entity: "Cart", where: { id: $.input.cartId }, as: $.cart },
//	    mutate    { entity: "Order", op: create, data: {
//	                  userId: $.auth.user.id, items: $.cart.items,
//	                  total: sum($.cart.items, "price"), status: "pending"
//	                }, as: $.order },
//	    mutate    { entity: "Cart", op: clear, where: { id: $.cart.id } },
//	    return    { ref: $.order }
//	  ]
//	  emits: [ "OrderCreated", "CartCleared" ]
//	}
//
// It is the slice's anchor: the fixture mirror proves it runs `state → command →
// events` to [OrderCreated, CartCleared] with return.status "pending" and
// return.total 15. It is a SOURCE truth above the waterline; this function only
// RECONSTRUCTS it in Go for the mirror / the Workbench projection — the
// authoritative row is written to kernel.operation by the aidos CLI through an
// approved ChangeSet, never from here (the wall, CLAUDE.md §2).
//
// SEAMS (S10 → wired). validate/authorize/read/mutate reach the world only through
// injected deps. The Expr `sum($.cart.items, "price")` is now LIVE: the anchor's
// mutate Data pins `total` as the real Expr AST sum($.cart.items,"price"), and the
// interpreter EVALUATES it through the REUSED kernel Expr engine (expr.Eval) before
// the Mutator ever runs — the seam receives an already-computed numeric `total`, so
// MemDeps and DBDeps persist the same value with no ad-hoc fold of their own (the
// wall / determinism-first §6/§8: the sum is the Expr interpreter's, never a seam's).
// The real Policy ∀ evaluation feeding authorize remains a later tooth (OQ-SIDECAR-policy).
func CreateOrder() Operation {
	return Operation{
		Name:  "createOrder",
		Input: "CreateOrderInput",
		Steps: []Step{
			ValidateStep{Schema: "CreateOrderInput"},
			AuthorizeStep{Policy: "canPlaceOrder"},
			ReadStep{
				Entity: "Cart",
				Where:  map[string]any{"id": "$.input.cartId"},
				As:     "$.cart",
			},
			MutateStep{
				Entity: "Order",
				Op:     MutateCreate,
				Data: map[string]any{
					"userId": "$.auth.user.id",
					"items":  "$.cart.items",
					"status": "pending",
					// total = sum($.cart.items, "price"), the §93 anchor verbatim — a real
					// Expr AST the interpreter evaluates via expr.Eval against the State
					// (the read bound $.cart.items). The Mutator receives the computed Σ.
					"total": expr.Call("sum", expr.Ref("$.cart.items"), expr.Lit("price")),
				},
				As: "$.order",
			},
			MutateStep{
				Entity: "Cart",
				Op:     MutateClear,
				Where:  map[string]any{"id": "$.cart.id"},
			},
			ReturnStep{Ref: "$.order"},
		},
		Emits: []string{"OrderCreated", "CartCleared"},
	}
}

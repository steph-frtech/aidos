package operation

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
// MOCKED SEAMS (S10). validate/authorize/read/mutate reach the world only through
// injected deps; the Expr `sum($.cart.items, "price")` is mocked at the Mutator
// seam (the Order create mutate computes the total from the resolved items, exactly
// as the §96 emitted handler's repo.order.create does). The real Policy ∀
// evaluation feeding authorize and the real Expr `sum` are later teeth.
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
					// total = sum($.cart.items, "price") — computed by the mutate seam
					// (Expr mocked this step); the interpreter resolves $.cart.items
					// into the data, the Mutator sums the prices.
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

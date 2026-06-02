package checkout

import "github.com/steph-frtech/aidos/back/runtime/blockreason"

// ExampleCart is the slice's worked cart — EXACTLY 2 line items, the number the
// journey mirror asserts. The items pin only a product ref and a quantity (what
// "place an order from a cart" needs); no price, no tax (out of scope, an
// OpenQuestion). The cart id is a fixed token so the slice stays content-idempotent.
func ExampleCart() Cart {
	return Cart{
		ID: "cart-demo",
		Items: []LineItem{
			{Product: "widget", Quantity: 2},
			{Product: "gadget", Quantity: 1},
		},
	}
}

// MemoryOrderStore is the in-memory OrderStore seam for the unit / property mirrors —
// it persists EXACTLY the cart's line items (N in ⇒ N out, no phantom, no dropped
// item) and returns a BlockReason for an empty cart (no order to place), never a
// panic and never an invented order. The back acceptance mirror swaps this for a
// real-Postgres store (Testcontainers); the contract is identical.
type MemoryOrderStore struct {
	next int
}

// CreateOrder persists the order with the cart's line items VERBATIM. An empty cart
// is refused with a BlockReason (a cart of zero items is not an order) — honest, not
// a panic, not an invented order.
func (s *MemoryOrderStore) CreateOrder(cart Cart) (PlacedOrder, *blockreason.BlockReason) {
	if len(cart.Items) == 0 {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return PlacedOrder{}, &br
	}
	s.next++
	items := make([]LineItem, len(cart.Items))
	copy(items, cart.Items)
	return PlacedOrder{
		ID:    cart.ID + "-order",
		Items: items,
	}, nil
}

// ExampleInput is the canonical slice Input for the worked example: the in-memory
// store, the 2-item cart, a fixed clean parent phase and a fixed applied_at stamp
// (both arguments, never the clock). Re-running RunSlice(ExampleInput()) yields the
// SAME events and the SAME content-addressed ASTs (reproducibility).
func ExampleInput() Input {
	return Input{
		Store:       &MemoryOrderStore{},
		Cart:        ExampleCart(),
		ParentPhase: "phase-clean",
		AppliedAtNs: 0,
	}
}

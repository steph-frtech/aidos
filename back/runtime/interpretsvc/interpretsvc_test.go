package interpretsvc

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// THE MIRROR (RED → GREEN). The sidecar runs the REAL createOrder anchor operation
// (operation.CreateOrder) over a seeded cart and produces the expected effect: an Order row
// is created from the cart's items and the cart is cleared, emitting [OrderCreated, CartCleared].
// It REUSES operation.Interpret (no rule re-implemented) and is DETERMINISTIC (same input+state →
// same effect). This is the clé-de-voûte proof: an operation→effect runs THROUGH the sidecar.

// newCreateOrderReg builds the one-operation cut the mirror runs: the createOrder anchor, verbatim.
func newCreateOrderReg(t *testing.T) *Registry {
	t.Helper()
	reg, err := NewRegistry([]operation.Operation{operation.CreateOrder()})
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	return reg
}

// seededCartStore plants a Cart (id "cart-1", two items) so the read verb has a row to load.
func seededCartStore() *MemStore {
	store := NewMemStore()
	store.Seed("Cart", map[string]any{
		"id": "cart-1",
		"items": []any{
			map[string]any{"product": "widget", "price": 10.0, "quantity": 2.0},
			map[string]any{"product": "gadget", "price": 5.0, "quantity": 1.0},
		},
	})
	return store
}

// orderInput / orderAuth are the command payload + caller the mirror threads in.
func orderInput() map[string]any { return map[string]any{"cartId": "cart-1"} }
func orderAuth() map[string]any {
	return map[string]any{"user": map[string]any{"id": "u-1"}}
}

func TestSidecarRunsCreateOrderAndCreatesAnOrder(t *testing.T) {
	reg := newCreateOrderReg(t)
	store := seededCartStore()
	deps := NewMemDeps(store)

	out, err := Interpret(reg, "createOrder", orderInput(), orderAuth(), deps)
	if err != nil {
		t.Fatalf("Interpret(createOrder): unexpected error: %v", err)
	}

	// The effect: exactly one Order row was created.
	orders := store.Rows("Order")
	if len(orders) != 1 {
		t.Fatalf("expected exactly 1 Order created, got %d (%v)", len(orders), orders)
	}
	order := orders[0]

	// The created order carries the cart's items VERBATIM (the State↔store pont: $.cart.items
	// resolved into the mutate data and persisted) — no phantom, no dropped item.
	items, ok := order["items"].([]any)
	if !ok {
		t.Fatalf("Order.items is not a list: %T (%v)", order["items"], order["items"])
	}
	if len(items) != 2 {
		t.Fatalf("expected the order to carry the cart's 2 items, got %d", len(items))
	}

	// The order carries the resolved status the anchor pins, and the caller's user id.
	if order["status"] != "pending" {
		t.Errorf("expected status pending, got %v", order["status"])
	}
	if order["userId"] != "u-1" {
		t.Errorf("expected userId u-1, got %v", order["userId"])
	}

	// The ordered events match the §93 anchor: [OrderCreated, CartCleared].
	wantEvents := []string{"OrderCreated", "CartCleared"}
	if len(out.Events) != len(wantEvents) {
		t.Fatalf("expected events %v, got %v", wantEvents, out.Events)
	}
	for i, e := range wantEvents {
		if out.Events[i] != e {
			t.Fatalf("event[%d]: expected %q, got %q (all: %v)", i, e, out.Events[i], out.Events)
		}
	}

	// The cart was cleared (the second mutate's effect): no Cart row remains for id cart-1.
	if carts := store.Rows("Cart"); len(carts) != 0 {
		t.Errorf("expected the cart to be cleared, %d cart row(s) remain", len(carts))
	}

	// The returned Result is the created order ($.order), echoing the operation name.
	if out.Operation != "createOrder" {
		t.Errorf("expected outcome operation createOrder, got %q", out.Operation)
	}
	if out.Result == nil {
		t.Fatalf("expected a non-nil result (the returned $.order)")
	}
	if out.Result["status"] != "pending" {
		t.Errorf("expected result.status pending, got %v", out.Result["status"])
	}
}

// A denied authorize short-circuits the pipeline: NO Order is created (the §93 "any DENY blocks"
// law at the operation boundary), proving the sidecar runs the real pipeline order, not a fake.
func TestSidecarDeniedAuthorizeCreatesNoOrder(t *testing.T) {
	reg := newCreateOrderReg(t)
	store := seededCartStore()
	deps := NewMemDeps(store)
	deps.Allow = false // DENY

	_, err := Interpret(reg, "createOrder", orderInput(), orderAuth(), deps)
	if !errors.Is(err, operation.ErrAuthorizationDenied) {
		t.Fatalf("expected ErrAuthorizationDenied, got %v", err)
	}
	if orders := store.Rows("Order"); len(orders) != 0 {
		t.Fatalf("a denied authorize must create NO order, got %d", len(orders))
	}
	if carts := store.Rows("Cart"); len(carts) != 1 {
		t.Fatalf("a denied authorize must not clear the cart, %d cart(s) remain", len(carts))
	}
}

// An unknown operation is a typed failure — the sidecar invents no operation the cut does not pin.
func TestSidecarUnknownOperationIsTypedFailure(t *testing.T) {
	reg := newCreateOrderReg(t)
	deps := NewMemDeps(NewMemStore())
	_, err := Interpret(reg, "deleteEverything", orderInput(), orderAuth(), deps)
	if !errors.Is(err, ErrUnknownOperation) {
		t.Fatalf("expected ErrUnknownOperation, got %v", err)
	}
}

// A read with no matching row is a typed failure (the read declared a target it could not load) —
// never a silent nil that a downstream mutate would then create a phantom order from.
func TestSidecarMissingCartIsTypedFailure(t *testing.T) {
	reg := newCreateOrderReg(t)
	store := NewMemStore() // no cart seeded
	deps := NewMemDeps(store)
	_, err := Interpret(reg, "createOrder", orderInput(), orderAuth(), deps)
	if err == nil {
		t.Fatalf("expected a read failure for a missing cart, got nil")
	}
	if orders := store.Rows("Order"); len(orders) != 0 {
		t.Fatalf("a failed read must create NO order, got %d", len(orders))
	}
}

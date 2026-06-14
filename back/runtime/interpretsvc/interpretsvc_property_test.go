package interpretsvc

import (
	"fmt"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"pgregory.net/rapid"
)

// THE REPRODUCIBILITY PROPERTY (determinism-first, CLAUDE.md §6/§8): the sidecar is a
// deterministic function of (operation, input, starting State). Running createOrder TWICE from
// two freshly-seeded identical stores yields the SAME events, the SAME created-order shape and
// the SAME result — no clock, no RNG enters the walk. The id seam is deterministic given the call
// order, so even the stamped id matches. This pins "même input+state → même effet".
func TestProperty_SidecarIsReproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Draw a cart id and a small set of items (the only varying input). The shape is fixed; the
		// values vary — the property must hold for ANY well-formed cart.
		cartID := rapid.StringMatching(`cart-[a-z0-9]{1,6}`).Draw(rt, "cartId")
		n := rapid.IntRange(1, 4).Draw(rt, "itemCount")
		items := make([]any, n)
		for i := 0; i < n; i++ {
			items[i] = map[string]any{
				"product":  rapid.StringMatching(`p[a-z]{1,5}`).Draw(rt, fmt.Sprintf("prod%d", i)),
				"price":    float64(rapid.IntRange(1, 100).Draw(rt, fmt.Sprintf("price%d", i))),
				"quantity": float64(rapid.IntRange(1, 9).Draw(rt, fmt.Sprintf("qty%d", i))),
			}
		}

		run := func() Outcome {
			store := NewMemStore()
			store.Seed("Cart", map[string]any{"id": cartID, "items": items})
			deps := NewMemDeps(store)
			reg, err := NewRegistry([]operation.Operation{operation.CreateOrder()})
			if err != nil {
				rt.Fatalf("registry: %v", err)
			}
			out, err := Interpret(reg, "createOrder", map[string]any{"cartId": cartID},
				map[string]any{"user": map[string]any{"id": "u-1"}}, deps)
			if err != nil {
				rt.Fatalf("interpret: %v", err)
			}
			return out
		}

		a := run()
		b := run()

		// Same events, same order.
		if fmt.Sprintf("%v", a.Events) != fmt.Sprintf("%v", b.Events) {
			rt.Fatalf("events not reproducible: %v vs %v", a.Events, b.Events)
		}
		// Same result shape (status, userId, items, stamped id) — fmt-stringify is a total, stable
		// structural compare for the map-of-scalars/lists the result carries.
		if fmt.Sprintf("%v", a.Result) != fmt.Sprintf("%v", b.Result) {
			rt.Fatalf("result not reproducible:\n  %v\n  %v", a.Result, b.Result)
		}
		// The events are exactly the anchor's, regardless of the cart drawn.
		if len(a.Events) != 2 || a.Events[0] != "OrderCreated" || a.Events[1] != "CartCleared" {
			rt.Fatalf("expected [OrderCreated CartCleared], got %v", a.Events)
		}
		// The order carries exactly the n drawn items (N in ⇒ N out, no phantom/dropped item).
		gotItems, ok := a.Result["items"].([]any)
		if !ok || len(gotItems) != n {
			rt.Fatalf("expected the order to carry %d items, got %v", n, a.Result["items"])
		}
	})
}

package checkout_test

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/checkout"
	"pgregory.net/rapid"
)

// S46 BDD MIRROR — PROPERTY (∀, rapid), below the line, computational. Conceptually
// in the mirrors schema (reflects: examples.checkout.full-loop, test_kind: property,
// cert_language: rapid, authority: below) and materialized here. The invariants:
//   - content-idempotence: same idea ⇒ same candidate ASTs ⇒ same content hashes ⇒
//     same sealed phase ⇒ same ordered events (re-run yields the same trace);
//   - createOrder with N line items persists EXACTLY N (no phantom, no dropped item);
//   - a malformed (empty) cart ⇒ a BlockReason (S13), never a panic, never an order;
//   - the loop NEVER side-writes truth: the kernel write is always the approved,
//     completeness-gated changeset (spec_delta AND mirror_delta).

// genCart draws an arbitrary non-empty cart of 1..6 line items with arbitrary product
// refs and quantities — exactly the surface "place an order from a cart" pins; no
// price/tax field exists to draw (out of scope, by type).
func genCart(t *rapid.T) checkout.Cart {
	n := rapid.IntRange(1, 6).Draw(t, "nItems")
	items := make([]checkout.LineItem, n)
	for i := 0; i < n; i++ {
		items[i] = checkout.LineItem{
			Product:  rapid.StringMatching(`p[0-9]{1,3}`).Draw(t, "product"),
			Quantity: rapid.IntRange(1, 99).Draw(t, "qty"),
		}
	}
	return checkout.Cart{
		ID:    rapid.StringMatching(`cart-[0-9]{1,4}`).Draw(t, "cartID"),
		Items: items,
	}
}

func inputWithCart(cart checkout.Cart) checkout.Input {
	in := checkout.ExampleInput()
	in.Cart = cart
	return in
}

func TestProp_ContentIdempotent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cart := genCart(t)
		a, br1 := checkout.RunSlice(inputWithCart(cart))
		b, br2 := checkout.RunSlice(inputWithCart(cart))
		if br1 != nil || br2 != nil {
			t.Fatalf("a non-empty cart must run green; got %v / %v", br1, br2)
		}
		// The candidate ASTs and the sealed phase are content-addressed off the prior
		// anchors — they do NOT depend on the cart, so they are byte-identical across
		// runs (the slice authors no new truth per cart).
		if a.ASTs != b.ASTs {
			t.Fatalf("ASTs not reproducible: %+v vs %+v", a.ASTs, b.ASTs)
		}
		if a.SealedPhase != b.SealedPhase {
			t.Fatalf("sealed phase not reproducible: %q vs %q", a.SealedPhase, b.SealedPhase)
		}
		if !reflect.DeepEqual(a.Events, b.Events) {
			t.Fatalf("events not reproducible")
		}
	})
}

func TestProp_NInNOut_NoPhantomNoDropped(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cart := genCart(t)
		tr, br := checkout.RunSlice(inputWithCart(cart))
		if br != nil {
			t.Fatalf("non-empty cart blocked: %s", string(br.Code))
		}
		if len(tr.Order.Items) != len(cart.Items) {
			t.Fatalf("N in ⇒ N out: cart has %d items, order has %d", len(cart.Items), len(tr.Order.Items))
		}
		if !reflect.DeepEqual(tr.Order.Items, cart.Items) {
			t.Fatalf("the order's items must MATCH the cart's, verbatim")
		}
	})
}

func TestProp_EmptyCartBlocks_NeverPanicsNeverInvents(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		id := rapid.StringMatching(`cart-[0-9]{1,4}`).Draw(t, "cartID")
		_, br := checkout.RunSlice(inputWithCart(checkout.Cart{ID: id, Items: nil}))
		if br == nil {
			t.Fatalf("an empty cart must yield a BlockReason, never an invented order")
		}
	})
}

func TestProp_KernelWriteIsAlwaysTheApprovedChangeSet(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cart := genCart(t)
		tr, br := checkout.RunSlice(inputWithCart(cart))
		if br != nil {
			t.Fatalf("blocked: %s", string(br.Code))
		}
		// The ONLY kernel write is the approved changeset, and it is completeness-gated:
		// it always carries BOTH a spec_delta and its mirror_delta (no monster, no side
		// write).
		if tr.ChangeSet.SpecDelta == nil || tr.ChangeSet.MirrorDelta == nil {
			t.Fatalf("the kernel write must be the completeness-gated changeset (spec+mirror)")
		}
	})
}

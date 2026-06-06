// fixture.go — THROWAWAY (EL01 spike). The worked example: the S46 DEMO CHECKOUT ("a customer
// places an order from their cart") captured TWO ways. The bodies are read VERBATIM from the S46
// checkout anchors (slice.go: SeedIdea, entities.Order, operation.CreateOrder,
// control.CheckoutButton, action.CheckoutSubmit) — the spike invents NO field, op, or rule the
// demo does not pin (CLAUDE.md §8 honesty). Pure data, no clock/rng.
package besoin

// checkoutGraph sketches the S46 checkout as a minimal product→entity BesoinGraph: each SOURCE rung
// declared top-down, each mapping rung fully typed (the gate FORCED the four metadata), each
// outgoing ref resolving to the declared deeper rung. journey/view are present as NoEmit nodes that
// seed the anchors of the mapping rungs below them (no Idea, no silent cast).
func checkoutGraph() BesoinGraph {
	return BesoinGraph{
		Project: "demo-checkout",
		Nodes: []Node{
			{
				Rung:          RungProduct,
				Body:          "a customer places an order from their cart",
				RefTo:         "", // product seeds the journey below; no AST ref
				TruthKind:     "behavioral",
				Verifiability: "sampleable",
				Scope:         "region:*",
				Authority:     "product-owner",
			},
			{
				Rung:  RungJourney, // NoEmit — seeds anchors, never an Idea
				Body:  "Given a cart with items / When the customer checks out / Then an order is placed",
				RefTo: "",
			},
			{
				Rung:  RungView, // NoEmit — seeds anchors, never an Idea
				Body:  "Cart screen: goal=review+checkout, zones=[items,total,checkout-button], data=[cart.items]",
				RefTo: "",
			},
			{
				Rung:          RungControl,
				Body:          "CheckoutButton: visible_when cart.items>0, enabled_when cart.items>0, triggers CheckoutSubmit",
				RefTo:         RungAction, // control.triggers → action
				TruthKind:     "behavioral",
				Verifiability: "sampleable",
				Scope:         "region:*",
				Authority:     "product-owner",
			},
			{
				Rung:          RungAction,
				Body:          "CheckoutSubmit: invoke CreateOrder",
				RefTo:         RungOperation, // action.invoke → operation
				TruthKind:     "behavioral",
				Verifiability: "sampleable",
				Scope:         "region:*",
				Authority:     "product-owner",
			},
			{
				Rung:          RungOperation,
				Body:          "CreateOrder: read $.cart.items, mutate create Order with those line items",
				RefTo:         RungEntity, // operation.mutate → entity
				TruthKind:     "behavioral",
				Verifiability: "sampleable",
				Scope:         "region:*",
				Authority:     "product-owner",
			},
			{
				Rung:          RungEntity,
				Body:          "Order: { id, items[]{product,quantity}, total }",
				RefTo:         "", // entity is the leaf
				TruthKind:     "structural",
				Verifiability: "sampleable",
				Scope:         "region:*",
				Authority:     "data-owner",
			},
		},
	}
}

// checkoutFlat is the SAME need expressed as the single free-text box S64 has today: one blob, no
// rung structure, no metadata, no edges. This is the honest CONTROL the BesoinGraph is measured
// against — what the user would type with no forcing.
func checkoutFlat() FlatPrompt {
	return FlatPrompt{
		Project: "demo-checkout",
		Text:    "I want an app where a customer can place an order from their cart.",
	}
}

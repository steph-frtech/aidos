package context

// ExampleGoal and ExampleGraph are the canonical S33 spec snapshot (the §142 ContextGraph the
// fixture pins) exposed for the MCP server and the Workbench mock view to compile over. They
// are the METHOD's example artifacts — the router coins no business rule. The derived `context`
// schema is a separate persistence step (§6: a step mocks the view it does not yet own); this
// example IS that mocked read-only view so the capability is demonstrable end-to-end.
//
// PURE DATA: a deterministic constructor, no I/O — the same call yields the same graph, so the
// MCP `context_compile` over it is reproducible.

// ExampleGoal is the checkout-apply-promo goal on branch main with its S22 red-set (reused).
func ExampleGoal() Goal {
	return Goal{
		ID:             "checkout-apply-promo",
		BoundedContext: "checkout",
		RedSet:         []string{"view:cart", "control:promo-field", "operation:applyPromo"},
		AllowedPaths:   []string{"/src/checkout/**"},
	}
}

// ExampleGraph is the §142 ContextGraph snapshot the S33 fixture pins: the checkout subgraph
// plus billing internals (a neighbor BC), a catalog sibling, a crossed PUBLIC PaymentGateway
// contract, an internal billing contract, and memory including a stale rule and an
// out-of-scope (billing) record.
func ExampleGraph() ContextGraph {
	return ContextGraph{
		Layers: []Layer{
			{ID: "view:cart", BoundedContext: "checkout", Branch: "main", LoadBearing: true},
			{ID: "control:promo-field", BoundedContext: "checkout", Branch: "main", LoadBearing: true},
			{ID: "operation:applyPromo", BoundedContext: "checkout", Branch: "main", LoadBearing: true},
			{ID: "billing:invoice-internals", BoundedContext: "billing", Branch: "main", LoadBearing: true},
			{ID: "catalog:product", BoundedContext: "catalog", Branch: "main", LoadBearing: true},
		},
		Mirrors: []Mirror{
			{ID: "promo-field.fixture", BoundedContext: "checkout", Red: true},
			{ID: "applyPromo.workflow", BoundedContext: "checkout", Red: true},
			{ID: "canPlaceOrder.property", BoundedContext: "checkout", Red: false},
			{ID: "billing.dunning.fixture", BoundedContext: "billing", Red: false},
		},
		Contracts: []Contract{
			{ID: "checkout-api@hash", BoundedContext: "checkout", Public: true},
			{ID: "PaymentGateway@hash", BoundedContext: "billing", Public: true},
			{ID: "billing-internal@hash", BoundedContext: "billing", Public: false},
		},
		Memory: []MemoryRecord{
			{ID: "idempotency-for-payment", Kind: MemoryLesson, Scope: "checkout", Confidence: ConfidenceRepeated, Approved: true},
			{ID: "out-of-stock-incident", Kind: MemoryIncident, Scope: "checkout", Confidence: ConfidenceRepeated, Approved: true},
			{ID: "old-promo-rule", Kind: MemoryLesson, Scope: "checkout", Confidence: ConfidenceRepeated, Stale: true, Approved: true},
			{ID: "refund-window", Kind: MemoryLesson, Scope: "billing", Confidence: ConfidenceRepeated, Approved: true},
		},
		Skills: []string{"context", "tdd"},
		Tools:  []string{"context_compile"},
	}
}

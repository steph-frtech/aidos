package requirementbench

// requirementbench_fixture_test.go — DG02 worked-example mirror: the canonical checkout spec from the
// DG01 spike, run through the RecompileOnlyBench fallback, asserting the CompletenessReport's shape on
// a REAL case (not just generated). It pins the contract DG01 measured: a single deterministic
// recompile leaves the cross-cutting types (∀ invariants, authz policy, error/edge cases, empty
// state, success/error effects, guards, events) MISSING — exactly the holes the bench proposes — and
// adding genuinely-divergent model outputs LIFTS coverage toward 100% (the differential surplus,
// ADR 0079). Deterministic, network-free: the fixtures are the SAME representative stand-ins the spike
// used, re-graved here (we do not import the standalone spike module).

import "testing"

// checkoutSpec — the "apply a promo then place an order" need as a terse besoin, with the COMPLETE
// coverage (the human-declared ExpectedKinds) a recompile of the terse intent does not infer.
var checkoutSpec = Spec{
	ID: "checkout-apply-promo",
	SpecText: `# Besoin: checkout — apply a promo code then place an order
Control: "Apply promo" button. Control: "Place order" button.
Operation: applyPromo. Operation: createOrder.
Entity: Cart with field items, field total. Entity: Order with field id, field status.`,
	ExpectedKinds: []RequirementKind{
		KindViewGoal, KindViewData, KindViewEmptyState,
		KindControl, KindControlVisible, KindControlEnabled, KindControlTrigger,
		KindActionInvoke, KindActionOnSuccess, KindActionOnError,
		KindOperation, KindOperationEvent, KindOperationGuard,
		KindEntity, KindEntityField,
		KindInvariant, KindPolicy, KindErrorCase, KindEdgeCase,
	},
}

// fixtureSingleRecompile — the honest baseline: a single deterministic recompile re-states only what
// the spec literally declares (happy-path verticale), inferring nothing implicit.
const fixtureSingleRecompile = `# Recompiled requirements (deterministic projection)
view goal: review cart, apply promo, place order.
displays field: cart.total
control: Apply promo
control: Place order
triggers action: applyPromo
invoke operation applyPromo
operation: applyPromo
entity: Cart
field: items
`

// fixtureModelA — an instruct/UX-leaning model: surfaces visibility/enabled rules, success/error
// effects, the empty state, the obvious error case. Misses the formal cross-cutting facets.
const fixtureModelA = `# Requirements (model A — UX-leaning)
view goal: shopper reviews cart, applies promo, places order
displayed: cart.items
empty state: when the cart has no items, show "your cart is empty"
control: Apply promo
visible_when: Place order visible when cart is non-empty
enabled_when: Place order disabled when no payment method
triggers action: applyPromo
invoke operation: createOrder
on_success: navigate to confirmation, toast "order placed"
on_error: toast the error message
operation: applyPromo
error case: invalid promo code is rejected when the code is unknown
entity: Cart
field: total
`

// fixtureModelB — a diffusion/structure-leaning model (the DiffusionGemma flavour): fills in the ∀
// invariant, authz policy, guards, events, edge case. Complementary to A, not nested.
const fixtureModelB = `# Requirements (model B — structure-leaning)
view goal: cart review and order placement
control: Place order
emits event: PromoApplied
guard: createOrder validates that the cart is non-empty
invariant: the cart total must always be never negative
policy: only the owner of the cart may place the order
edge case: boundary: when the cart reaches the maximum item count, reject further adds
entity: Order
field: id
`

// TestRecompileOnlyLeavesCrossCuttingHoles — the single recompile MISSES the cross-cutting types; the
// bench proposes them as MissingTypes. Coverage is well below 100%.
func TestRecompileOnlyLeavesCrossCuttingHoles(t *testing.T) {
	rep, err := RecompileOnlyBench{}.Run(checkoutSpec, []LLMOutput{{Role: "single", Text: fixtureSingleRecompile}})
	if err != nil {
		t.Fatalf("Run errored: %v", err)
	}
	mustMiss := []RequirementKind{
		KindInvariant, KindPolicy, KindErrorCase, KindEdgeCase,
		KindViewEmptyState, KindActionOnSuccess, KindActionOnError, KindOperationGuard, KindOperationEvent,
	}
	missing := asSet(rep.MissingTypes)
	for _, k := range mustMiss {
		if !missing[k] {
			t.Fatalf("expected the single recompile to MISS %q, but it was reported present", k)
		}
	}
	if rep.MatchPct >= 1.0 {
		t.Fatalf("single recompile should not fully cover the need, got MatchPct=%v", rep.MatchPct)
	}
}

// TestDifferentialLiftsCoverage — adding the two genuinely-divergent models LIFTS coverage above the
// single recompile (the ADR 0079 differential surplus), and the union covers strictly more types.
func TestDifferentialLiftsCoverage(t *testing.T) {
	single, _ := RecompileOnlyBench{}.Run(checkoutSpec, []LLMOutput{{Role: "single", Text: fixtureSingleRecompile}})
	union3, err := RecompileOnlyBench{}.Run(checkoutSpec, []LLMOutput{
		{Role: "single", Text: fixtureSingleRecompile},
		{Role: "A", Text: fixtureModelA},
		{Role: "B", Text: fixtureModelB},
	})
	if err != nil {
		t.Fatalf("Run errored: %v", err)
	}
	if union3.MatchPct <= single.MatchPct {
		t.Fatalf("differential should LIFT coverage: single=%v union=%v", single.MatchPct, union3.MatchPct)
	}
	if union3.PresentCount <= single.PresentCount {
		t.Fatalf("union should surface strictly more types: single=%d union=%d", single.PresentCount, union3.PresentCount)
	}
	// The formal facets B fills in are no longer missing once B is in the union.
	missing := asSet(union3.MissingTypes)
	for _, k := range []RequirementKind{KindInvariant, KindPolicy, KindOperationGuard, KindEdgeCase} {
		if missing[k] {
			t.Fatalf("model B should cover %q, but it is still reported missing in the union", k)
		}
	}
}

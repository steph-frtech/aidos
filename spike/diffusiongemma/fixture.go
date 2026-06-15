// fixture.go — THROWAWAY (DG01 spike). A REALISTIC checkout-ish spec (BesoinGraph-like, as plain
// data) + the DETERMINISTIC fixture LLM outputs the spike measures. These fixtures stand in for two
// genuinely-divergent generation models and a single deterministic recompile, so the reproducibility
// test can run with NO network. They are NOT rigged to confirm a GO: the "single recompile" output
// is the HONEST upper bound of a deterministic projection (it re-states exactly what the spec
// literally declares — the happy-path verticale), while the two model outputs add the kinds a
// recompile structurally cannot infer (error cases, edge cases, invariants ∀, policies, budgets,
// empty states) — the very gap ADR 0079 asks about. If the spec already declared those, the recompile
// would carry them; the realism is that a terse intent spec does NOT, and that is the measured surplus.
package diffusiongemma

// Spec is a small BesoinGraph-like / checkout-ish specification as plain data. It is the SINGLE spec
// all three candidates (LLM_A, LLM_B, single recompile) are run on. SpecText is the rendered intent
// a model receives; ExpectedKinds is the closed set of requirement TYPES a COMPLETE coverage of this
// need would carry (the "attendus" denominator of match% in DG03) — declared above the line.
type Spec struct {
	ID            string
	SpecText      string
	ExpectedKinds []RequirementKind
}

// CheckoutSpec is the canonical fixture: the "apply a promo code and place an order" need, stated as
// a terse intent (the way a human captures a besoin) — NOT pre-decomposed into every requirement.
// A deterministic recompile of THIS terse intent yields the literal happy-path verticale; the surplus
// the differential bench is asked to reveal is everything the terse intent leaves implicit.
var CheckoutSpec = Spec{
	ID: "checkout-apply-promo",
	SpecText: `# Besoin: checkout — apply a promo code then place an order
View goal: let a signed-in shopper review the cart, apply a promo code, and place the order.
Control: "Apply promo" button on the cart screen.
Control: "Place order" button.
Operation: applyPromo — take a code, recompute the cart total.
Operation: createOrder — turn the cart into an order.
Entity: Cart with field: items, field: total.
Entity: Order with field: id, field: total, field: status.
`,
	// The COMPLETE coverage of this need (the denominator). It includes the implicit-but-required
	// types a terse intent omits: the invariant ∀ (total never negative), the policy (only the owner
	// checks out), the error/edge cases (empty cart, out-of-stock, invalid promo), the empty state,
	// the visibility/enabled rules, the success/error effects, the events. This is what a HUMAN owner
	// would confirm is "the whole need" — the wall's truth, declared, never learned.
	ExpectedKinds: []RequirementKind{
		KindViewGoal, KindViewData, KindViewEmptyState,
		KindControl, KindControlVisible, KindControlEnabled, KindControlTrigger,
		KindActionInvoke, KindActionOnSuccess, KindActionOnError,
		KindOperation, KindOperationEvent, KindOperationGuard,
		KindEntity, KindEntityField,
		KindInvariant, KindPolicy, KindErrorCase, KindEdgeCase,
	},
}

// --- Fixture LLM outputs -----------------------------------------------------------------------
//
// These three constants are the DETERMINISTIC stand-ins behind the LLM seam. They are written to be
// representative, NOT rigged: each only claims requirement types a real model of that flavour would
// plausibly emit from the terse spec.

// fixtureSingleRecompile models a SINGLE deterministic recompile (the emitter / ADR 0072 baseline):
// it re-states EXACTLY what the spec literally declares — the happy-path verticale — and infers
// nothing implicit. This is the honest baseline the differential is measured against.
const fixtureSingleRecompile = `# Recompiled requirements (deterministic projection of the spec)
View goal: review cart, apply promo, place order.
displays field: cart.items
displays field: cart.total
control: Apply promo
control: Place order
control.triggers action applyPromo
control.triggers action createOrder
invoke operation applyPromo
invoke operation createOrder
operation: applyPromo
operation: createOrder
entity: Cart
field: items
field: total
entity: Order
field: id
field: status
`

// fixtureModelA models an autoregressive "happy-path + UX" leaning model (e.g. a standard instruct
// model). Beyond the literal spec it reliably surfaces UX/behaviour facets: visibility/enabled rules,
// success/error effects, the empty state, and the obvious error case (invalid promo). It tends to
// MISS the cross-cutting formal facets (∀ invariants, authz policy, budgets).
const fixtureModelA = `# Requirements (model A — instruct, UX-leaning)
view goal: shopper reviews cart, applies promo, places order
displayed: cart.items
displayed: cart.total
empty state: when the cart has no items, show "your cart is empty" and hide checkout
control: Apply promo
control: Place order
visible_when: Place order visible when cart is non-empty
enabled_when: Place order disabled when no payment method
triggers action: applyPromo
triggers action: createOrder
invoke operation: applyPromo
invoke operation: createOrder
on_success: navigate to the order confirmation, toast "order placed"
on_error: toast the error message
operation: applyPromo
operation: createOrder
error case: invalid promo code is rejected when the code is unknown
entity: Cart
field: items
field: total
`

// fixtureModelB models a DIFFUSION-style / structure-leaning model (the DiffusionGemma flavour ADR
// 0079 names — code/structured generation by diffusion). Its strength is the FORMAL / cross-cutting
// structure a structure model fills in: the ∀ invariant, the authz policy, the operation guards and
// emitted events, the boundary/edge case, the perf budget — AND it MISSES some of the UX polish A had
// (no empty-state, no on_success/on_error effects). The two flavours are COMPLEMENTARY, not nested:
// that complementarity is exactly the differential surplus the spike is asked to falsify.
const fixtureModelB = `# Requirements (model B — diffusion, structure-leaning)
view goal: cart review and order placement
displays field: cart.total
control: Apply promo
control: Place order
visible_when: Apply promo visible when a promo field is shown
triggers: applyPromo
triggers: createOrder
invoke operation applyPromo
invoke operation createOrder
operation: applyPromo
operation: createOrder
emits event: PromoApplied
emits event: OrderPlaced
guard: applyPromo validates that the code is active and not expired
guard: createOrder validates that the cart is non-empty
invariant: the cart total must always be never negative
policy: only the owner of the cart may place the order
budget: createOrder must respond within p95 300ms
edge case: boundary: when the cart reaches the maximum item count, reject further adds
error case: out of stock — an item went to rupture de stock between cart and checkout
entity: Cart
field: items
entity: Order
field: id
field: status
`

// Outputs are the named fixture candidate outputs, keyed for the report.
func fixtureOutputs() map[string]string {
	return map[string]string{
		"single": fixtureSingleRecompile,
		"A":      fixtureModelA,
		"B":      fixtureModelB,
	}
}

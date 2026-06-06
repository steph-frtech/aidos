package context

// compressor_fixture_test.go — a realistic rendered S33 ContextPack (the LLM input the loop
// actually feeds the model) and its load-bearing CARRIER FACTS, used by the HR02 property
// mirror. Reconstructed cleanly in back/ from the HR01 spike fixture (the spike does not
// graduate). Repetition-prone (ids, the wall boilerplate, the stop condition recur across
// sections) — exactly the shape the reference-replacement compressor targets.

// exampleContextPack returns a rendered S33 ContextPack prompt as the model receives it.
func exampleContextPack() string {
	return `# CONTEXT PACK — goal: checkout-apply-promo (branch: main)
You are working the red goal "checkout-apply-promo" in the bounded context "checkout".

## Affected layers
- view:cart (bounded_context=checkout, branch=main, load_bearing=true)
- control:promo-field (bounded_context=checkout, branch=main, load_bearing=true)
- operation:applyPromo (bounded_context=checkout, branch=main, load_bearing=true)

## Active kernel
Red mirrors (your stop condition): promo-field.fixture, applyPromo.workflow
Invariants the pack carries: canPlaceOrder.property
Crossed PUBLIC contracts: checkout-api@hash, PaymentGateway@hash

## Boundaries (THE WALL — non-negotiable)
bounded_context: checkout
allowed_paths: /src/checkout/**
forbidden_paths: /kernel/**, /mirror/**
The wall: you NEVER write /kernel/** or /mirror/**. To change a truth you open an idea,
write its mirror, open a /goal. The wall is enforced by the PreToolUse hook AND the Postgres
GRANTs. Writing /kernel/** is refused. Writing /mirror/** is refused.

## Memory (scoped, filtered)
relevant_lessons: idempotency-for-payment
recent_incidents: out-of-stock-incident
glossary_terms:
Excluded (and why): old-promo-rule (stale), refund-window (out-of-scope),
billing:invoice-internals (cross-BC)

## Stop condition
red_set_green AND previous_green_intact AND aggregate_complete

pack_hash: 0x9f3a-checkout-apply-promo-main
`
}

// carrierFacts is the closed set of load-bearing facts the fidelity check requires to survive
// retrieve∘compress. "Porteur" (KRD): the goal id, the red-set ids, the wall/forbidden paths,
// the allowed paths, a crossed contract, the stop condition, the pack_hash — losing any makes
// the agent invent or breach the wall.
func carrierFacts() []string {
	return []string{
		"checkout-apply-promo",            // the goal id
		"promo-field.fixture",             // red mirror 1
		"applyPromo.workflow",             // red mirror 2
		"/kernel/**",                      // the wall (forbidden)
		"/mirror/**",                      // the wall (forbidden)
		"allowed_paths: /src/checkout/**", // the allowed paths
		"checkout-api@hash",               // a crossed contract
		"red_set_green AND previous_green_intact AND aggregate_complete", // the stop condition
		"pack_hash: 0x9f3a-checkout-apply-promo-main",                    // the pack hash
	}
}

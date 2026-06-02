package context_test

// ContextRouter compile fixture (state graph+goal+branch → command compile → events
// ContextPack), interpreted in Go. reflects=runtime.context.Compile (KRD §144) /
// runtime.context.ContextPack (KRD §143) · test_kind=fixture · cert_language=fixture ·
// liveness=live · authority=above (the human's rule — a checkout goal does not receive
// billing internals; stale + out-of-scope memory are excluded; KRD §119.3/§141/§143/§144/§145).
//
// Materialized source: tests/runtime/context_router.fixture.md (conceptually stored in the
// `mirrors` schema; persisted to Postgres at S06 — bootstrap exception). These rows mirror
// that file fixture-by-fixture (A–E); if the fixture intention disappears the test breaks (no
// silent rot into a monster).
//
// The router coins NO new business rule: it READS the ContextGraph view and emits the minimal
// pack. The pack is compiled from the red-set (S22, reused), over the affected subgraph
// (§142), content-addressed (§143).

import (
	"testing"

	rctx "github.com/steph-frtech/aidos/back/runtime/context"
)

// checkoutGraph is the §142 snapshot the S33 spec pins: a checkout-apply-promo goal on main,
// a red-set of three checkout layers, plus billing internals and a catalog sibling, mirrors
// including a cross-BC billing mirror, contracts including a crossed PUBLIC PaymentGateway and
// an internal billing contract, and memory including a stale rule and an out-of-scope record.
func checkoutGraph() (rctx.Goal, rctx.ContextGraph) {
	goal := rctx.Goal{
		ID:             "checkout-apply-promo",
		BoundedContext: "checkout",
		RedSet:         []string{"view:cart", "control:promo-field", "operation:applyPromo"},
		AllowedPaths:   []string{"/src/checkout/**"},
	}
	graph := rctx.ContextGraph{
		Layers: []rctx.Layer{
			{ID: "view:cart", BoundedContext: "checkout", Branch: "main", LoadBearing: true},
			{ID: "control:promo-field", BoundedContext: "checkout", Branch: "main", LoadBearing: true},
			{ID: "operation:applyPromo", BoundedContext: "checkout", Branch: "main", LoadBearing: true},
			{ID: "billing:invoice-internals", BoundedContext: "billing", Branch: "main", LoadBearing: true},
			{ID: "catalog:product", BoundedContext: "catalog", Branch: "main", LoadBearing: true},
		},
		Mirrors: []rctx.Mirror{
			{ID: "promo-field.fixture", BoundedContext: "checkout", Red: true},
			{ID: "applyPromo.workflow", BoundedContext: "checkout", Red: true},
			{ID: "canPlaceOrder.property", BoundedContext: "checkout", Red: false},
			{ID: "billing.dunning.fixture", BoundedContext: "billing", Red: false},
		},
		Contracts: []rctx.Contract{
			{ID: "checkout-api@hash", BoundedContext: "checkout", Public: true},
			{ID: "PaymentGateway@hash", BoundedContext: "billing", Public: true},
			{ID: "billing-internal@hash", BoundedContext: "billing", Public: false},
		},
		Memory: []rctx.MemoryRecord{
			{ID: "idempotency-for-payment", Kind: rctx.MemoryLesson, Scope: "checkout", Confidence: rctx.ConfidenceRepeated, Stale: false, Approved: true},
			{ID: "out-of-stock-incident", Kind: rctx.MemoryIncident, Scope: "checkout", Confidence: rctx.ConfidenceRepeated, Stale: false, Approved: true},
			{ID: "old-promo-rule", Kind: rctx.MemoryLesson, Scope: "checkout", Confidence: rctx.ConfidenceRepeated, Stale: true, Approved: true},
			{ID: "refund-window", Kind: rctx.MemoryLesson, Scope: "billing", Confidence: rctx.ConfidenceRepeated, Stale: false, Approved: true},
		},
		Skills: []string{"tdd", "context"},
		Tools:  []string{"context_compile"},
	}
	return goal, graph
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func excludedReason(p rctx.ContextPack, id string) (rctx.ExclusionReason, bool) {
	for _, e := range p.Excluded {
		if e.ID == id {
			return e.Reason, true
		}
	}
	return "", false
}

// Fixture A — the pack INCLUDES the checkout subgraph + load-bearing kernel + red mirrors.
func TestFixtureA_CheckoutPack_Includes(t *testing.T) {
	goal, graph := checkoutGraph()
	p := rctx.Compile(goal, "main", graph)

	want := []string{"control:promo-field", "operation:applyPromo", "view:cart"}
	if len(p.AffectedLayers) != len(want) {
		t.Fatalf("affected_layers = %v, want exactly the three red layers %v", p.AffectedLayers, want)
	}
	for _, w := range want {
		if !contains(p.AffectedLayers, w) {
			t.Errorf("affected_layers missing %q (got %v)", w, p.AffectedLayers)
		}
	}
	for _, m := range []string{"promo-field.fixture", "applyPromo.workflow", "canPlaceOrder.property"} {
		if !contains(p.ActiveKernel.Mirrors, m) {
			t.Errorf("active_kernel.mirrors missing %q (got %v)", m, p.ActiveKernel.Mirrors)
		}
	}
	for _, c := range []string{"checkout-api@hash", "PaymentGateway@hash"} {
		if !contains(p.ActiveKernel.Contracts, c) {
			t.Errorf("active_kernel.contracts missing crossed contract %q (got %v)", c, p.ActiveKernel.Contracts)
		}
	}
	if p.Boundaries.BoundedContext != "checkout" {
		t.Errorf("boundaries.bounded_context = %q, want checkout", p.Boundaries.BoundedContext)
	}
	if !contains(p.Boundaries.AllowedPaths, "/src/checkout/**") {
		t.Errorf("allowed_paths missing /src/checkout/** (got %v)", p.Boundaries.AllowedPaths)
	}
	if !contains(p.Boundaries.ForbiddenPaths, "/kernel/**") || !contains(p.Boundaries.ForbiddenPaths, "/mirror/**") {
		t.Errorf("forbidden_paths missing the wall (got %v)", p.Boundaries.ForbiddenPaths)
	}
	if p.StopCondition != "red_set_green AND previous_green_intact AND aggregate_complete" {
		t.Errorf("stop_condition = %q", p.StopCondition)
	}
	if p.Hash == "" {
		t.Error("pack.hash is empty; must be content-addressed")
	}
}

// Fixture B — THE done case: billing internals, the cross-BC contract, stale + out-of-scope
// memory are EXCLUDED, each tagged with its reason.
func TestFixtureB_CheckoutPack_ExcludesBillingInternalsAndStaleMemory(t *testing.T) {
	goal, graph := checkoutGraph()
	p := rctx.Compile(goal, "main", graph)

	if contains(p.AffectedLayers, "billing:invoice-internals") {
		t.Error("affected_layers must NOT contain billing:invoice-internals (cross-BC)")
	}
	if contains(p.AffectedLayers, "catalog:product") {
		t.Error("affected_layers must NOT contain catalog:product (not load-bearing for the red-set)")
	}
	if contains(p.ActiveKernel.Mirrors, "billing.dunning.fixture") {
		t.Error("active_kernel.mirrors must NOT contain billing.dunning.fixture (cross-BC)")
	}
	if contains(p.ActiveKernel.Contracts, "billing-internal@hash") {
		t.Error("active_kernel.contracts must NOT contain billing-internal@hash (internal, not crossed PUBLIC)")
	}
	if !contains(p.Memory.RelevantLessons, "idempotency-for-payment") {
		t.Error("memory.relevant_lessons must contain idempotency-for-payment")
	}
	if !contains(p.Memory.RecentIncidents, "out-of-stock-incident") {
		t.Error("memory.recent_incidents must contain out-of-stock-incident")
	}
	for _, gone := range []string{"old-promo-rule", "refund-window"} {
		if contains(p.Memory.RelevantLessons, gone) || contains(p.Memory.RecentIncidents, gone) || contains(p.Memory.GlossaryTerms, gone) {
			t.Errorf("memory must NOT contain %q", gone)
		}
	}
	// The exclusion reasons must be explicit (rendered on the Excluded panel).
	if r, ok := excludedReason(p, "billing:invoice-internals"); !ok || r != rctx.ReasonCrossBC {
		t.Errorf("billing:invoice-internals reason = %q,%v, want cross-BC", r, ok)
	}
	if r, ok := excludedReason(p, "old-promo-rule"); !ok || r != rctx.ReasonStale {
		t.Errorf("old-promo-rule reason = %q,%v, want stale", r, ok)
	}
	if r, ok := excludedReason(p, "refund-window"); !ok || r != rctx.ReasonOutOfScope {
		t.Errorf("refund-window reason = %q,%v, want out-of-scope", r, ok)
	}
	if r, ok := excludedReason(p, "billing-internal@hash"); !ok || r != rctx.ReasonCrossBC {
		t.Errorf("billing-internal@hash reason = %q,%v, want cross-BC", r, ok)
	}
}

// Fixture C — determinism + content-addressing: same input ⇒ identical pack + identical hash.
func TestFixtureC_DeterministicAndContentAddressed(t *testing.T) {
	goal, graph := checkoutGraph()
	p1 := rctx.Compile(goal, "main", graph)
	p2 := rctx.Compile(goal, "main", graph)
	if p1.Hash != p2.Hash {
		t.Errorf("hash not stable: %q != %q", p1.Hash, p2.Hash)
	}
	if p1.Hash == "" {
		t.Error("hash empty")
	}
}

// Fixture D — branch-awareness: another branch's node never leaks.
func TestFixtureD_BranchAware_NoLeak(t *testing.T) {
	goal, graph := checkoutGraph()
	graph.Layers = append(graph.Layers, rctx.Layer{
		ID: "view:cart-v2", BoundedContext: "checkout", Branch: "feature/cart-redesign", LoadBearing: true,
	})
	// view:cart-v2 is in the red-set conceptually only on the feature branch — on main it must
	// not leak. Add it to the red-set to prove the branch fence, not the red-set fence, drops it.
	goal.RedSet = append(goal.RedSet, "view:cart-v2")
	p := rctx.Compile(goal, "main", graph)
	if p.Branch != "main" {
		t.Errorf("branch = %q, want main", p.Branch)
	}
	if !contains(p.AffectedLayers, "view:cart") {
		t.Error("affected_layers must contain view:cart on main")
	}
	if contains(p.AffectedLayers, "view:cart-v2") {
		t.Error("affected_layers must NOT leak another branch's node view:cart-v2")
	}
}

// Fixture E — every pack always forbids the wall and carries a non-empty stop condition.
func TestFixtureE_WallAlwaysForbidden(t *testing.T) {
	goal, graph := checkoutGraph()
	p := rctx.Compile(goal, "main", graph)
	if !contains(p.Boundaries.ForbiddenPaths, "/kernel/**") || !contains(p.Boundaries.ForbiddenPaths, "/mirror/**") {
		t.Errorf("forbidden_paths must always contain the wall (got %v)", p.Boundaries.ForbiddenPaths)
	}
	if p.StopCondition == "" {
		t.Error("stop_condition must be non-empty")
	}
}

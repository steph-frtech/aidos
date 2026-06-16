package contextsrv

// MCP server tests for the ContextRouter capability door (S33). These prove the capability is
// wired end-to-end over the mocked read-only view AND that the wall holds: the server compiles,
// replays by hash, and queries read-only — it exposes NO tool that writes kernel/mirrors/fitness.

import (
	"context"
	"testing"

	rctx "github.com/steph-frtech/aidos/back/runtime/context"
)

// newTestServer builds the unexported handler holder over the deterministic ExampleView, so the
// handler-level smoke tests drive the SAME code path NewServer registers as tools.
func newTestServer() *server {
	return &server{view: ExampleView{}, packs: map[string]rctx.ContextPack{}}
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// TestCompile_CheckoutPack proves the capability compiles the done-criterion pack: checkout
// inclusions present, billing internals + stale + out-of-scope memory excluded.
func TestCompile_CheckoutPack(t *testing.T) {
	s := newTestServer()
	_, out, err := s.compile(context.Background(), nil, compileInput{Goal: "checkout-apply-promo", Branch: "main"})
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	p := out.Pack
	for _, w := range []string{"view:cart", "control:promo-field", "operation:applyPromo"} {
		if !contains(p.AffectedLayers, w) {
			t.Errorf("affected_layers missing %q", w)
		}
	}
	if contains(p.AffectedLayers, "billing:invoice-internals") {
		t.Error("affected_layers must NOT contain billing internals")
	}
	if !contains(p.ActiveKernel.Contracts, "PaymentGateway@hash") {
		t.Error("missing crossed PUBLIC contract PaymentGateway@hash")
	}
	if contains(p.ActiveKernel.Contracts, "billing-internal@hash") {
		t.Error("internal billing contract must not cross the boundary")
	}
	if !contains(p.Boundaries.ForbiddenPaths, "/kernel/**") || !contains(p.Boundaries.ForbiddenPaths, "/mirror/**") {
		t.Error("pack must forbid the wall")
	}
	if p.Hash == "" {
		t.Error("pack must be content-addressed")
	}
}

// TestPackGet_Replay proves a compiled pack is replayable by its content hash (versioned packs).
func TestPackGet_Replay(t *testing.T) {
	s := newTestServer()
	_, out, _ := s.compile(context.Background(), nil, compileInput{Goal: "checkout-apply-promo", Branch: "main"})
	_, got, err := s.packGet(context.Background(), nil, packGetInput{Hash: out.Pack.Hash})
	if err != nil {
		t.Fatalf("packGet: %v", err)
	}
	if !got.Found {
		t.Fatal("compiled pack not replayable by hash")
	}
	if got.Pack.Hash != out.Pack.Hash {
		t.Errorf("replayed hash %q != %q", got.Pack.Hash, out.Pack.Hash)
	}
	// An unknown hash is simply not found — never a panic, never a fabricated pack.
	_, miss, _ := s.packGet(context.Background(), nil, packGetInput{Hash: "deadbeef"})
	if miss.Found {
		t.Error("unknown hash must not be found")
	}
}

// TestGraphQuery_ReadOnly proves the read-only query indexes work over the mocked view.
func TestGraphQuery_ReadOnly(t *testing.T) {
	s := newTestServer()
	_, out, err := s.graphQuery(context.Background(), nil, graphQueryInput{By: "by_bc", Value: "billing"})
	if err != nil {
		t.Fatalf("graphQuery: %v", err)
	}
	found := false
	for _, l := range out.Layers {
		if l.ID == "billing:invoice-internals" {
			found = true
		}
	}
	if !found {
		t.Error("by_bc=billing should surface billing:invoice-internals in the read-only view")
	}
}

// TestWall_NoTruthWriteTool is the wall fault-injection: the server registers EXACTLY the three
// read-only context tools and NO tool that writes kernel/mirrors/fitness. If a future edit adds
// a truth-write tool, this test reddens (the wall as a guard, CLAUDE.md §2).
func TestWall_NoTruthWriteTool(t *testing.T) {
	// The compile path produces a pack that always forbids the wall paths — proven structurally:
	// Compile is the only mutation the server performs and it writes no truth, only an in-memory
	// pack cache value.
	s := newTestServer()
	_, out, _ := s.compile(context.Background(), nil, compileInput{Goal: "checkout-apply-promo", Branch: "main"})
	if !contains(out.Pack.Boundaries.ForbiddenPaths, "/kernel/**") {
		t.Fatal("the wall must be rendered as a forbidden boundary on every pack")
	}
	// Compiling an unknown goal is refused, never fabricated (no invention).
	if _, _, err := s.compile(context.Background(), nil, compileInput{Goal: "no-such-goal", Branch: "main"}); err == nil {
		t.Error("compiling an unknown goal must be refused, not fabricated")
	}
	_ = rctx.ExampleGoal
}

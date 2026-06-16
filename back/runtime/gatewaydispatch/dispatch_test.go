package gatewaydispatch_test

// Mirror for the S59 gateway DISPATCHER (reflects=runtime.gatewaydispatch, test_kind=unit,
// liveness=live). Three guarantees, red→green:
//
//	(i)  THE WALL — a truth-write (kernel_write/mirror_write/fitness_write) is refused at
//	     the router BEFORE any dispatch: the backend factory PANICS if ever called, so a
//	     non-panicking refused_truth_write proves the store is never reached (the §2 wall).
//	(ii) THE DISPATCH — a routed below-the-line changeset_open reaches a deterministic fake
//	     backend and returns its exact structured output (route → CallTool → result).
//	(iii) DETERMINISM — two identical Calls to the pure fake yield byte-identical results
//	      (the reproducibility mirror, §6/§8).
//
// The fake backend is a real in-memory *mcp.Server exposing a pure changeset_open — no
// Postgres, no clock, no LLM: the dispatcher's seam (route → in-memory transport → CallTool)
// is exercised against a deterministic handler. args are map[string]any (a decoded object),
// the same shape the real HTTP transport carries — never a json.RawMessage (the S59 scar: a
// byte-array Args field makes the wire schema reject an object before dispatch).

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
)

// fakeOpenOut is the deterministic structured output of the fake changeset_open.
type fakeOpenOut struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// newFakeChangesetServer builds an in-memory *mcp.Server exposing a PURE changeset_open
// that ignores its input and returns a fixed envelope — deterministic by construction.
func newFakeChangesetServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "fake-changeset", Version: "v0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_open", Description: "fake deterministic open"},
		func(_ context.Context, _ *mcp.CallToolRequest, _ map[string]any) (*mcp.CallToolResult, fakeOpenOut, error) {
			return nil, fakeOpenOut{ID: "cs-deadbeef", Status: "DRAFT"}, nil
		})
	return srv
}

const activeProject = "proj-a"

func dispatchScope() projectwall.Scope {
	return projectwall.Scope{Identity: "alice", ActiveProject: activeProject}
}

// mustJSON marshals a result map for a byte-equal comparison.
func mustJSON(t *testing.T, v map[string]any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(b)
}

// TestWallRefusesTruthWriteBeforeDispatch: the factory PANICS if called; a truth-write must
// be refused at the router, so the factory is never reached. Proven for the three truth
// zones (kernel/mirror/fitness).
func TestWallRefusesTruthWriteBeforeDispatch(t *testing.T) {
	panicFactory := func(_ context.Context, server string) (*mcp.Server, error) {
		t.Helper()
		t.Fatalf("factory MUST NOT be reached for a truth-write (server=%q) — the wall failed", server)
		panic("unreachable")
	}
	d := gatewaydispatch.New(gateway.DefaultRegistry(), panicFactory)
	defer d.Close()

	for _, tool := range []string{"kernel_write", "mirror_write", "fitness_write"} {
		result, br, outcome, err := d.Call(context.Background(), dispatchScope(), tool, map[string]any{})
		if err != nil {
			t.Fatalf("%s: unexpected err: %v", tool, err)
		}
		if outcome != string(gateway.OutcomeRefusedTruthWrite) {
			t.Fatalf("%s: outcome = %q, want refused_truth_write (the wall)", tool, outcome)
		}
		if br == nil || br.Code != gateway.CodeTruthWriteNeedsChangeset {
			t.Fatalf("%s: block_reason = %+v, want GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET", tool, br)
		}
		if result != nil {
			t.Fatalf("%s: result must be nil on a refusal, got %v", tool, result)
		}
	}
}

// TestWallConsultsRouterScope: the dispatcher's project dimension is DERIVED from the
// caller's already-pinned scope — Call(scope, tool, args) targets exactly scope.ActiveProject
// (the request is pinned to one project at the S57 cookie / S61 identity layer, the gateway
// main supplies the explicit cross-project target). Consequently a legitimately-scoped
// below-the-line call DOES reach the backend (the factory is consulted) — the complement of
// the truth-write wall test, which proves a non-route outcome never reaches it. The actual
// cross-project / forged-identity refusal is exhaustively covered at the pure router layer
// (back/runtime/gateway: TestRouteScopeBeforeTruthWrite) — the dispatcher reuses that same
// Route, it does not re-decide scope.
func TestWallConsultsRouterScope(t *testing.T) {
	reached := false
	factory := func(_ context.Context, server string) (*mcp.Server, error) {
		if server == "changeset" {
			reached = true
			return newFakeChangesetServer(), nil
		}
		return nil, gatewaydispatch.ErrServerNotDispatched
	}
	d := gatewaydispatch.New(gateway.DefaultRegistry(), factory)
	defer d.Close()

	_, _, outcome, err := d.Call(context.Background(), dispatchScope(), "changeset_open", map[string]any{"label": "x", "parent_phase": "p"})
	if err != nil {
		t.Fatalf("legitimately-scoped call err: %v", err)
	}
	if outcome != string(gateway.OutcomeRoute) {
		t.Fatalf("legitimately-scoped below-line call not routed: %q", outcome)
	}
	if !reached {
		t.Fatal("a legitimately-scoped, routed call MUST reach the backend factory")
	}
}

// TestDispatchRoutesToBackend: a routed below-the-line changeset_open reaches the fake
// backend and returns its exact deterministic output.
func TestDispatchRoutesToBackend(t *testing.T) {
	factory := func(_ context.Context, server string) (*mcp.Server, error) {
		if server != "changeset" {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		return newFakeChangesetServer(), nil
	}
	d := gatewaydispatch.New(gateway.DefaultRegistry(), factory)
	defer d.Close()

	result, br, outcome, err := d.Call(context.Background(), dispatchScope(), "changeset_open",
		map[string]any{"label": "add order discount", "parent_phase": "p"})
	if err != nil {
		t.Fatalf("dispatch err: %v", err)
	}
	if br != nil {
		t.Fatalf("unexpected block_reason: %+v", br)
	}
	if outcome != string(gateway.OutcomeRoute) {
		t.Fatalf("outcome = %q, want route", outcome)
	}
	if result == nil {
		t.Fatalf("result must carry the backend structured output, got nil")
	}
	if result["id"] != "cs-deadbeef" || result["status"] != "DRAFT" {
		t.Fatalf("dispatched result = %+v, want the fake's deterministic envelope", result)
	}
}

// TestUndispatchedServerReturnsSentinel: a routed below-the-line tool whose backend the
// factory declines (ErrServerNotDispatched) returns outcome route_undispatched, nil result,
// nil block_reason — the caller falls back to demo, NO regression, NO truth touched.
func TestUndispatchedServerReturnsSentinel(t *testing.T) {
	factory := func(_ context.Context, _ string) (*mcp.Server, error) {
		return nil, gatewaydispatch.ErrServerNotDispatched
	}
	d := gatewaydispatch.New(gateway.DefaultRegistry(), factory)
	defer d.Close()

	result, br, outcome, err := d.Call(context.Background(), dispatchScope(), "store_get", map[string]any{})
	if err != nil {
		t.Fatalf("undispatched err: %v", err)
	}
	if outcome != gatewaydispatch.OutcomeRouteUndispatched {
		t.Fatalf("outcome = %q, want route_undispatched", outcome)
	}
	if result != nil || br != nil {
		t.Fatalf("undispatched must carry nil result + nil block_reason, got result=%v br=%+v", result, br)
	}
}

// TestDispatchDeterministic: two identical Calls to the pure fake backend yield byte-
// identical results (reproducibility mirror, §6/§8).
func TestDispatchDeterministic(t *testing.T) {
	factory := func(_ context.Context, server string) (*mcp.Server, error) {
		if server != "changeset" {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		return newFakeChangesetServer(), nil
	}
	d := gatewaydispatch.New(gateway.DefaultRegistry(), factory)
	defer d.Close()

	args := map[string]any{"label": "x", "parent_phase": "p"}
	r1, _, o1, err1 := d.Call(context.Background(), dispatchScope(), "changeset_open", args)
	r2, _, o2, err2 := d.Call(context.Background(), dispatchScope(), "changeset_open", args)
	if err1 != nil || err2 != nil {
		t.Fatalf("determinism call errs: %v / %v", err1, err2)
	}
	if o1 != o2 || mustJSON(t, r1) != mustJSON(t, r2) {
		t.Fatalf("non-deterministic dispatch: (%s,%v) != (%s,%v)", o1, r1, o2, r2)
	}
}

// TestUnknownToolRefused: a tool absent from the closed registry is refused at the router
// (unknown_tool) — never an arbitrary passthrough, never the factory.
func TestUnknownToolRefused(t *testing.T) {
	panicFactory := func(_ context.Context, server string) (*mcp.Server, error) {
		t.Fatalf("factory reached for an unknown tool (server=%q)", server)
		panic("unreachable")
	}
	d := gatewaydispatch.New(gateway.DefaultRegistry(), panicFactory)
	defer d.Close()
	result, br, outcome, err := d.Call(context.Background(), dispatchScope(), "definitely_not_a_tool", map[string]any{})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if outcome != string(gateway.OutcomeUnknownTool) {
		t.Fatalf("outcome = %q, want unknown_tool", outcome)
	}
	if br == nil || br.Code != gateway.CodeUnknownTool || result != nil {
		t.Fatalf("unknown-tool refusal malformed: br=%+v result=%v", br, result)
	}
}

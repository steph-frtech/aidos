// transport_phase2_lenses_test.go — the DISPATCH MIRROR for the ADR 0092 PHASE-2 conceptual-lens
// servers (grid · links · anatomy · kernel-tree). For AT LEAST one CHEAP/pure read tool of EACH of
// the four servers, it drives gateway_call with an args:OBJECT payload over the REAL HTTP transport
// (StreamableHTTPHandler) and asserts the routed call REACHES its in-process backend and returns a
// structured "route" result — NOT route_undispatched (the un-wired fallback) and NOT an isError (an
// input/output-schema rejection, the S59 byte-array scar).
//
// THE FOUR LENSES (the V3 conceptual screens whose lib/v2/* TS twins flip to the Go engine):
//
//	grid (FK03)         — grid_build projects placed truths onto the Level×Facet matrix (/v3/grille).
//	links (KRD §41)     — links_graph validates + resolves a link graph against the heads (/v3/liens).
//	anatomy (FKE)       — anatomy_build computes the six mirror-pairs + the voyants (/v3/anatomie).
//	kernel-tree (§109)  — tree_aggregate computes the recursive composition verdict (/v3/arbres).
//
// THE SCAR THIS PINS (S59, the recurring one). A tool whose I/O carries a json.RawMessage reflects to
// the go-sdk as a BYTE-ARRAY schema, so a real HTTP args:{object} payload is REFUSED at input
// validation BEFORE the handler — and the front silently falls back to demo (the twin stays alive).
// The four lens tools carry NO json.RawMessage in their I/O (every body is a scalar object — a grid
// matrix, a link-graph fold, an anatomy, a composes verdict), so they dispatch over HTTP.
//
// THE LOAD-BEARING PROOF (TestTransport_Phase2_NeutralizedBuilderUndispatched). A builder NEUTRALIZED
// in the dispatcher (returns ErrServerNotDispatched) makes the SAME object payload route to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes are caused by
// the WIRING, not by the registry alone (the cliquet's blind spot is that a readVia frontier passes
// even when the tool does not resolve; this mirror closes it server-side).
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; every dispatched tool's output is a VALUE
// (WroteKernel false — the four lenses are PURE reads over the Go kernel logic). The dispatch path
// runs the pure router FIRST — a truth-write never reaches a backend (TestTransport_GatewayCallWallOverHTTP).
package main

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	anatomysrv "github.com/steph-frtech/aidos/back/mcp/anatomy/anatomysrv"
	"github.com/steph-frtech/aidos/back/mcp/grid/gridsrv"
	kerneltreesrv "github.com/steph-frtech/aidos/back/mcp/kernel-tree/kerneltreesrv"
	"github.com/steph-frtech/aidos/back/mcp/links/linksrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

// phase2Builder is the StoreProvider that builds the four ADR 0092 phase-2 lens servers in-process
// (the SAME NewServer the standalone binaries use — no twin). When neutralize is non-empty, that one
// server returns ErrServerNotDispatched instead (the load-bearing proof).
func phase2Builder(neutralize string) func(context.Context, string) (*mcp.Server, error) {
	return func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv == neutralize {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		switch srv {
		case "grid":
			return gridsrv.NewServer(), nil
		case "links":
			return linksrv.NewServer(), nil
		case "anatomy":
			return anatomysrv.NewServer(), nil
		case "kernel-tree":
			return kerneltreesrv.NewServer(), nil
		default:
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
	}
}

func phase2Dispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), phase2Builder(""))
}

// TestTransport_GridBuildOverHTTP — grid.grid_build with a truths:{object} payload reaches the
// backend and projects the full Level×Facet matrix (8 columns, content-addressed) — the real FK03
// grille engine executed, the object body survived the HTTP round-trip.
func TestTransport_GridBuildOverHTTP(t *testing.T) {
	d := phase2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "grid_build", map[string]any{
		"truths": []map[string]any{
			{"id": "k-op-s", "rung": "operation", "facet": "S"},
			{"id": "k-ent-f", "rung": "entity", "facet": "F"},
		},
	})
	assertRouted(t, out, "grid_build")
	if out.Result["ok"] != true {
		t.Fatalf("grid_build ok = %v, want true (the real FK03 grid executed)", out.Result["ok"])
	}
	cols, _ := out.Result["columns"].([]any)
	if len(cols) != 8 {
		t.Fatalf("grid_build must yield one column per canonical facet (8): got %d", len(cols))
	}
}

// TestTransport_LinksGraphOverHTTP — links.links_graph with a links:{object} + heads:{object} payload
// reaches the backend and folds the §41–§42 staleness verdicts (green/stale/absent) — the real links
// engine executed (links.Validate + links.Resolve), the object body survived the round-trip.
func TestTransport_LinksGraphOverHTTP(t *testing.T) {
	d := phase2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "links_graph", map[string]any{
		"links": []map[string]any{
			{"kind": "projects_to", "from": map[string]any{"id": "a", "version": "v1"}, "to": map[string]any{"id": "X", "version": "v1"}},
			{"kind": "derives_from", "from": map[string]any{"id": "b", "version": "v1"}, "to": map[string]any{"id": "Y", "version": "v1"}},
		},
		"heads": map[string]any{"X": "v1", "Y": "v2"},
	})
	assertRouted(t, out, "links_graph")
	if out.Result["all_pinned"] != true {
		t.Fatalf("links_graph all_pinned = %v, want true (the real links engine executed)", out.Result["all_pinned"])
	}
	if out.Result["green"].(float64) != 1 || out.Result["stale"].(float64) != 1 {
		t.Fatalf("links_graph counts wrong (green=1, stale=1 expected): %+v", out.Result)
	}
}

// TestTransport_AnatomyBuildOverHTTP — anatomy.anatomy_build with a states:{object} payload reaches the
// backend and computes the six mirror-pairs + the worst-of-six voyant — the real FKE voyant truth-table
// executed (the §8 judge is a calcul), the object body survived the round-trip.
func TestTransport_AnatomyBuildOverHTTP(t *testing.T) {
	d := phase2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	states := []map[string]any{}
	for _, k := range []string{"spec_doc", "behavior_results", "scenarios_tests", "model_projection", "contract_code", "evidence"} {
		states = append(states, map[string]any{"kind": k, "declared": "declared", "proven": "pass"})
	}
	out := callBatch(t, cs, "anatomy_build", map[string]any{"kernel_id": "k-1", "states": states})
	assertRouted(t, out, "anatomy_build")
	if out.Result["ok"] != true {
		t.Fatalf("anatomy_build ok = %v, want true (the real FKE anatomy executed)", out.Result["ok"])
	}
	if out.Result["overall"] != "green" {
		t.Fatalf("anatomy_build overall = %v, want green (six declared∧pass)", out.Result["overall"])
	}
}

// TestTransport_TreeAggregateOverHTTP — kernel-tree.tree_aggregate with a tree:{object} payload reaches
// the backend and computes the §109 recursive verdict — a RED part reddens the aggregated whole (the
// real composes engine executed), the object body survived the round-trip.
func TestTransport_TreeAggregateOverHTTP(t *testing.T) {
	d := phase2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "tree_aggregate", map[string]any{
		"tree": map[string]any{
			"nodes": []map[string]any{
				{"layer_id": "whole", "version": "v1", "own_mirror": "GREEN", "activation_threshold": 0},
				{"layer_id": "part", "version": "v1", "own_mirror": "RED", "activation_threshold": 0},
			},
			"edges": []map[string]any{
				{"parent": map[string]any{"id": "whole", "version": "v1"}, "child": map[string]any{"id": "part", "version": "v1"}, "weight": "load-bearing"},
			},
		},
		"root": "whole",
	})
	assertRouted(t, out, "tree_aggregate")
	if out.Result["verdict"] != "RED" {
		t.Fatalf("tree_aggregate verdict = %v, want RED (a red part reddens the whole — the real §109 law executed)", out.Result["verdict"])
	}
}

// TestTransport_Phase2_NeutralizedBuilderUndispatched — the LOAD-BEARING proof. With the grid builder
// NEUTRALIZED (ErrServerNotDispatched), the SAME object payload that routed above now falls to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes are caused by
// the WIRING, not by the registry alone. route_undispatched carries a nil result + nil block_reason.
func TestTransport_Phase2_NeutralizedBuilderUndispatched(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), phase2Builder("grid"))
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "grid_build", map[string]any{
		"truths": []map[string]any{{"id": "k", "rung": "entity", "facet": "F"}},
	})
	if out.Outcome != "route_undispatched" {
		t.Fatalf("neutralized grid outcome = %q, want route_undispatched (the wiring — not the registry — caused the green routes)", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}

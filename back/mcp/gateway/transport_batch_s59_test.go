// transport_batch_s59_test.go — the S59 DISPATCH MIRROR for the ADR 0092 dep-free read batch
// (why-tree · goal-piloting · federation · learn · conscience · arch-fitness). For AT LEAST one
// CHEAP/pure read tool of EACH of the six servers, it drives gateway_call with an args:OBJECT
// payload over the REAL HTTP transport (StreamableHTTPHandler) and asserts the routed call
// REACHES its in-process backend and returns a structured "route" result — NOT route_undispatched
// (the un-wired fallback) and NOT an isError (an input/output-schema rejection).
//
// THE SCAR THIS PINS (S59, the recurring one). A tool whose I/O carries a json.RawMessage reflects
// to the go-sdk as a BYTE-ARRAY schema, so a real HTTP args:{object} payload is REFUSED at input
// validation BEFORE the handler — or a real {object} result is REFUSED at output validation — and
// the front silently falls back to demo (the twin stays alive). Two of the six are exposed to this:
//   - learn.bump_hash takes learn.Target.SpecBody (a json.RawMessage) → learnsrv wraps it as an
//     OBJECT (map[string]any). This test sends spec_body:{object} over HTTP and asserts it routes.
//   - arch-fitness.propose returns a ChangeSet whose Delta.Body is a json.RawMessage → it is
//     DELIBERATELY NOT dispatched (registered un-wired); measure/ratchet/gate (clean object I/O)
//     are. This test dispatches measure over HTTP.
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; every dispatched tool's output is a VALUE
// (WroteKernel false). The dispatch path runs the pure router FIRST — a truth-write never reaches a
// backend (the existing TestTransport_GatewayCallWallOverHTTP pins that).
package main

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	archfitnesssrv "github.com/steph-frtech/aidos/back/mcp/arch-fitness/archfitnesssrv"
	"github.com/steph-frtech/aidos/back/mcp/conscience/consciencesrv"
	"github.com/steph-frtech/aidos/back/mcp/federation/federationsrv"
	goalpilotingsrv "github.com/steph-frtech/aidos/back/mcp/goal-piloting/goalpilotingsrv"
	"github.com/steph-frtech/aidos/back/mcp/learn/learnsrv"
	whytreesrv "github.com/steph-frtech/aidos/back/mcp/why-tree/whytreesrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

// batchDispatcher wires a Dispatcher whose StoreProvider builds the six ADR 0092 dep-free read
// servers in-process (the SAME NewServer the standalone binaries use — no twin). Every other server
// returns ErrServerNotDispatched (route_undispatched → demo), keeping the cutover additive.
func batchDispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), func(_ context.Context, srv string) (*mcp.Server, error) {
		switch srv {
		case "why-tree":
			return whytreesrv.NewServer(), nil
		case "goal-piloting":
			return goalpilotingsrv.NewServer(), nil
		case "federation":
			return federationsrv.NewServer(), nil
		case "learn":
			return learnsrv.NewServer(), nil
		case "conscience":
			return consciencesrv.NewServer(), nil
		case "arch-fitness":
			return archfitnesssrv.NewServer(), nil
		default:
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
	})
}

// callBatch drives gateway_call over the REAL HTTP transport with an args:object payload and
// returns the decoded outcome — the helper used by every sub-test below.
func callBatch(t *testing.T, cs *mcp.ClientSession, tool string, args map[string]any) callOutput {
	t.Helper()
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "gateway_call",
		Arguments: callInput{
			Scope: scopeIn{Identity: "alice", ActiveProject: "proj-a"},
			Tool:  tool,
			Args:  args,
		},
	})
	if err != nil {
		t.Fatalf("CallTool gateway_call %q over HTTP: %v", tool, err)
	}
	if res.IsError {
		t.Fatalf("gateway_call %q rejected by schema validation over HTTP (the S59 byte-array scar?): %+v", tool, res.Content)
	}
	return decode[callOutput](t, res, "gateway_call")
}

// assertRouted fails unless the call was dispatched and executed (outcome "route", a non-nil
// structured result) — NOT route_undispatched (un-wired fallback) and NOT a refusal.
func assertRouted(t *testing.T, out callOutput, tool string) {
	t.Helper()
	if out.Outcome != "route" {
		t.Fatalf("%s over HTTP outcome = %q, want route (dispatched to a REAL backend, not the demo fallback)", tool, out.Outcome)
	}
	if out.Result == nil {
		t.Fatalf("%s routed but returned no structured result (the backend did not execute)", tool)
	}
}

// TestTransport_WhyTreeBuildOverHTTP — why-tree.build with an object payload reaches the backend
// and returns the built tree (ok=true, the rooted cause).
func TestTransport_WhyTreeBuildOverHTTP(t *testing.T) {
	d := batchDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "build", map[string]any{
		"symptom":    "checkout-accept",
		"provenance": "mirror",
		"edges": []map[string]any{
			{"from": map[string]any{"id": "checkout-accept", "version": "v1"}, "to": map[string]any{"id": "createOrder", "version": "v1"}},
			{"from": map[string]any{"id": "createOrder", "version": "v1"}, "to": map[string]any{"id": "Order", "version": "v1"}},
		},
		"reproductions": []map[string]any{
			{"cause_id": "createOrder", "reproduced": true},
			{"cause_id": "Order", "reproduced": true},
		},
		"terminal": map[string]any{"mirror_id": "m1", "reflects_root_cause": "Order"},
	})
	assertRouted(t, out, "build")
	if out.Result["root_cause"] != "Order" {
		t.Fatalf("why-tree build root_cause = %v, want Order (the real backend executed)", out.Result["root_cause"])
	}
}

// TestTransport_GoalPilotCloseOverHTTP — goal-piloting.goal_pilot_close with all four conditions
// holding returns closeable=true (the NON-GAMEABLE gate executed in the real backend).
func TestTransport_GoalPilotCloseOverHTTP(t *testing.T) {
	d := batchDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "goal_pilot_close", map[string]any{
		"red_set":        []string{"Order.discount.fixture"},
		"sensors":        []map[string]any{{"mirror": "Order.discount.fixture", "state": "green"}},
		"prior_green":    "intact",
		"mutation":       0.9,
		"mutation_floor": 0.8,
	})
	assertRouted(t, out, "goal_pilot_close")
	if out.Result["closeable"] != true {
		t.Fatalf("goal_pilot_close closeable = %v, want true (all four conditions hold)", out.Result["closeable"])
	}
}

// TestTransport_FederationFanOutOverHTTP — federation.fan_out projects the per-cell waves; only the
// violating cell is affected.
func TestTransport_FederationFanOutOverHTTP(t *testing.T) {
	d := batchDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "fan_out", map[string]any{
		"policy": map[string]any{
			"name": "pii-forgettable-federation", "scope": "federation_policy",
			"cells": []string{"order", "shipping"}, "predicate": "every_aggregate_with_pii_implements_forgettable",
			"blast_radius": "global", "approval_required": "architecture_owner",
		},
		"violated_cell":  "order",
		"policy_wave_id": "wave-1",
		"cells": []map[string]any{
			{"cell": "order", "violates": true, "bumped": []string{"OrderPII"},
				"edges": []map[string]any{{"link": map[string]any{"kind": "derives_from",
					"from": map[string]any{"id": "order-db", "version": "v1"}, "to": map[string]any{"id": "OrderPII", "version": "v1"}},
					"load_bearing": true, "layer": "projection"}},
				"heads": map[string]any{"OrderPII": "v2"}},
			// A non-violating cell still supplies edges/bumped (the go-sdk infers the non-omitempty
			// slices as REQUIRED input properties — the caller shapes them, the engine ignores them
			// when Violates is false). Empty slices satisfy the schema.
			{"cell": "shipping", "violates": false, "bumped": []string{}, "edges": []map[string]any{}, "heads": map[string]any{}},
		},
	})
	assertRouted(t, out, "fan_out")
	affected, ok := out.Result["affected"].([]any)
	if !ok || len(affected) != 1 || affected[0] != "order" {
		t.Fatalf("fan_out affected = %v, want [order] (only the violating cell)", out.Result["affected"])
	}
}

// TestTransport_LearnBumpHashOverHTTP — the SPEC-BODY-OBJECT scar guard: learn.bump_hash takes a
// Target whose spec_body is an OBJECT (map), which the dispatch-safe learnsrv wrapper accepts. A
// byte-array schema (learn.Target.SpecBody is a json.RawMessage) would reject this object before the
// handler — this goes red on exactly that regression. The reflection moves the address.
func TestTransport_LearnBumpHashOverHTTP(t *testing.T) {
	d := batchDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "bump_hash", map[string]any{
		"target": map[string]any{
			"kind": "operation", "id": "op-createOrder", "version": "v1",
			"spec_body": map[string]any{"kind": "operation", "name": "createOrder"},
		},
		"mirror": map[string]any{
			"mirror_id": "mir-out-of-stock-during-checkout",
			"reflects":  map[string]any{"id": "op-createOrder", "version": "v1"},
		},
	})
	assertRouted(t, out, "bump_hash")
	bump, ok := out.Result["bump"].(map[string]any)
	if !ok {
		t.Fatalf("bump_hash returned no bump object: %+v", out.Result)
	}
	if bump["moved"] != true {
		t.Fatalf("bump_hash moved = %v, want true (the reflection changes the address — the object spec_body survived the HTTP schema)", bump["moved"])
	}
}

// TestTransport_ConscienceReconcileOverHTTP — conscience.reconcile composes a red runner verdict
// into a drift report with one decision card (the real aggregator executed over HTTP).
func TestTransport_ConscienceReconcileOverHTTP(t *testing.T) {
	d := batchDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "reconcile", map[string]any{
		"kernel_id": "checkout",
		"verdicts": []map[string]any{
			{"source": "runner", "facet": "F", "pair": "s2↔s9", "verdict": "red", "drift": "semantic_drift", "detail": "31 vs 30", "blast": "medium"},
		},
	})
	assertRouted(t, out, "reconcile")
	if out.Result["aligned"] != false {
		t.Fatalf("reconcile aligned = %v, want false (a red runner verdict drifts the kernel)", out.Result["aligned"])
	}
	cards, ok := out.Result["cards"].([]any)
	if !ok || len(cards) != 1 {
		t.Fatalf("reconcile cards = %v, want one decision card", out.Result["cards"])
	}
}

// TestTransport_ArchFitnessMeasureOverHTTP — arch-fitness.measure (a CHEAP pure graph metric, the
// dispatched read; propose stays un-dispatched) returns the clean-cut metric over HTTP.
func TestTransport_ArchFitnessMeasureOverHTTP(t *testing.T) {
	d := batchDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "measure", map[string]any{
		"graph": map[string]any{
			"project": "shop",
			"cells":   map[string]any{"checkout": 5, "billing": 3},
			"federation": map[string]any{"contracts": []map[string]any{
				{"a": "checkout", "b": "billing", "honored": true},
			}},
			"edges": []map[string]any{
				{"from": "checkout.place", "from_cell": "checkout", "to": "billing.charge", "to_cell": "billing"},
			},
		},
	})
	assertRouted(t, out, "measure")
	metric, ok := out.Result["metric"].(map[string]any)
	if !ok {
		t.Fatalf("measure returned no metric object: %+v", out.Result)
	}
	if metric["boundary_violations"] != float64(0) {
		t.Fatalf("measure boundary_violations = %v, want 0 (a clean contracted cut)", metric["boundary_violations"])
	}
}

// TestTransport_ArchFitnessProposeNotExposed — `propose` is DELIBERATELY NOT in the gateway
// registry (the RawMessage-body scar + the truth-PROPOSAL door the front never fires synchronously).
// The gateway exposes ONLY its closed surface, so routing propose is refused with unknown_tool
// (GATEWAY_UNKNOWN_TOOL) — NOT route (it never reaches a backend), NOT route_undispatched (which is
// for a registered-but-un-wired server). The front uses its *-data.ts demo for propose. This pins
// the intentional non-exposure: the wall holds and the cutover stays strictly additive.
func TestTransport_ArchFitnessProposeNotExposed(t *testing.T) {
	d := batchDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "propose", map[string]any{
		"graph":        map[string]any{"project": "shop", "cells": map[string]any{"checkout": 5}},
		"baseline":     map[string]any{"project": "shop"},
		"label":        "baseline",
		"parent_phase": "phase-0",
	})
	if out.Outcome != "unknown_tool" {
		t.Fatalf("arch-fitness propose outcome = %q, want unknown_tool (deliberately not exposed — the front demos it)", out.Outcome)
	}
	if out.BlockReason == nil || out.BlockReason.Code != "GATEWAY_UNKNOWN_TOOL" {
		t.Fatalf("propose refusal = %+v, want GATEWAY_UNKNOWN_TOOL", out.BlockReason)
	}
}

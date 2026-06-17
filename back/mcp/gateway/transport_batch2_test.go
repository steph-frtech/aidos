// transport_batch2_test.go — the DISPATCH MIRROR for the ADR 0092 batch-2 dep-free read servers
// (cost-meter · build-console · build-loop · kernel-garden · autonomy · behaviors). For AT LEAST
// one CHEAP/pure read tool of EACH of the six servers, it drives gateway_call with an args:OBJECT
// payload over the REAL HTTP transport (StreamableHTTPHandler) and asserts the routed call REACHES
// its in-process backend and returns a structured "route" result — NOT route_undispatched (the
// un-wired fallback) and NOT an isError (an input/output-schema rejection).
//
// THE SCAR THIS PINS (S59, the recurring one). A tool whose I/O carries a json.RawMessage reflects
// to the go-sdk as a BYTE-ARRAY schema, so a real HTTP args:{object} payload is REFUSED at input
// validation BEFORE the handler — or a real {object} result is REFUSED at output validation — and
// the front silently falls back to demo (the twin stays alive). None of these six carry a
// json.RawMessage in their dispatched I/O (every body is a scalar object; behaviors_attach echoes
// behavior.Policy/Fixture as plain object structs) — this mirror proves an object payload survives
// the round-trip for each, so a future regression that re-introduces a RawMessage body goes red.
//
// THE LOAD-BEARING PROOF (TestTransport_Batch2_NeutralizedBuilderUndispatched). A builder
// NEUTRALIZED in the dispatcher (returns ErrServerNotDispatched) makes the SAME object payload
// route to route_undispatched (the demo fallback), not route — proving the green "route" outcomes
// above are caused by the wiring, not by the registry alone (the cliquet's blind spot is that a
// readVia frontier passes even when the tool does not resolve; this mirror closes it server-side).
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; every dispatched tool's output is a VALUE
// (WroteKernel false). The dispatch path runs the pure router FIRST — a truth-write never reaches a
// backend (the existing TestTransport_GatewayCallWallOverHTTP pins that).
package main

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/autonomy/autonomysrv"
	"github.com/steph-frtech/aidos/back/mcp/behaviors/behaviorssrv"
	buildconsolesrv "github.com/steph-frtech/aidos/back/mcp/build-console/buildconsolesrv"
	buildloopsrv "github.com/steph-frtech/aidos/back/mcp/build-loop/buildloopsrv"
	costmetersrv "github.com/steph-frtech/aidos/back/mcp/cost-meter/costmetersrv"
	kernelgardensrv "github.com/steph-frtech/aidos/back/mcp/kernel-garden/kernelgardensrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

// batch2Builder is the StoreProvider that builds the six ADR 0092 batch-2 dep-free read servers
// in-process (the SAME NewServer the standalone binaries use — no twin). When neutralize is
// non-empty, that one server returns ErrServerNotDispatched instead (the load-bearing proof:
// the same call then falls to route_undispatched).
func batch2Builder(neutralize string) func(context.Context, string) (*mcp.Server, error) {
	return func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv == neutralize {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		switch srv {
		case "cost-meter":
			return costmetersrv.NewServer(), nil
		case "build-console":
			return buildconsolesrv.NewServer(), nil
		case "build-loop":
			return buildloopsrv.NewServer(), nil
		case "kernel-garden":
			return kernelgardensrv.NewServer(), nil
		case "autonomy":
			return autonomysrv.NewServer(), nil
		case "behaviors":
			return behaviorssrv.NewServer(), nil
		default:
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
	}
}

// batch2Dispatcher wires the batch-2 builder (no server neutralized).
func batch2Dispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), batch2Builder(""))
}

// TestTransport_CostMeterCellOverHTTP — cost-meter.cost_meter_cell with an object payload reaches
// the backend and meters the COUNTED sum of the runs against the declared budget.
func TestTransport_CostMeterCellOverHTTP(t *testing.T) {
	d := batch2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "cost_meter_cell", map[string]any{
		"budget": map[string]any{
			"cell_ref": "checkout", "max_ci_minutes": 10, "max_llm_tokens_per_goal": 50000,
			"max_mutation_runtime_seconds": 300, "max_human_review_minutes": 30,
			"expected_risk_reduction": "high",
		},
		"runs": []map[string]any{
			{"red_work_item": "Order.discount", "tokens": 12000, "ci_minutes": 2},
			{"red_work_item": "Order.tax", "tokens": 18000, "ci_minutes": 3},
		},
	})
	assertRouted(t, out, "cost_meter_cell")
	if out.Result["metered_tokens"] != float64(30000) {
		t.Fatalf("cost_meter_cell metered_tokens = %v, want 30000 (the COUNTED sum — the real backend executed)", out.Result["metered_tokens"])
	}
	if out.Result["verdict"] != "within_budget" {
		t.Fatalf("cost_meter_cell verdict = %v, want within_budget", out.Result["verdict"])
	}
}

// TestTransport_BuildConsoleProjectOverHTTP — build-console.buildconsole_project projects a recorded
// run faithfully (faithful_projection true == the projected state EQUALS the recorded run).
func TestTransport_BuildConsoleProjectOverHTTP(t *testing.T) {
	d := batch2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "buildconsole_project", map[string]any{
		"run_id": "run-1", "goal": "goal-checkout", "result": "green",
		"writes":        []map[string]any{{"diff_hash": "d1", "authorised": true}},
		"diff_hashes":   []string{"d1"},
		"green_mirrors": []string{"Order.discount.fixture"},
		"verdict":       "green",
	})
	assertRouted(t, out, "buildconsole_project")
	if out.Result["faithful_projection"] != true {
		t.Fatalf("buildconsole_project faithful_projection = %v, want true (the projection EQUALS the recorded run)", out.Result["faithful_projection"])
	}
}

// TestTransport_BuildLoopTerminateOverHTTP — build-loop.buildloop_terminate closes green when all
// four Stop conditions hold (the non-gameable termination Decision executed in the real backend).
func TestTransport_BuildLoopTerminateOverHTTP(t *testing.T) {
	d := batch2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "buildloop_terminate", map[string]any{
		"goal_id":        "goal-1",
		"red_set":        []string{"Order.discount.fixture"},
		"green_sensors":  []string{"Order.discount.fixture"},
		"prior_broken":   false,
		"mutation":       0.9,
		"mutation_floor": 0.8,
	})
	assertRouted(t, out, "buildloop_terminate")
	if out.Result["verdict"] != "green" {
		t.Fatalf("buildloop_terminate verdict = %v, want green (all four Stop conditions hold)", out.Result["verdict"])
	}
}

// TestTransport_KernelGardenTendOverHTTP — kernel-garden.garden_tend_project scans a project's slice
// and surfaces an orphan_mirror as a debt item (the real §82.4 scan executed over HTTP).
func TestTransport_KernelGardenTendOverHTTP(t *testing.T) {
	d := batch2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "garden_tend_project", map[string]any{
		"project_ref": "proj-a", "kernel_head": "head-1",
		"truths": []map[string]any{{"id": "Order", "version": "v1", "live": true}},
		// A mirror reflecting a truth NOT in the live set is an orphan_mirror.
		"mirrors": []map[string]any{
			{"id": "m-orphan", "reflects_layer_id": "Ghost", "reflects_version": "v1", "test_kind": "fixture", "liveness": "alive"},
		},
	})
	assertRouted(t, out, "garden_tend_project")
	if out.Result["count"] == float64(0) {
		t.Fatalf("garden_tend_project count = %v, want >0 (the orphan mirror is debt — the real scan executed)", out.Result["count"])
	}
}

// TestTransport_AutonomyEnforceOverHTTP — autonomy.enforce REFUSES an action whose required level
// exceeds the declared level (fail-closed, AGENT_AUTONOMY_EXCEEDED — the real ladder executed).
func TestTransport_AutonomyEnforceOverHTTP(t *testing.T) {
	d := batch2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "enforce", map[string]any{
		"declared": 2, "action": "merge", "required": 5, "critical": false,
	})
	assertRouted(t, out, "enforce")
	if out.Result["allowed"] != false {
		t.Fatalf("enforce allowed = %v, want false (required 5 > declared 2 is fail-closed)", out.Result["allowed"])
	}
	if out.Result["code"] != "AGENT_AUTONOMY_EXCEEDED" {
		t.Fatalf("enforce code = %v, want AGENT_AUTONOMY_EXCEEDED", out.Result["code"])
	}
}

// TestTransport_BehaviorsBrowseOverHTTP — behaviors.behaviors_browse lists a project's library
// records in canonical order (the real project-scoped browse executed over HTTP).
func TestTransport_BehaviorsBrowseOverHTTP(t *testing.T) {
	d := batch2Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "behaviors_browse", map[string]any{
		"project_id": "proj-a",
		"records": []map[string]any{
			{"kind": "ownable", "owner": "alice", "version": 1, "labels": map[string]any{"fr": "Propriété"}},
		},
	})
	assertRouted(t, out, "behaviors_browse")
	if out.Result["ok"] != true {
		t.Fatalf("behaviors_browse ok = %v, want true", out.Result["ok"])
	}
	if out.Result["count"] != float64(1) {
		t.Fatalf("behaviors_browse count = %v, want 1 (the one live record)", out.Result["count"])
	}
}

// TestTransport_Batch2_NeutralizedBuilderUndispatched — the LOAD-BEARING proof. With the cost-meter
// builder NEUTRALIZED (ErrServerNotDispatched), the SAME object payload that routed above now falls
// to route_undispatched (the demo fallback) — proving the green "route" outcomes are caused by the
// WIRING, not by the registry alone. route_undispatched carries a nil result + nil block_reason
// (the front then reads its *-data.ts demo). This closes the cliquet's blind spot server-side.
func TestTransport_Batch2_NeutralizedBuilderUndispatched(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), batch2Builder("cost-meter"))
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "cost_meter_cell", map[string]any{
		"budget": map[string]any{
			"cell_ref": "checkout", "max_ci_minutes": 10, "max_llm_tokens_per_goal": 50000,
			"max_mutation_runtime_seconds": 300, "max_human_review_minutes": 30,
			"expected_risk_reduction": "high",
		},
		"runs": []map[string]any{{"red_work_item": "Order.discount", "tokens": 12000, "ci_minutes": 2}},
	})
	if out.Outcome != "route_undispatched" {
		t.Fatalf("neutralized cost-meter outcome = %q, want route_undispatched (the wiring — not the registry — caused the green routes)", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}

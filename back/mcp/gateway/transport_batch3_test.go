// transport_batch3_test.go — the DISPATCH MIRROR for the ADR 0092 batch-3 servers
// (billing · dsl-editor · templates). For AT LEAST one CHEAP/pure read tool of EACH of the three
// servers, it drives gateway_call with an args:OBJECT payload over the REAL HTTP transport
// (StreamableHTTPHandler) and asserts the routed call REACHES its in-process backend and returns a
// structured "route" result — NOT route_undispatched (the un-wired fallback) and NOT an isError
// (an input/output-schema rejection).
//
// THE SCAR THIS PINS (S59, the recurring one). A tool whose I/O carries a json.RawMessage reflects
// to the go-sdk as a BYTE-ARRAY schema, so a real HTTP args:{object} payload is REFUSED at input
// validation BEFORE the handler — or a real {object} result is REFUSED at output validation — and
// the front silently falls back to demo (the twin stays alive). billing/templates carry NO
// json.RawMessage in their dispatched I/O (every body is a scalar object). dsl-editor's DslDoc.Body
// and Parsed.Canonical ARE json.RawMessage — dsleditorsrv WRAPS them as OBJECT (map[string]any)
// schemas, so TestTransport_DslParseOverHTTP sends a `body:{object}` payload AND reads back a
// `canonical:{object}`, proving the wrap survives the round-trip (a future regression that
// un-wraps either side goes red here).
//
// THE LOAD-BEARING PROOF (TestTransport_Batch3_NeutralizedBuilderUndispatched). A builder
// NEUTRALIZED in the dispatcher (returns ErrServerNotDispatched) makes the SAME object payload
// route to route_undispatched (the demo fallback), not route — proving the green "route" outcomes
// above are caused by the WIRING, not by the registry alone (the cliquet's blind spot is that a
// readVia frontier passes even when the tool does not resolve; this mirror closes it server-side).
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; every dispatched tool's output is a VALUE
// (WroteKernel false). The dispatch path runs the pure router FIRST — a truth-write never reaches a
// backend (the existing TestTransport_GatewayCallWallOverHTTP pins that). truth-approval is NOT
// fronted — its propose/approve/apply tools resolve to unknown_tool (the /truth-approval panel stays
// the propose → ChangeSet door), so there is no batch-3 dispatch for it (TestTransport_TruthApproval
// NotFronted pins the unknown_tool outcome).
package main

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/billing/billingsrv"
	dsleditorsrv "github.com/steph-frtech/aidos/back/mcp/dsl-editor/dsleditorsrv"
	"github.com/steph-frtech/aidos/back/mcp/templates/templatessrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

// batch3Builder is the StoreProvider that builds the three ADR 0092 batch-3 dep-free read servers
// in-process (the SAME NewServer the standalone binaries use — no twin). When neutralize is
// non-empty, that one server returns ErrServerNotDispatched instead (the load-bearing proof: the
// same call then falls to route_undispatched).
func batch3Builder(neutralize string) func(context.Context, string) (*mcp.Server, error) {
	return func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv == neutralize {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		switch srv {
		case "billing":
			return billingsrv.NewServer(), nil
		case "dsl-editor":
			return dsleditorsrv.NewServer(), nil
		case "templates":
			return templatessrv.NewServer(), nil
		default:
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
	}
}

// batch3Dispatcher wires the batch-3 builder (no server neutralized).
func batch3Dispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), batch3Builder(""))
}

// TestTransport_BillingMeterOverHTTP — billing.billing_meter with an object payload reaches the
// backend and COUNTS the runs' tokens (the deterministic monotone fold — the real backend executed).
func TestTransport_BillingMeterOverHTTP(t *testing.T) {
	d := batch3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "billing_meter", map[string]any{
		"account": "acct-1",
		"runs": []map[string]any{
			{"account": "acct-1", "project": "p1", "run_id": "r1", "tokens": 30000, "build_minutes": 2},
			{"account": "acct-1", "project": "p2", "run_id": "r2", "tokens": 70000, "build_minutes": 4},
		},
	})
	assertRouted(t, out, "billing_meter")
	usage, ok := out.Result["usage"].(map[string]any)
	if !ok {
		t.Fatalf("billing_meter result has no usage object: %+v", out.Result)
	}
	if usage["llm_tokens"] != float64(100000) {
		t.Fatalf("billing_meter usage.llm_tokens = %v, want 100000 (the COUNTED sum — the real backend executed)", usage["llm_tokens"])
	}
}

// TestTransport_BillingPlansOverHTTP — billing.billing_plans (no input) reaches the backend and
// returns the closed four-plan ladder (the DECLARED data, §8 — the real backend executed).
func TestTransport_BillingPlansOverHTTP(t *testing.T) {
	d := batch3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "billing_plans", map[string]any{})
	assertRouted(t, out, "billing_plans")
	plans, ok := out.Result["plans"].([]any)
	if !ok || len(plans) != 4 {
		t.Fatalf("billing_plans plans = %v, want the closed 4-plan ladder", out.Result["plans"])
	}
}

// TestTransport_DslParseOverHTTP — dsl-editor.dsl_parse with a `body:{object}` payload reaches the
// backend and returns a `canonical:{object}` — proving the S59 RawMessage-scar wrap survives BOTH
// the input AND output round-trip over HTTP (DslDoc.Body and Parsed.Canonical are OBJECT schemas).
func TestTransport_DslParseOverHTTP(t *testing.T) {
	d := batch3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "dsl_parse", map[string]any{
		"kind": "policy", "name": "canPlaceOrder",
		"body": map[string]any{
			"kind": "policy", "name": "canPlaceOrder", "scope": "OPERATION", "target": "createOrder",
			"effect": "ALLOW", "rule": map[string]any{"kind": "exists", "sel": "$.auth"},
		},
	})
	assertRouted(t, out, "dsl_parse")
	if out.Result["ok"] != true {
		t.Fatalf("dsl_parse ok = %v, want true (a well-formed typed policy parses — the real backend executed)", out.Result["ok"])
	}
	canon, ok := out.Result["canonical"].(map[string]any)
	if !ok || len(canon) == 0 {
		t.Fatalf("dsl_parse canonical = %v, want a non-empty OBJECT (the S59 RawMessage-scar wrap survived the HTTP round-trip)", out.Result["canonical"])
	}
}

// TestTransport_TemplatesInstantiateOverHTTP — templates.templates_instantiate with an object payload
// reaches the backend and returns a DRY-RUN starter (wrote_kernel false — the wall; the real backend
// executed).
func TestTransport_TemplatesInstantiateOverHTTP(t *testing.T) {
	d := batch3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "templates_instantiate", map[string]any{
		"id": "ecommerce", "target": "shop-app",
	})
	assertRouted(t, out, "templates_instantiate")
	if out.Result["ok"] != true {
		t.Fatalf("templates_instantiate ok = %v, want true (the real backend executed)", out.Result["ok"])
	}
	if out.Result["wrote_kernel"] != false {
		t.Fatalf("templates_instantiate wrote_kernel = %v, want false (the wall — instantiate is a dry-run value)", out.Result["wrote_kernel"])
	}
	if out.Result["starter_id"] == "" || out.Result["starter_id"] == nil {
		t.Fatalf("templates_instantiate must content-address the starter: %+v", out.Result)
	}
}

// TestTransport_TruthApprovalNotFronted — truth-approval is DELIBERATELY NOT fronted (its
// propose/approve/apply tools DECIDE/GATE a truth-write and ARE the propose → ChangeSet door). A
// routed truth_propose therefore resolves to unknown_tool (NOT route, NOT route_undispatched) — the
// /truth-approval panel stays its propose → ChangeSet door, never a readVia. This pins the SKIP
// decision (ADR 0092 batch-3 GRILL): registering it would be wrong, leaving it unknown is correct.
func TestTransport_TruthApprovalNotFronted(t *testing.T) {
	d := batch3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "truth_propose", map[string]any{"actor": "alice"})
	if out.Outcome != "unknown_tool" {
		t.Fatalf("truth_propose outcome = %q, want unknown_tool (truth-approval is the propose → ChangeSet door, never fronted as a below-line read)", out.Outcome)
	}
}

// TestTransport_Batch3_NeutralizedBuilderUndispatched — the LOAD-BEARING proof. With the dsl-editor
// builder NEUTRALIZED (ErrServerNotDispatched), the SAME object payload that routed above now falls
// to route_undispatched (the demo fallback) — proving the green "route" outcomes are caused by the
// WIRING, not by the registry alone. route_undispatched carries a nil result + nil block_reason (the
// front then reads its *-data.ts demo). This closes the cliquet's blind spot server-side, and pins
// the dsl-editor wrap as load-bearing (un-wiring it degrades honestly, never silently mis-routes).
func TestTransport_Batch3_NeutralizedBuilderUndispatched(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), batch3Builder("dsl-editor"))
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "dsl_parse", map[string]any{
		"kind": "policy", "name": "canPlaceOrder",
		"body": map[string]any{
			"kind": "policy", "name": "canPlaceOrder", "scope": "OPERATION", "target": "createOrder",
			"effect": "ALLOW", "rule": map[string]any{"kind": "exists", "sel": "$.auth"},
		},
	})
	if out.Outcome != "route_undispatched" {
		t.Fatalf("neutralized dsl-editor outcome = %q, want route_undispatched (the wiring — not the registry — caused the green routes)", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}

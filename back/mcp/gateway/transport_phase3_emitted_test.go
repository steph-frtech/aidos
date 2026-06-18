// transport_phase3_emitted_test.go — the DISPATCH MIRROR for the ADR 0092 PHASE-3 emitted-app +
// library READ servers (blob-attribute · deploy · ai-lab · hono-emitter · mirror-library ·
// ops-observability). For AT LEAST one CHEAP/pure read tool of EACH of the six servers, it drives
// gateway_call with an args:OBJECT payload over the REAL HTTP transport (StreamableHTTPHandler) and
// asserts the routed call REACHES its in-process backend and returns a structured "route" result —
// NOT route_undispatched (the un-wired fallback) and NOT an isError (an input/output-schema
// rejection, the S59 byte-array scar).
//
// THE SIX SERVERS (the demo-twin panels whose pure reads flip to the Go engine):
//
//	blob-attribute (S72) — blob_address content-addresses a blob/file attribute node (/blob-attribute).
//	deploy (S96)         — gate is the « done is computed » deployable verdict over a phase (/deploy).
//	ai-lab (FK11)        — build_cockpit composes the FK09 report into the cockpit state (/ai-lab).
//	hono-emitter (S87)   — server_hash content-addresses the emitted Hono server spec (/hono-emitter).
//	mirror-library (S70) — library_list_by_app groups the user's mirrors by app (/mirror-library).
//	ops-observability(S92)— ops_dashboard aggregates an app's OTel signals into its panel (/ops-observability).
//
// THE SCAR THIS PINS (S59, the recurring one). A tool whose I/O carries a json.RawMessage reflects to
// the go-sdk as a BYTE-ARRAY schema, so a real HTTP args:{object} payload is REFUSED at input
// validation BEFORE the handler — and the front silently falls back to demo (the twin stays alive).
// NONE of the six tools carries json.RawMessage in its I/O (every body is a scalar object — a blob
// node, a deploy gate verdict, a cockpit state, a server-spec hash, a mirror library, an ops
// dashboard; the emitted Hono/Pulumi bytes are STRING fields, not byte-arrays), so they dispatch over HTTP.
//
// THE LOAD-BEARING PROOF (TestTransport_Phase3_NeutralizedBuilderUndispatched). A builder NEUTRALIZED
// in the dispatcher (returns ErrServerNotDispatched) makes the SAME object payload route to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes are caused by
// the WIRING, not by the registry alone (the cliquet's blind spot is that a readVia frontier passes
// even when the tool does not resolve; this mirror closes it server-side).
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; every dispatched tool's output is a VALUE
// (WroteKernel false — the six are PURE reads/projections). The dispatch path runs the pure router
// FIRST — a truth-write never reaches a backend (TestTransport_GatewayCallWallOverHTTP).
package main

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	ailabsrv "github.com/steph-frtech/aidos/back/mcp/ai-lab/ailabsrv"
	blobattributesrv "github.com/steph-frtech/aidos/back/mcp/blob-attribute/blobattributesrv"
	deploysrv "github.com/steph-frtech/aidos/back/mcp/deploy/deploysrv"
	honoemittersrv "github.com/steph-frtech/aidos/back/mcp/hono-emitter/honoemittersrv"
	mirrorlibrarysrv "github.com/steph-frtech/aidos/back/mcp/mirror-library/mirrorlibrarysrv"
	opsobservabilitysrv "github.com/steph-frtech/aidos/back/mcp/ops-observability/opsobservabilitysrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

// phase3Builder is the StoreProvider that builds the six ADR 0092 phase-3 servers in-process (the
// SAME NewServer the standalone binaries use — no twin). When neutralize is non-empty, that one
// server returns ErrServerNotDispatched instead (the load-bearing proof).
func phase3Builder(neutralize string) func(context.Context, string) (*mcp.Server, error) {
	return func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv == neutralize {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		switch srv {
		case "blob-attribute":
			return blobattributesrv.NewServer(), nil
		case "deploy":
			return deploysrv.NewServer(), nil
		case "ai-lab":
			return ailabsrv.NewServer(), nil
		case "hono-emitter":
			return honoemittersrv.NewServer(), nil
		case "mirror-library":
			return mirrorlibrarysrv.NewServer(), nil
		case "ops-observability":
			return opsobservabilitysrv.NewServer(), nil
		default:
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
	}
}

func phase3Dispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), phase3Builder(""))
}

// TestTransport_BlobAddressOverHTTP — blob-attribute.blob_address with a blob:{object} payload
// reaches the backend and content-addresses the node (ok=true, a non-empty id) — the real S72
// blob engine executed, the object body survived the HTTP round-trip.
func TestTransport_BlobAddressOverHTTP(t *testing.T) {
	d := phase3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "blob_address", map[string]any{
		"blob": map[string]any{
			"name":         "avatar",
			"allowed_mime": []string{"image/png", "image/jpeg"},
			"max_bytes":    1 << 20,
			"required":     true,
		},
	})
	assertRouted(t, out, "blob_address")
	if out.Result["ok"] != true {
		t.Fatalf("blob_address ok = %v, want true (the real S72 blob engine executed)", out.Result["ok"])
	}
	if id, _ := out.Result["id"].(string); id == "" {
		t.Fatalf("blob_address returned no content address: %+v", out.Result)
	}
}

// TestTransport_DeployGateOverHTTP — deploy.gate with a phase:{object} + gate:{object} payload
// reaches the backend and computes the « done is computed » verdict — the real S96 deploy gate
// executed, the object body survived the round-trip.
func TestTransport_DeployGateOverHTTP(t *testing.T) {
	d := phase3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "gate", map[string]any{
		"phase": map[string]any{"cut": map[string]any{}, "sensor_status": []any{}, "stable": false, "reasons": []string{"phase not stable"}},
		"gate":  map[string]any{"mutation_score": 0, "mutation_threshold": 80, "monster_count": 0},
	})
	assertRouted(t, out, "gate")
	if out.Result["ok"] != true {
		t.Fatalf("deploy gate ok = %v, want true (the real S96 deploy gate executed)", out.Result["ok"])
	}
	// A non-stable / under-threshold phase is NOT deployable — the verdict is COMPUTED, never declared.
	if out.Result["deployable"] != false {
		t.Fatalf("deploy gate deployable = %v, want false (an empty phase is not stable)", out.Result["deployable"])
	}
}

// TestTransport_DeployPlanOverHTTP — deploy.plan (the tool the /deploy panel reads, ADR 0092 flip)
// with a STABLE phase + surface + program object payload reaches the backend and builds the
// content-addressed DeployPlan — the real S96 deploy planner executed over the HTTP round-trip
// (the object body survived). The plan's id/emitted_app_hash are non-empty (the re-emission ran);
// a non-stable phase would refuse PHASE_NOT_STABLE (proved by the gate test above). This pins the
// PANEL's actual tool, not just a sibling — anti-hollow.
func TestTransport_DeployPlanOverHTTP(t *testing.T) {
	d := phase3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	// The emitted Pulumi program bytes ([]byte → a JSON ARRAY of numbers, NOT a base64 string:
	// the SDK schema wants "null, array" — the byte-array transport discipline, S59 scar avoided).
	// A non-empty program is required (the Go validateSurface refuses an empty one).
	progBytes := make([]any, 0)
	for _, b := range []byte("export function program() {}\n") {
		progBytes = append(progBytes, int(b))
	}
	out := callBatch(t, cs, "plan", map[string]any{
		"input": map[string]any{
			// A phases.StablePhase — NO top-level id (additionalProperties:false); the deploy URL
			// is derived from the cut's content address (phase_hash in the output).
			"phase": map[string]any{
				"cut":           map[string]any{},
				"sensor_status": []any{},
				"stable":        true,
				"reasons":       []string{},
			},
			"gate": map[string]any{"mutation_score": 0.9, "mutation_threshold": 0.8, "monster_count": 0},
			"surface": map[string]any{
				"project":            "shop",
				"server_bundle_hash": "srv-shop-001",
				"front_bundle_hash":  "frt-shop-001",
				"infra_hash":         "inf-shop-001",
				"datastore_hash":     "dst-shop-001",
			},
			"program":     map[string]any{"path": "gen/shop/infra/index.ts", "target": "ts-pulumi", "bytes": progBytes, "source_hash": "", "output_hash": "", "protected": false},
			"change":      map[string]any{"project": "shop", "kind": ""},
			"domain_root": "",
		},
	})
	assertRouted(t, out, "plan")
	if out.Result["ok"] != true {
		t.Fatalf("deploy plan ok = %v, want true (the real S96 deploy planner executed over a STABLE phase)", out.Result["ok"])
	}
	plan, _ := out.Result["plan"].(map[string]any)
	if plan == nil {
		t.Fatalf("deploy plan routed but returned no plan (the S96 backend did not execute): %+v", out.Result)
	}
	if id, _ := plan["id"].(string); id == "" {
		t.Fatalf("deploy plan returned no content address (id): %+v", plan)
	}
	if h, _ := plan["emitted_app_hash"].(string); h == "" {
		t.Fatalf("deploy plan returned no emitted_app_hash (the phase was not re-emitted): %+v", plan)
	}
}

// TestTransport_AiLabBuildCockpitOverHTTP — ai-lab.build_cockpit with a kernel_id payload reaches
// the backend and composes the FK09 conscience report into the cockpit state — the real FK11 cockpit
// engine executed, the object body survived the round-trip.
func TestTransport_AiLabBuildCockpitOverHTTP(t *testing.T) {
	d := phase3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "build_cockpit", map[string]any{
		"kernel_id":      "k-1",
		"autonomy_level": 2,
	})
	assertRouted(t, out, "build_cockpit")
	if out.Result == nil {
		t.Fatalf("build_cockpit routed but returned no cockpit state (the FK11 backend did not execute)")
	}
}

// TestTransport_HonoServerHashOverHTTP — hono-emitter.server_hash with a spec:{object} payload reaches
// the backend and content-addresses the server spec — the real S87 emitter executed, the object body
// survived the round-trip (Artifact bytes are STRING fields, not a json.RawMessage byte-array).
func TestTransport_HonoServerHashOverHTTP(t *testing.T) {
	d := phase3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "server_hash", map[string]any{
		"spec": map[string]any{"Project": "demoshop", "Ops": []any{}, "Entities": []string{"Order"}, "WebDir": ""},
	})
	assertRouted(t, out, "server_hash")
	if out.Result["ok"] != true {
		t.Fatalf("server_hash ok = %v, want true (the real S87 emitter executed)", out.Result["ok"])
	}
	if h, _ := out.Result["hash"].(string); h == "" {
		t.Fatalf("server_hash returned no content address: %+v", out.Result)
	}
}

// TestTransport_MirrorLibraryListByAppOverHTTP — mirror-library.library_list_by_app with a
// library:{object} payload reaches the backend and groups the mirrors by app — the real S70 library
// engine executed, the object body survived the round-trip.
func TestTransport_MirrorLibraryListByAppOverHTTP(t *testing.T) {
	d := phase3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "library_list_by_app", map[string]any{
		"library": map[string]any{"layers": []any{}, "mirrors": []any{}},
	})
	assertRouted(t, out, "library_list_by_app")
	if out.Result["ok"] != true {
		t.Fatalf("library_list_by_app ok = %v, want true (the real S70 library engine executed)", out.Result["ok"])
	}
}

// TestTransport_OpsDashboardOverHTTP — ops-observability.ops_dashboard with a project_id + signals
// payload reaches the backend and aggregates the ops panel — the real S92 ops engine executed, the
// object body survived the round-trip. WroteKernel is false (DISTINCT from the E12 on-ramp).
func TestTransport_OpsDashboardOverHTTP(t *testing.T) {
	d := phase3Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "ops_dashboard", map[string]any{
		"project_id": "demoshop",
		"signals": []map[string]any{
			{"project_id": "demoshop", "kind": "span", "route": "POST /orders", "duration_ms": 12, "severity": "info", "body": "", "is_error": false, "at_unix_nano": 1},
		},
	})
	assertRouted(t, out, "ops_dashboard")
	if out.Result["ok"] != true {
		t.Fatalf("ops_dashboard ok = %v, want true (the real S92 ops engine executed)", out.Result["ok"])
	}
	if out.Result["wrote_kernel"] != false {
		t.Fatalf("ops_dashboard wrote_kernel = %v, want false (the E12 RealityMirror is the only Kernel on-ramp)", out.Result["wrote_kernel"])
	}
}

// TestTransport_Phase3_NeutralizedBuilderUndispatched — the LOAD-BEARING proof. With the
// blob-attribute builder NEUTRALIZED (ErrServerNotDispatched), the SAME object payload that routed
// above now falls to route_undispatched (the demo fallback), not route — proving the green "route"
// outcomes are caused by the WIRING, not by the registry alone. route_undispatched carries a nil
// result + nil block_reason.
func TestTransport_Phase3_NeutralizedBuilderUndispatched(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), phase3Builder("blob-attribute"))
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "blob_address", map[string]any{
		"blob": map[string]any{"name": "avatar", "allowed_mime": []string{"image/png"}, "max_bytes": 1024},
	})
	if out.Outcome != "route_undispatched" {
		t.Fatalf("neutralized blob-attribute outcome = %q, want route_undispatched (the wiring — not the registry — caused the green routes)", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}

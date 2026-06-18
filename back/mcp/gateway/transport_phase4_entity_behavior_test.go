// transport_phase4_entity_behavior_test.go — the DISPATCH MIRROR for the ADR 0092 PHASE-4
// entity/behavior/mirror/emit READ servers (entity-relation · behavior-capture · behavior-expander ·
// mirror-watch · front-emitter). For AT LEAST one CHEAP/pure read tool of EACH of the five servers,
// it drives gateway_call with an args:OBJECT payload over the REAL HTTP transport
// (StreamableHTTPHandler) and asserts the routed call REACHES its in-process backend and returns a
// structured "route" result — NOT route_undispatched (the un-wired fallback) and NOT an isError (an
// input/output-schema rejection, the S59 byte-array scar).
//
// preview (S94) is DELIBERATELY ABSENT from this batch: its `plan`/`check_served` tools collide by name
// with the already-live `deploy` server in the flat gateway registry (a duplicate tool name shadows the
// earlier owner). Fronting it would break deploy (§9 anti-overwrite); the /preview panel stays pure-demo
// until preview's tools are uniquely namespaced (an OpenQuestion).
//
// THE FIVE SERVERS (the demo-twin panels whose pure reads flip to the Go engine):
//
//	entity-relation (S71)  — relation_resolve resolves a relation node against the declared entity set.
//	behavior-capture (S67) — behavior_library surfaces the reusable behaviours catalogue at capture.
//	behavior-expander (S76)— behavior_expand runs the ONE authoritative dry-run Expand.
//	mirror-watch (S69)     — watch_run runs a materialized mirror against a code-probe → red/green stream.
//	front-emitter (S93)    — front_hash content-addresses the emitted front spec (Artifact.Bytes is a
//	                         []byte number-array, NOT a json.RawMessage — the S59 byte-array scar avoided).
//
// THE SCAR THIS PINS (S59, the recurring one). A tool whose I/O carries a json.RawMessage reflects to the
// go-sdk as a BYTE-ARRAY (base64-string) schema, so a real HTTP args:{object} payload is REFUSED at input
// validation BEFORE the handler — and the front silently falls back to demo (the twin stays alive). The
// dispatched phase-4 read tools carry NO json.RawMessage in their I/O (a ref.Relation, a behaviours
// catalogue, a behavior.Expansion of scalar pieces, a watch run-stream, a preview plan, a front-spec
// hash). The OMITTED tools DO carry the scar or are a truth-proposal — behavior_propose returns a DRAFT
// ChangeSet (the propose → ChangeSet door) and watch_materialize's Proposal input EMBEDS a
// changeset.ChangeSet whose Delta.Body is a json.RawMessage — so both are DELIBERATELY NOT dispatched
// (TestTransport_Phase4_OmittedNotFronted pins they resolve to unknown_tool), exactly like arch-fitness
// `propose`. Those panels keep their own voie propre.
//
// THE LOAD-BEARING PROOF (TestTransport_Phase4_NeutralizedBuilderUndispatched). A builder NEUTRALIZED in
// the dispatcher (returns ErrServerNotDispatched) makes the SAME object payload route to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes above are caused
// by the WIRING, not by the registry alone (the cliquet's blind spot is that a readVia frontier passes
// even when the tool does not resolve; this mirror closes it server-side).
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; every dispatched tool's output is a VALUE
// (WroteKernel false — the six are PURE reads/projections). The dispatch path runs the pure router FIRST
// — a truth-write never reaches a backend (TestTransport_GatewayCallWallOverHTTP).
package main

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	behaviorcapturesrv "github.com/steph-frtech/aidos/back/mcp/behavior-capture/behaviorcapturesrv"
	behaviorexpandersrv "github.com/steph-frtech/aidos/back/mcp/behavior-expander/behaviorexpandersrv"
	entityrelationsrv "github.com/steph-frtech/aidos/back/mcp/entity-relation/entityrelationsrv"
	frontemittersrv "github.com/steph-frtech/aidos/back/mcp/front-emitter/frontemittersrv"
	mirrorwatchsrv "github.com/steph-frtech/aidos/back/mcp/mirror-watch/mirrorwatchsrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

// phase4Builder is the StoreProvider that builds the six ADR 0092 phase-4 servers in-process (the SAME
// NewServer the standalone binaries use — no twin). When neutralize is non-empty, that one server
// returns ErrServerNotDispatched instead (the load-bearing proof: the same call then falls to
// route_undispatched).
func phase4Builder(neutralize string) func(context.Context, string) (*mcp.Server, error) {
	return func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv == neutralize {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		switch srv {
		case "entity-relation":
			return entityrelationsrv.NewServer(), nil
		case "behavior-capture":
			return behaviorcapturesrv.NewServer(), nil
		case "behavior-expander":
			return behaviorexpandersrv.NewServer(), nil
		case "mirror-watch":
			return mirrorwatchsrv.NewServer(), nil
		case "front-emitter":
			return frontemittersrv.NewServer(), nil
		default:
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
	}
}

func phase4Dispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), phase4Builder(""))
}

// TestTransport_RelationResolveOverHTTP — entity-relation.relation_resolve with a relation:{object} +
// known:[...] payload reaches the backend and resolves the target (ok=true) — the real S71 ref engine
// executed, the object body survived the HTTP round-trip.
func TestTransport_RelationResolveOverHTTP(t *testing.T) {
	d := phase4Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "relation_resolve", map[string]any{
		"relation": map[string]any{
			"name":        "customer",
			"target":      "Customer",
			"cardinality": "1-N",
			"semantic":    "fk",
			"required":    true,
		},
		"known": []string{"Order", "Customer"},
	})
	assertRouted(t, out, "relation_resolve")
	if out.Result["ok"] != true {
		t.Fatalf("relation_resolve ok = %v, want true (a declared target resolves; the real S71 engine executed)", out.Result["ok"])
	}
}

// TestTransport_BehaviorLibraryOverHTTP — behavior-capture.behavior_library with an empty object payload
// reaches the backend and returns the reusable behaviours catalogue (a non-empty list) — the real S67
// engine executed over the HTTP round-trip.
func TestTransport_BehaviorLibraryOverHTTP(t *testing.T) {
	d := phase4Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "behavior_library", map[string]any{})
	assertRouted(t, out, "behavior_library")
	behs, _ := out.Result["behaviors"].([]any)
	if len(behs) == 0 {
		t.Fatalf("behavior_library returned no catalogue (the real S67 engine did not execute): %+v", out.Result)
	}
}

// TestTransport_BehaviorExpandOverHTTP — behavior-expander.behavior_expand with a behavior+entity object
// payload reaches the backend and runs the ONE authoritative dry-run Expand (ok=true, wrote_kernel false,
// a non-empty piece set) — the real S76 engine executed, the object body survived the round-trip.
func TestTransport_BehaviorExpandOverHTTP(t *testing.T) {
	d := phase4Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "behavior_expand", map[string]any{
		"behavior": "ownable",
		"entity":   "Order",
	})
	assertRouted(t, out, "behavior_expand")
	if out.Result["ok"] != true {
		t.Fatalf("behavior_expand ok = %v, want true (the real S76 Expand executed)", out.Result["ok"])
	}
	if out.Result["wrote_kernel"] != false {
		t.Fatalf("behavior_expand wrote_kernel = %v, want false (the wall — a dry-run expansion never writes)", out.Result["wrote_kernel"])
	}
}

// TestTransport_WatchRunOverHTTP — mirror-watch.watch_run with a materialized:{object} payload + an
// ABSENT code-probe reaches the backend and returns the live stream marked RED (watch it fail) — the
// real S69 engine executed, the MaterializedMirror object survived the round-trip (no json.RawMessage).
func TestTransport_WatchRunOverHTTP(t *testing.T) {
	d := phase4Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "watch_run", map[string]any{
		"materialized": map[string]any{
			"mirror_id":           "m-1",
			"project_id":          "proj-a",
			"reflects":            map[string]any{"layer_id": "createOrder", "version": "v1"},
			"target_runner":       "godog",
			"shape":               "gherkin",
			"materialized_source": "Feature: checkout\n",
		},
		"code_present": false,
	})
	assertRouted(t, out, "watch_run")
	if out.Result["ok"] != true {
		t.Fatalf("watch_run ok = %v, want true (the real S69 engine executed)", out.Result["ok"])
	}
	// An ABSENT code-probe ⇒ the mirror fails (watch it fail) — the verdict is COMPUTED, never declared.
	if out.Result["red"] != true {
		t.Fatalf("watch_run red = %v, want true (absent code ⇒ RED — watch it fail)", out.Result["red"])
	}
}

// TestTransport_FrontHashOverHTTP — front-emitter.front_hash with a spec:{object} payload reaches the
// backend and content-addresses the front spec (ok=true, a non-empty hash) — the real S93 emitter
// executed, the object body survived the round-trip.
func TestTransport_FrontHashOverHTTP(t *testing.T) {
	d := phase4Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	// frontemit.FrontSpec fields are UNTAGGED → the JSON keys are the capitalized Go field names
	// (Project/Entities/Controls; ControlModel: Name/View/Label/Operation/Fixtures). A spec with no
	// entities AND no controls is refused (ErrNoContent), so we pin one control (the verticale's button).
	out := callBatch(t, cs, "front_hash", map[string]any{
		"spec": map[string]any{
			"Project":  "demoshop",
			"Entities": []any{},
			"Controls": []any{
				map[string]any{"Name": "create-order-button", "View": "orders", "Label": "controls.createOrder", "Operation": "createOrder", "Fixtures": []any{}},
			},
		},
	})
	assertRouted(t, out, "front_hash")
	if out.Result["ok"] != true {
		t.Fatalf("front_hash ok = %v, want true (the real S93 emitter executed)", out.Result["ok"])
	}
	if h, _ := out.Result["hash"].(string); h == "" {
		t.Fatalf("front_hash returned no content address: %+v", out.Result)
	}
}

// TestTransport_Phase4_OmittedNotFronted — the OMITTED tools resolve to unknown_tool, never a readVia.
// behavior_propose is a truth-PROPOSAL (a DRAFT ChangeSet — the propose → ChangeSet door); watch_materialize's
// Proposal input embeds a changeset.ChangeSet whose Delta.Body is a json.RawMessage (the S59 scar). Both
// are DELIBERATELY NOT in the registry, so a gateway_call resolves to unknown_tool (the panel keeps its
// own voie propre, the arch-fitness `propose` precedent).
func TestTransport_Phase4_OmittedNotFronted(t *testing.T) {
	d := phase4Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	for _, tool := range []string{"behavior_propose", "watch_materialize"} {
		out := callBatch(t, cs, tool, map[string]any{})
		if out.Outcome != "unknown_tool" {
			t.Fatalf("%s outcome = %q, want unknown_tool (an omitted truth-proposal / RawMessage tool is never a readVia)", tool, out.Outcome)
		}
	}
}

// TestTransport_Phase4_NeutralizedBuilderUndispatched — the LOAD-BEARING proof. With the entity-relation
// builder NEUTRALIZED (ErrServerNotDispatched), the SAME object payload that routed above now falls to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes are caused by the
// WIRING, not by the registry alone. route_undispatched carries a nil result + nil block_reason.
func TestTransport_Phase4_NeutralizedBuilderUndispatched(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), phase4Builder("entity-relation"))
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "relation_resolve", map[string]any{
		"relation": map[string]any{"name": "customer", "target": "Customer", "cardinality": "1-N", "semantic": "fk"},
		"known":    []string{"Customer"},
	})
	if out.Outcome != "route_undispatched" {
		t.Fatalf("neutralized entity-relation outcome = %q, want route_undispatched (the wiring — not the registry — caused the green routes)", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}

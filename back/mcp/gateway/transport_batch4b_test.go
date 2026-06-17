// transport_batch4b_test.go — the DISPATCH MIRROR for the ADR 0092 batch-4B PURE servers
// (entity-modeler · shape-editor · context-map · grilling-loop). For AT LEAST one CHEAP/pure read tool
// of EACH of the four servers, it drives gateway_call with an args:OBJECT payload over the REAL HTTP
// transport (StreamableHTTPHandler) and asserts the routed call REACHES its in-process backend and
// returns a structured "route" result — NOT route_undispatched (the un-wired fallback) and NOT an
// isError (an input/output-schema rejection).
//
// THE SCAR THIS PINS (S59, the recurring one). A tool whose I/O carries a json.RawMessage reflects to
// the go-sdk as a BYTE-ARRAY schema, so a real HTTP args:{object} payload is REFUSED at input validation
// BEFORE the handler — and the front silently falls back to demo (the twin stays alive). The dispatched
// batch-4B read tools carry NO json.RawMessage in their I/O (every body is a scalar object — a
// modeler.Draft, a contextmap.ContextMap, a grillingloop.VerdictRecord). The `*_propose` tools DO carry
// a changeset.ChangeSet whose Delta.Body is a json.RawMessage — so they are DELIBERATELY NOT dispatched
// (TestTransport_Batch4B_ProposeNotFronted pins they resolve to unknown_tool), exactly like
// arch-fitness `propose` and truth-approval. Those panels keep their propose→ChangeSet voie propre.
//
// THE LOAD-BEARING PROOF (TestTransport_Batch4B_NeutralizedBuilderUndispatched). A builder NEUTRALIZED
// in the dispatcher (returns ErrServerNotDispatched) makes the SAME object payload route to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes above are
// caused by the WIRING, not by the registry alone (the cliquet's blind spot is that a readVia frontier
// passes even when the tool does not resolve; this mirror closes it server-side).
//
// NOTE ON RLS (ADR 0092 batch-4B GRILL). The general batch template carries a 2-project RLS no-leak
// test, but that is the batch-4A shape (besoin-intake is the ONLY DSN-backed, RLS-scoped server). The
// four batch-4B servers are PURE/stateless — no store, no DSN, no `aidos.project` GUC — so there is NO
// per-project boundary to leak across (the grill's rlsScoped=false). The cross-project guarantee here
// is the wall's pure router (a forged/cross-project call is refused AGENT_CROSS_PROJECT_WRITE before any
// dispatch, pinned by the existing TestTransport_GatewayCallWallOverHTTP) — the RLS GUC test does not
// apply to a server that opens no transaction.
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; every dispatched tool's output is a VALUE
// (WroteKernel false — the canvas/mirror/pact reads compute, the grill routes an idea VALUE that
// persists via the idea_capture door, never the kernel). The dispatch path runs the pure router FIRST —
// a truth-write never reaches a backend (the existing TestTransport_GatewayCallWallOverHTTP pins that).
package main

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	contextmapsrv "github.com/steph-frtech/aidos/back/mcp/context-map/contextmapsrv"
	entitymodelersrv "github.com/steph-frtech/aidos/back/mcp/entity-modeler/entitymodelersrv"
	grillingloopsrv "github.com/steph-frtech/aidos/back/mcp/grilling-loop/grillingloopsrv"
	shapeeditorsrv "github.com/steph-frtech/aidos/back/mcp/shape-editor/shapeeditorsrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

// batch4BBuilder is the StoreProvider that builds the four ADR 0092 batch-4B PURE servers in-process
// (the SAME NewServer the standalone binaries use — no twin). When neutralize is non-empty, that one
// server returns ErrServerNotDispatched instead (the load-bearing proof: the same call then falls to
// route_undispatched).
func batch4BBuilder(neutralize string) func(context.Context, string) (*mcp.Server, error) {
	return func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv == neutralize {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		switch srv {
		case "entity-modeler":
			return entitymodelersrv.NewServer(), nil
		case "shape-editor":
			return shapeeditorsrv.NewServer(), nil
		case "context-map":
			return contextmapsrv.NewServer(), nil
		case "grilling-loop":
			return grillingloopsrv.NewServer(), nil
		default:
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
	}
}

// batch4BDispatcher wires the batch-4B builder (no server neutralized).
func batch4BDispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), batch4BBuilder(""))
}

// customerOrderDraft is the canonical proposable draft (Customer↔Order, the S75 done-criterion) as the
// HTTP args:{object} payload — a modeler.Draft is a scalar object (no json.RawMessage), so it survives
// the round-trip.
func customerOrderDraft() map[string]any {
	idAttr := map[string]any{"name": "id", "type": "string", "required": true, "identifier": true}
	return map[string]any{
		"project": "shop",
		"nodes": []map[string]any{
			{"entity": map[string]any{"name": "Customer", "attributes": []map[string]any{idAttr, {"name": "email", "type": "string", "required": true}}}, "relations": []map[string]any{}},
			{"entity": map[string]any{"name": "Order", "attributes": []map[string]any{idAttr, {"name": "total", "type": "decimal", "required": true}}}, "relations": []map[string]any{
				{"name": "customer", "target": "Customer", "cardinality": "1-N", "semantic": "fk", "required": true},
			}},
		},
	}
}

// TestTransport_EntityModelerValidateOverHTTP — entity-modeler.schema_validate with a draft:{object}
// payload reaches the backend and resolves every relation green (the Customer↔Order draft is valid —
// the real S75 modeler executed, the object body survived the HTTP round-trip).
func TestTransport_EntityModelerValidateOverHTTP(t *testing.T) {
	d := batch4BDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "schema_validate", map[string]any{"draft": customerOrderDraft()})
	assertRouted(t, out, "schema_validate")
	if out.Result["ok"] != true {
		t.Fatalf("schema_validate ok = %v, want true (a Customer↔Order draft resolves every relation — the real backend executed)", out.Result["ok"])
	}
}

// TestTransport_EntityModelerValidateRefusesUnknownTarget — schema_validate over an UNDECLARED relation
// target is refused with the MODELER_INVALID_DRAFT BlockReason (resolved server-side, never guessed) —
// proving the real validator (not a passthrough) executed over HTTP.
func TestTransport_EntityModelerValidateRefusesUnknownTarget(t *testing.T) {
	d := batch4BDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	// entities.Attribute.Required is a non-pointer bool, so the go-sdk infers it as a REQUIRED input
	// property — supply it explicitly (the same pattern workspace_can_access uses for its non-pointer
	// int caps; an omitted `required` reds at INPUT validation before the handler).
	out := callBatch(t, cs, "schema_validate", map[string]any{"draft": map[string]any{
		"project": "shop",
		"nodes": []map[string]any{
			{"entity": map[string]any{"name": "Order", "attributes": []map[string]any{{"name": "id", "type": "string", "required": true, "identifier": true}}}, "relations": []map[string]any{
				{"name": "c", "target": "Ghost", "cardinality": "1-1", "semantic": "fk", "required": false},
			}},
		},
	}})
	assertRouted(t, out, "schema_validate")
	if out.Result["ok"] != false {
		t.Fatalf("schema_validate ok = %v, want false (an unknown relation target is refused — the real validator executed)", out.Result["ok"])
	}
}

// TestTransport_ShapeDeriveOverHTTP — shape-editor.shape_derive reaches the backend and derives the
// closed form for an invariant (property) — the real S68 closed-table derivation executed over HTTP.
func TestTransport_ShapeDeriveOverHTTP(t *testing.T) {
	d := batch4BDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "shape_derive", map[string]any{"nature": "invariant"})
	assertRouted(t, out, "shape_derive")
	if out.Result["ok"] != true {
		t.Fatalf("shape_derive ok = %v, want true (the real backend executed)", out.Result["ok"])
	}
	if out.Result["shape"] != "property" {
		t.Fatalf("shape_derive shape = %v, want property (invariant→property, the closed table)", out.Result["shape"])
	}
}

// TestTransport_ContextMapCheckCallOverHTTP — context-map.check_call with a map:{object} payload reaches
// the backend and REFUSES a cross-cell call over an ABSENT contract with CROSS_CELL_NO_CONTRACT (§46) —
// the real S101 verifier executed over HTTP (a scalar-object ContextMap, no json.RawMessage).
func TestTransport_ContextMapCheckCallOverHTTP(t *testing.T) {
	d := batch4BDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	// orders → inventory with NO designed pair: the call violates the contract (absent pair) → refused.
	out := callBatch(t, cs, "check_call", map[string]any{
		"from": "orders", "to": "inventory",
		"map": map[string]any{
			"project":  "shop",
			"cells":    []string{"orders", "inventory"},
			"surfaces": []map[string]any{},
			"pairs":    []map[string]any{},
		},
	})
	assertRouted(t, out, "check_call")
	if out.Result["allowed"] != false {
		t.Fatalf("check_call allowed = %v, want false (a cross-cell call over an absent contract is refused — the real verifier executed)", out.Result["allowed"])
	}
}

// TestTransport_GrillRouteOverHTTP — grilling-loop.grill_route reaches the backend and routes a SHARP
// intention to the `grilled` lane (the closed verdict→lane table). The routed VerdictRecord is a VALUE
// (the idea is a DRAFT; persistence rides the idea_capture door, WroteKernel false — the wall). All three
// grilling-loop tools dispatch (no json.RawMessage in their I/O).
func TestTransport_GrillRouteOverHTTP(t *testing.T) {
	d := batch4BDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "grill_route", map[string]any{
		"proposes":  "policy",
		"intent":    "give regulars a 10% discount",
		"scenarios": []string{"a regular at the 6th order gets 10% off"},
		"verdict":   "sharp",
		"detail":    "give regulars a 10% discount",
	})
	assertRouted(t, out, "grill_route")
	if out.Result["status"] != "grilled" {
		t.Fatalf("grill_route status = %v, want grilled (a sharp verdict routes to the grilled lane — the real backend executed)", out.Result["status"])
	}
	if out.Result["verdict"] != "sharp" {
		t.Fatalf("grill_route verdict = %v, want sharp (recorded, never invented)", out.Result["verdict"])
	}
}

// TestTransport_Batch4B_ProposeNotFronted — the three `*_propose` tools (entity-modeler.schema_propose ·
// shape-editor.shape_propose · context-map.propose) are DELIBERATELY NOT dispatched: each returns a
// changeset.ChangeSet whose Delta.Body is a json.RawMessage (the byte-array scar) AND is a truth-PROPOSAL
// the front never fires synchronously (the arch-fitness `propose` precedent). A routed propose therefore
// resolves to unknown_tool (NOT route, NOT route_undispatched) — the panels keep their propose→ChangeSet
// door. This pins the SKIP decision (registering them would be wrong; leaving them unknown is correct).
func TestTransport_Batch4B_ProposeNotFronted(t *testing.T) {
	d := batch4BDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	for _, tool := range []string{"schema_propose", "shape_propose"} {
		out := callBatch(t, cs, tool, map[string]any{"draft": customerOrderDraft(), "parent_phase": "phase-0"})
		if out.Outcome != "unknown_tool" {
			t.Fatalf("%s outcome = %q, want unknown_tool (a *_propose tool is the propose → ChangeSet door, never fronted as a below-line read)", tool, out.Outcome)
		}
	}
	// context-map's propose tool is literally named "propose".
	out := callBatch(t, cs, "propose", map[string]any{"map": map[string]any{"project": "shop"}, "label": "ctx", "parent_phase": "phase-0"})
	if out.Outcome != "unknown_tool" {
		t.Fatalf("context-map propose outcome = %q, want unknown_tool (the propose → ChangeSet door is not a below-line read)", out.Outcome)
	}
}

// TestTransport_Batch4B_NeutralizedBuilderUndispatched — the LOAD-BEARING proof. With the entity-modeler
// builder NEUTRALIZED (ErrServerNotDispatched), the SAME object payload that routed above now falls to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes are caused by
// the WIRING, not by the registry alone. route_undispatched carries a nil result + nil block_reason (the
// front then reads its *-data.ts demo). This closes the cliquet's blind spot server-side.
func TestTransport_Batch4B_NeutralizedBuilderUndispatched(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), batch4BBuilder("entity-modeler"))
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "schema_validate", map[string]any{"draft": customerOrderDraft()})
	if out.Outcome != "route_undispatched" {
		t.Fatalf("neutralized entity-modeler outcome = %q, want route_undispatched (the wiring — not the registry — caused the green routes)", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}

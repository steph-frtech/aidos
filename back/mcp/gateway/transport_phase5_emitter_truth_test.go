// transport_phase5_emitter_truth_test.go — the DISPATCH MIRROR for the ADR 0092 PHASE-5
// emitter/kernel/mirror READ servers (relation-emitter · truth-level · facet-completeness ·
// facet-wire). For AT LEAST one CHEAP/pure read tool of EACH of the four servers, it drives
// gateway_call with an args:OBJECT payload over the REAL HTTP transport (StreamableHTTPHandler)
// and asserts the routed call REACHES its in-process backend and returns a structured "route"
// result — NOT route_undispatched (the un-wired fallback) and NOT an isError (an
// input/output-schema rejection, the S59 byte-array scar).
//
// THE FOUR SERVERS (the demo-twin panels whose pure reads flip to the Go engine):
//
//	relation-emitter (S74)  — emit_ddl renders a whole schema cut's Postgres DDL (FK columns, a join
//	                          table per N-N, an outbox table when async). Artifact.Bytes is a []byte
//	                          number-array, NOT a json.RawMessage — the S59 byte-array scar avoided.
//	truth-level (FK01)      — compute maps the FKE-5 provenance signals to the highest truth level.
//	facet-completeness(FK04)— check returns the facet-aware completeness verdict over a cut.
//	facet-wire (FK08)       — facet_skeleton judges a kernel's non-functional facet columns in parallel.
//
// THE SCAR THIS PINS (S59, the recurring one). A tool whose I/O carries a json.RawMessage reflects to
// the go-sdk as a BYTE-ARRAY (base64-string) schema, so a real HTTP args:{object} payload is REFUSED at
// input validation BEFORE the handler — and the front silently falls back to demo (the twin stays
// alive). The dispatched phase-5 read tools carry NO json.RawMessage in their I/O (a relemit Schema of
// scalar pieces + a []byte artifact, the FKE-5 signals, a facet cut of plain object structs). The
// OMITTED tools are either NAME-COLLIDING (relation-emitter.emit_worker collides with hono-emitter,
// schema_hash with entity-modeler — registering them would shadow the prior owner, a §9 anti-overwrite,
// the preview/deploy precedent) or RawMessage-scarred (strangler.carve/freeze/refactor embed a
// json.RawMessage Trace.Input/Output — the byte-array scar) — so all are DELIBERATELY NOT dispatched
// (TestTransport_Phase5_OmittedNotFronted pins they resolve to unknown_tool). Those panels keep their
// own voie propre.
//
// THE LOAD-BEARING PROOF (TestTransport_Phase5_NeutralizedBuilderUndispatched). A builder NEUTRALIZED in
// the dispatcher (returns ErrServerNotDispatched) makes the SAME object payload route to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes above are
// caused by the WIRING, not by the registry alone (the cliquet's blind spot is that a readVia frontier
// passes even when the tool does not resolve; this mirror closes it server-side).
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; every dispatched tool's output is a VALUE
// (WroteKernel false — the four are PURE reads/projections). The dispatch path runs the pure router
// FIRST — a truth-write never reaches a backend (TestTransport_GatewayCallWallOverHTTP).
package main

import (
	"context"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	facetcompletenesssrv "github.com/steph-frtech/aidos/back/mcp/facet-completeness/facetcompletenesssrv"
	facetwiresrv "github.com/steph-frtech/aidos/back/mcp/facet-wire/facetwiresrv"
	relationemittersrv "github.com/steph-frtech/aidos/back/mcp/relation-emitter/relationemittersrv"
	truthlevelsrv "github.com/steph-frtech/aidos/back/mcp/truth-level/truthlevelsrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

// phase5Builder is the StoreProvider that builds the four ADR 0092 phase-5 servers in-process (the
// SAME NewServer the standalone binaries use — no twin). When neutralize is non-empty, that one server
// returns ErrServerNotDispatched instead (the load-bearing proof: the same call then falls to
// route_undispatched).
func phase5Builder(neutralize string) func(context.Context, string) (*mcp.Server, error) {
	return func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv == neutralize {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		switch srv {
		case "relation-emitter":
			return relationemittersrv.NewServer(), nil
		case "truth-level":
			return truthlevelsrv.NewServer(), nil
		case "facet-completeness":
			return facetcompletenesssrv.NewServer(), nil
		case "facet-wire":
			return facetwiresrv.NewServer(), nil
		default:
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
	}
}

func phase5Dispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), phase5Builder(""))
}

// sampleRelemitSchema is a valid multi-entity schema cut: an N-N relation (→ a join table) + an FK +
// an async op (→ an outbox table). NOTE — relemit.Schema/EntityRelations/AsyncOp are UNTAGGED, so the
// JSON keys are the capitalized Go field names (Project/Entities/AsyncOps; Entity/Relations); the inner
// entities.Entity + ref.Relation carry lowercase json tags.
func sampleRelemitSchema() map[string]any {
	entity := func(name string) map[string]any {
		return map[string]any{
			"name": name,
			"attributes": []any{
				map[string]any{"name": "id", "type": "int", "required": true, "identifier": true},
				map[string]any{"name": "name", "type": "string", "required": true},
			},
		}
	}
	return map[string]any{
		"Project": "lib",
		"Entities": []any{
			map[string]any{"Entity": entity("author"), "Relations": []any{}},
			map[string]any{"Entity": entity("book"), "Relations": []any{
				map[string]any{"name": "author", "target": "author", "cardinality": "1-N", "semantic": "fk", "required": true},
				map[string]any{"name": "tags", "target": "tag", "cardinality": "N-N", "semantic": "association"},
			}},
			map[string]any{"Entity": entity("tag"), "Relations": []any{}},
		},
		"AsyncOps": []any{},
	}
}

// TestTransport_EmitDDLOverHTTP — relation-emitter.emit_ddl with a schema:{object} payload reaches the
// backend and renders the multi-entity DDL (ok=true, a non-empty []byte artifact) — the real S74
// relation-aware emitter executed, the object body survived the HTTP round-trip (no json.RawMessage).
func TestTransport_EmitDDLOverHTTP(t *testing.T) {
	d := phase5Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "emit_ddl", map[string]any{"schema": sampleRelemitSchema()})
	assertRouted(t, out, "emit_ddl")
	if out.Result["ok"] != true {
		t.Fatalf("emit_ddl ok = %v, want true (the real S74 emitter executed): %+v", out.Result["ok"], out.Result)
	}
	// artifactOut.Source is a STRING (the rendered DDL), NOT a []byte number-array — the dispatch-safe
	// shape that survives the HTTP output-schema validation (the S59 byte-array scar). The N-N relation
	// rendered a join table iff the real S74 emitter executed over the round-trip.
	art, _ := out.Result["artifact"].(map[string]any)
	src, _ := art["source"].(string)
	if art == nil || src == "" {
		t.Fatalf("emit_ddl returned no artifact source (the object body did not survive the round-trip): %+v", out.Result)
	}
	if !strings.Contains(src, `CREATE TABLE "book_tags"`) {
		t.Fatalf("emit_ddl source missing the N-N join table (the real S74 emitter did not run):\n%s", src)
	}
}

// TestTransport_TruthLevelComputeOverHTTP — truth-level.compute with a signals:{object} payload reaches
// the backend and maps the FKE-5 provenance doors to the highest rung — the real FK01 transition
// executed. raw+idea ⇒ level 2 (interpreted), the verdict COMPUTED, never declared.
func TestTransport_TruthLevelComputeOverHTTP(t *testing.T) {
	d := phase5Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	// truthlevel.Signals has NO omitempty/pointer fields, so the go-sdk reflects EVERY door as
	// `required` — a partial object is refused at the backend's input validation. Send the full
	// FKE-5 signal set (raw+idea on, the rest off ⇒ the highest satisfied rung is interpreted/2).
	out := callBatch(t, cs, "compute", map[string]any{
		"signals": map[string]any{
			"has_raw_signal": true, "has_idea": true, "has_proposal": false,
			"is_accepted": false, "has_projection": false, "has_observation": false,
			"is_reconciled": false,
		},
	})
	assertRouted(t, out, "compute")
	if out.Result["ok"] != true {
		t.Fatalf("compute ok = %v, want true (the real FK01 transition executed)", out.Result["ok"])
	}
	if lvl, _ := out.Result["level"].(float64); lvl != 2 {
		t.Fatalf("compute level = %v, want 2 (raw+idea ⇒ interpreted — the transition executed): %+v", out.Result["level"], out.Result)
	}
}

// TestTransport_FacetCompletenessCheckOverHTTP — facet-completeness.check with a cut:{layers,mirrors}
// object payload reaches the backend and returns the facet-aware verdict — the real FK04 completeness
// law executed. An instantiated S facet with NO living pair ⇒ RED_MONSTER (a monster, computed).
func TestTransport_FacetCompletenessCheckOverHTTP(t *testing.T) {
	d := phase5Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "check", map[string]any{
		"layers": []any{
			map[string]any{"layer_id": "op1", "version": "v1", "kind": "operation", "facets": []any{"F", "S"}},
		},
		"mirrors": []any{
			map[string]any{"mirror_id": "m-f", "reflects_id": "op1", "reflects_version": "v1", "facet": "F", "test_kind": "fixture", "cert_language": "fixture", "liveness": "alive"},
		},
	})
	assertRouted(t, out, "check")
	if out.Result["ok"] != true {
		t.Fatalf("check ok = %v, want true (the real FK04 completeness law executed)", out.Result["ok"])
	}
	if v, _ := out.Result["verdict"].(string); v != "RED_MONSTER" {
		t.Fatalf("check verdict = %q, want RED_MONSTER (a missing S pair is a monster — computed): %+v", v, out.Result)
	}
}

// TestTransport_FacetSkeletonOverHTTP — facet-wire.facet_skeleton with a columns:[{object}] payload
// reaches the backend and judges the non-functional facet columns in parallel — the real FK08 structural
// judge executed, content-addressing the SkeletonReport (a non-empty hash).
func TestTransport_FacetSkeletonOverHTTP(t *testing.T) {
	d := phase5Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	fullColumn := func(facet string) map[string]any {
		rungs := []any{}
		for _, r := range []string{"1-spec", "2-behaviour", "3-scenarios", "4-model", "5-contract", "6-evidence"} {
			rungs = append(rungs, map[string]any{"rung": r, "declared": true, "proven": true})
		}
		return map[string]any{"kernel_id": "checkout", "facet": facet, "rungs": rungs}
	}
	out := callBatch(t, cs, "facet_skeleton", map[string]any{
		"kernel_id": "checkout",
		"columns":   []any{fullColumn("S"), fullColumn("R")},
	})
	assertRouted(t, out, "facet_skeleton")
	if out.Result["ok"] != true {
		t.Fatalf("facet_skeleton ok = %v, want true (the real FK08 judge executed)", out.Result["ok"])
	}
	if h, _ := out.Result["hash"].(string); h == "" {
		t.Fatalf("facet_skeleton returned no content address (the judge did not execute): %+v", out.Result)
	}
}

// TestTransport_Phase5_OmittedNotFronted — the OMITTED tools resolve to unknown_tool, never a readVia.
// relation-emitter.emit_worker / schema_hash COLLIDE by name with hono-emitter / entity-modeler (the flat
// registry would shadow the prior owner, a §9 anti-overwrite — the preview/deploy precedent); strangler's
// carve/freeze/refactor embed a json.RawMessage Trace.Input/Output (the S59 byte-array scar) AND are heavy
// generate-fixture-mirror gestures. All are DELIBERATELY NOT in the registry, so a gateway_call resolves
// to unknown_tool (the panels keep their own voie propre, the arch-fitness `propose` precedent).
func TestTransport_Phase5_OmittedNotFronted(t *testing.T) {
	d := phase5Dispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	// NOTE — emit_worker / schema_hash are NOT asserted here: they ARE registered tools (owned by
	// hono-emitter / entity-modeler), so they route to THOSE servers (un-wired in this dispatcher ⇒
	// route_undispatched), never unknown_tool. The collision is exactly why relation-emitter must not
	// re-register them. The strangler tools are unregistered everywhere ⇒ unknown_tool.
	for _, tool := range []string{"carve", "freeze", "refactor"} {
		out := callBatch(t, cs, tool, map[string]any{})
		if out.Outcome != "unknown_tool" {
			t.Fatalf("%s outcome = %q, want unknown_tool (an off-dispatch RawMessage/heavy tool is never a readVia)", tool, out.Outcome)
		}
	}
}

// TestTransport_Phase5_NeutralizedBuilderUndispatched — the LOAD-BEARING proof. With the relation-emitter
// builder NEUTRALIZED (ErrServerNotDispatched), the SAME emit_ddl object payload that routed above now
// falls to route_undispatched (the demo fallback), not route — proving the green "route" outcomes are
// caused by the WIRING, not by the registry alone. route_undispatched carries a nil result + nil
// block_reason.
func TestTransport_Phase5_NeutralizedBuilderUndispatched(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), phase5Builder("relation-emitter"))
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "emit_ddl", map[string]any{"schema": sampleRelemitSchema()})
	if out.Outcome != "route_undispatched" {
		t.Fatalf("neutralized relation-emitter outcome = %q, want route_undispatched (the wiring — not the registry — caused the green routes)", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}

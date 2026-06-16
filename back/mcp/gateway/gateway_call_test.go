package main

// gateway_call_test.go — the S59 EXECUTE-door mirror for gateway_call (reflects=mcp.gateway,
// test_kind=unit, liveness=live). It drives the (*server).call handler directly, proving:
//
//	(i)   THE WALL HOLDS WITH NO DSN — a truth-write through gateway_call is refused
//	      (refused_truth_write, GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET) even when no Dispatcher
//	      is configured: the wall is enforced via reg.Route directly, the store is never
//	      reachable. This is the headless-deployment safety net (a gateway with no DB still
//	      refuses truth, never silently passes it).
//	(ii)  BELOW-LINE WITHOUT A DSN → route_undispatched (the front falls back to demo, no
//	      regression — ADR 0074).
//	(iii) THE WALL HOLDS WITH A DISPATCHER — a truth-write through a fully-wired Dispatcher is
//	      STILL refused before any dispatch (the factory PANICS if reached).
//	(iv)  THE EXECUTE PATH — a routed below-the-line changeset_open reaches a deterministic
//	      fake backend and returns its structured result through gateway_call.
//
// NOTE (the S59 scar): this file drives (*server).call IN-GO, which bypasses the SDK's
// transport-facing jsonschema validation. The args:object schema is proven over the REAL
// HTTP transport by TestTransport_GatewayCallExecutesOverHTTP in transport_integration_test.go
// — the mirror that catches the byte-array-args regression this unit path cannot see.

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

func callScope() scopeIn { return scopeIn{Identity: "alice", ActiveProject: "proj-a"} }

// newFakeChangesetServer builds an in-memory backend exposing a PURE changeset_open whose
// args are typed map[string]any (the same object shape the real transport carries).
func newFakeChangesetServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "fake-changeset", Version: "v0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_open", Description: "fake deterministic open"},
		func(_ context.Context, _ *mcp.CallToolRequest, _ map[string]any) (*mcp.CallToolResult, struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		}, error) {
			return nil, struct {
				ID     string `json:"id"`
				Status string `json:"status"`
			}{ID: "cs-deadbeef", Status: "DRAFT"}, nil
		})
	return srv
}

// (i) + (ii) — no Dispatcher: the wall still refuses a truth-write; a below-line call is
// route_undispatched.
func TestGatewayCall_WallHoldsWithoutDispatcher(t *testing.T) {
	s := &server{reg: gateway.DefaultRegistry(), dispatch: nil}

	for _, tool := range []string{"kernel_write", "mirror_write", "fitness_write"} {
		_, out, err := s.call(context.Background(), nil, callInput{Scope: callScope(), Tool: tool, Args: map[string]any{}})
		if err != nil {
			t.Fatalf("%s: unexpected err: %v", tool, err)
		}
		if out.Outcome != string(gateway.OutcomeRefusedTruthWrite) {
			t.Fatalf("%s: outcome = %q, want refused_truth_write (the wall holds with no DSN)", tool, out.Outcome)
		}
		if out.BlockReason == nil || out.BlockReason.Code != string(gateway.CodeTruthWriteNeedsChangeset) {
			t.Fatalf("%s: block_reason = %+v, want GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET", tool, out.BlockReason)
		}
		if out.Result != nil {
			t.Fatalf("%s: result must be nil on a refusal, got %v", tool, out.Result)
		}
	}

	// A below-the-line call with no Dispatcher → route_undispatched (demo fallback).
	_, out, err := s.call(context.Background(), nil, callInput{Scope: callScope(), Tool: "changeset_open", Args: map[string]any{}})
	if err != nil {
		t.Fatalf("below-line no-dsn err: %v", err)
	}
	if out.Outcome != gatewaydispatch.OutcomeRouteUndispatched {
		t.Fatalf("below-line no-dsn outcome = %q, want route_undispatched", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}

// (iii) — a Dispatcher whose factory PANICS proves a truth-write is refused before dispatch.
func TestGatewayCall_WallHoldsWithDispatcher(t *testing.T) {
	panicFactory := func(_ context.Context, srv string) (*mcp.Server, error) {
		t.Fatalf("factory reached for a truth-write (server=%q) — the wall failed", srv)
		panic("unreachable")
	}
	d := gatewaydispatch.New(gateway.DefaultRegistry(), panicFactory)
	defer d.Close()
	s := &server{reg: gateway.DefaultRegistry(), dispatch: d}

	_, out, err := s.call(context.Background(), nil, callInput{Scope: callScope(), Tool: "kernel_write", Args: map[string]any{}})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if out.Outcome != string(gateway.OutcomeRefusedTruthWrite) {
		t.Fatalf("outcome = %q, want refused_truth_write", out.Outcome)
	}
	if out.Result != nil {
		t.Fatalf("result must be nil on a truth-write refusal, got %v", out.Result)
	}
}

// (iv) — the execute path: a routed below-the-line changeset_open returns the backend's
// deterministic structured result through gateway_call.
func TestGatewayCall_ExecutesRoutedBelowLine(t *testing.T) {
	factory := func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv != "changeset" {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		return newFakeChangesetServer(), nil
	}
	d := gatewaydispatch.New(gateway.DefaultRegistry(), factory)
	defer d.Close()
	s := &server{reg: gateway.DefaultRegistry(), dispatch: d}

	_, out, err := s.call(context.Background(), nil, callInput{
		Scope: callScope(), Tool: "changeset_open",
		Args: map[string]any{"label": "add order discount", "parent_phase": "p"},
	})
	if err != nil {
		t.Fatalf("execute err: %v", err)
	}
	if out.Outcome != string(gateway.OutcomeRoute) {
		t.Fatalf("outcome = %q, want route", out.Outcome)
	}
	if out.BlockReason != nil {
		t.Fatalf("unexpected block_reason: %+v", out.BlockReason)
	}
	if out.Result == nil {
		t.Fatalf("result must carry the backend structured output, got nil")
	}
	if out.Result["id"] != "cs-deadbeef" || out.Result["status"] != "DRAFT" {
		t.Fatalf("executed result = %+v, want the fake's deterministic envelope", out.Result)
	}
}

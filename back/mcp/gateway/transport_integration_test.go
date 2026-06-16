// transport_integration_test.go — the S58 TRANSPORT-INTEGRATION mirror (the "is it
// real over the wire?" test). It mounts the REAL gateway MCP server over BOTH planes —
// (a) an in-memory MCP client↔server transport, AND (b) the SDK's StreamableHTTPHandler
// over a real net/http/httptest server — and drives gateway_route / gateway_tools /
// gateway_servers END TO END through each. This proves the HTTP plane HONOURS the MCP
// plane (the same server, byte-equal results over JSON-RPC stdio and JSON-RPC/HTTP) —
// the provider-verification done-criterion ("le HTTP honore le MCP").
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; the gateway only routes/refuses.
package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

func connectInMemory(t *testing.T) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	clientT, serverT := mcp.NewInMemoryTransports()
	srv := newMCPServer(nil)
	ss, err := srv.Connect(ctx, serverT, nil)
	if err != nil {
		t.Fatalf("server connect: %v", err)
	}
	t.Cleanup(func() { _ = ss.Close() })
	cli := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "v0"}, nil)
	cs, err := cli.Connect(ctx, clientT, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	t.Cleanup(func() { _ = cs.Close() })
	return cs
}

func connectHTTP(t *testing.T) *mcp.ClientSession { return connectHTTPWithDispatch(t, nil) }

// connectHTTPWithDispatch mounts the gateway over a real httptest server with an OPTIONAL
// dispatcher (nil = meta-tools only) and returns a connected HTTP client session.
func connectHTTPWithDispatch(t *testing.T, d *gatewaydispatch.Dispatcher) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	httpSrv := httptest.NewServer(httpHandler(d))
	t.Cleanup(httpSrv.Close)
	cli := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "v0"}, nil)
	cs, err := cli.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: httpSrv.URL}, nil)
	if err != nil {
		t.Fatalf("http client connect: %v", err)
	}
	t.Cleanup(func() { _ = cs.Close() })
	return cs
}

func decode[T any](t *testing.T, res *mcp.CallToolResult, name string) T {
	t.Helper()
	if res.IsError {
		t.Fatalf("%s returned a protocol error: %+v", name, res.Content)
	}
	var out T
	raw, err := json.Marshal(res.StructuredContent)
	if err != nil {
		t.Fatalf("marshal structured content: %v", err)
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode %s output: %v", name, err)
	}
	return out
}

func callRoute(t *testing.T, cs *mcp.ClientSession, in routeInput) routeOutput {
	t.Helper()
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "gateway_route", Arguments: in})
	if err != nil {
		t.Fatalf("CallTool gateway_route: %v", err)
	}
	return decode[routeOutput](t, res, "gateway_route")
}

// TestTransport_RouteBelowLineOverBothPlanes proves a below-the-line call routes
// identically over the in-memory MCP transport AND over JSON-RPC/HTTP (HTTP honours MCP).
func TestTransport_RouteBelowLineOverBothPlanes(t *testing.T) {
	in := routeInput{
		Scope:  scopeIn{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "store_get",
		Target: targetIn{ProjectID: "proj-a"},
	}
	mem := callRoute(t, connectInMemory(t), in)
	web := callRoute(t, connectHTTP(t), in)
	if mem.Outcome != "route" || web.Outcome != "route" {
		t.Fatalf("below-line not routed: mem=%s web=%s", mem.Outcome, web.Outcome)
	}
	if mem.Tool == nil || web.Tool == nil || mem.Tool.Name != web.Tool.Name {
		t.Fatalf("HTTP does not honour MCP: mem=%+v web=%+v", mem.Tool, web.Tool)
	}
}

// TestTransport_CrossProjectRefusedOverHTTP proves the server-side wall refuses a
// cross-project call over the HTTP plane (AGENT_CROSS_PROJECT_WRITE).
func TestTransport_CrossProjectRefusedOverHTTP(t *testing.T) {
	out := callRoute(t, connectHTTP(t), routeInput{
		Scope:  scopeIn{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "store_get",
		Target: targetIn{ProjectID: "proj-b"},
	})
	if out.Outcome != "refused_scope" {
		t.Fatalf("cross-project not refused over HTTP: %s", out.Outcome)
	}
	if out.BlockReason == nil || out.BlockReason.Code != "AGENT_CROSS_PROJECT_WRITE" {
		t.Fatalf("missing AGENT_CROSS_PROJECT_WRITE: %+v", out.BlockReason)
	}
}

// TestTransport_TruthWriteRefusedOverHTTP proves the server-side wall refuses a direct
// truth-write over the HTTP plane (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET).
func TestTransport_TruthWriteRefusedOverHTTP(t *testing.T) {
	out := callRoute(t, connectHTTP(t), routeInput{
		Scope:  scopeIn{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "kernel_write",
		Target: targetIn{ProjectID: "proj-a"},
	})
	if out.Outcome != "refused_truth_write" {
		t.Fatalf("truth-write not refused over HTTP: %s", out.Outcome)
	}
	if out.BlockReason == nil || out.BlockReason.Code != "GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET" {
		t.Fatalf("missing GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET: %+v", out.BlockReason)
	}
}

// TestTransport_ToolsAndServersOverHTTP proves the closed surface + the 13 servers are
// reachable over HTTP.
func TestTransport_ToolsAndServersOverHTTP(t *testing.T) {
	cs := connectHTTP(t)
	tr, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "gateway_tools", Arguments: emptyInput{}})
	if err != nil {
		t.Fatalf("gateway_tools: %v", err)
	}
	tools := decode[toolsOutput](t, tr, "gateway_tools")
	if len(tools.Tools) == 0 {
		t.Fatal("no tools exposed over HTTP")
	}
	sr, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "gateway_servers", Arguments: emptyInput{}})
	if err != nil {
		t.Fatalf("gateway_servers: %v", err)
	}
	servers := decode[serversOutput](t, sr, "gateway_servers")
	// Assert against the canonical closed list (gateway.GatewayServers) rather than a
	// hardcoded count, so registering a new fronted server (e.g. reality-ingest, ADR 0081)
	// keeps the HTTP plane honouring the MCP plane without re-staling this number.
	if want := len(gateway.GatewayServers()); len(servers.Servers) != want {
		t.Fatalf("expected the %d fronted MCP servers, got %d", want, len(servers.Servers))
	}
}

// fakeChangesetDispatcher wires a Dispatcher whose only backend is the deterministic
// in-memory fake changeset server (newFakeChangesetServer, gateway_call_test.go).
func fakeChangesetDispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv != "changeset" {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		return newFakeChangesetServer(), nil
	})
}

// TestTransport_GatewayCallExecutesOverHTTP is the S59 SCAR MIRROR: it drives gateway_call
// with an args:OBJECT payload over the REAL HTTP transport (StreamableHTTPHandler), proving
// the announced input schema ACCEPTS an object and the routed below-the-line changeset_open
// reaches its backend and returns a structured result. A byte-array-typed Args field (the
// regression the in-Go unit test could not catch) makes the transport REJECT this object at
// input validation before the handler — this test goes red on exactly that.
func TestTransport_GatewayCallExecutesOverHTTP(t *testing.T) {
	d := fakeChangesetDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "gateway_call",
		Arguments: callInput{
			Scope: scopeIn{Identity: "alice", ActiveProject: "proj-a"},
			Tool:  "changeset_open",
			Args:  map[string]any{"label": "add order discount", "parent_phase": "p"},
		},
	})
	if err != nil {
		t.Fatalf("CallTool gateway_call over HTTP: %v", err)
	}
	out := decode[callOutput](t, res, "gateway_call")
	if out.Outcome != "route" {
		t.Fatalf("gateway_call over HTTP outcome = %q, want route (the args:object reached the backend)", out.Outcome)
	}
	if out.Result == nil || out.Result["id"] != "cs-deadbeef" || out.Result["status"] != "DRAFT" {
		t.Fatalf("gateway_call over HTTP result = %+v, want the fake's deterministic envelope", out.Result)
	}
}

// TestTransport_GatewayCallWallOverHTTP proves the wall refuses a truth-write through the
// gateway_call EXECUTE door over HTTP (not just the route-only meta-tool).
func TestTransport_GatewayCallWallOverHTTP(t *testing.T) {
	d := fakeChangesetDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "gateway_call",
		Arguments: callInput{Scope: scopeIn{Identity: "alice", ActiveProject: "proj-a"}, Tool: "kernel_write"},
	})
	if err != nil {
		t.Fatalf("CallTool gateway_call kernel_write over HTTP: %v", err)
	}
	out := decode[callOutput](t, res, "gateway_call")
	if out.Outcome != "refused_truth_write" {
		t.Fatalf("truth-write through gateway_call not refused over HTTP: %s", out.Outcome)
	}
	if out.BlockReason == nil || out.BlockReason.Code != "GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET" {
		t.Fatalf("missing GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET: %+v", out.BlockReason)
	}
}

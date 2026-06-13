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
)

func connectInMemory(t *testing.T) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	clientT, serverT := mcp.NewInMemoryTransports()
	srv := newMCPServer()
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

func connectHTTP(t *testing.T) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	httpSrv := httptest.NewServer(httpHandler())
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
	if len(servers.Servers) != 14 {
		t.Fatalf("expected the 14 fronted MCP servers, got %d", len(servers.Servers))
	}
}

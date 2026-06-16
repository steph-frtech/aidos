// pact_test.go — the S58 PACT mirror (provider verification, the frozen N5 slot). It
// declares the consumer's contract for the gateway's MCP-over-HTTP surface — ONE
// interaction per exposed tool (the JSON-RPC tools/call request → the result field set)
// — and VERIFIES the gateway's StreamableHTTPHandler honours each contract IN-PROCESS
// (net/http/httptest, no external daemon — ADR 0026). This is the done-criterion "Pact
// par outil + provider-verification (le HTTP honore le MCP)".
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; the gateway routes/refuses only.
package main

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// pactInteraction is one consumer expectation: a tool call and the exact result field
// set the provider (the HTTP gateway) must return — no extra/missing/renamed field.
type pactInteraction struct {
	tool      string
	args      any
	wantKeys  []string // sorted result-object field set
	wantField map[string]string
}

func keysOf(m map[string]any) map[string]struct{} {
	out := make(map[string]struct{}, len(m))
	for k := range m {
		out[k] = struct{}{}
	}
	return out
}

// gatewayContract is the Pact-style contract: ONE interaction per exposed gateway tool.
// Each names the result field set the provider must honour.
func gatewayContract() []pactInteraction {
	return []pactInteraction{
		{
			tool:      "gateway_route",
			args:      routeInput{Scope: scopeIn{Identity: "alice", ActiveProject: "proj-a"}, Tool: "store_get", Target: targetIn{ProjectID: "proj-a"}},
			wantKeys:  []string{"outcome", "tool"},
			wantField: map[string]string{"outcome": "route"},
		},
		{
			tool:      "gateway_route",
			args:      routeInput{Scope: scopeIn{Identity: "alice", ActiveProject: "proj-a"}, Tool: "store_get", Target: targetIn{ProjectID: "proj-b"}},
			wantKeys:  []string{"outcome", "block_reason"},
			wantField: map[string]string{"outcome": "refused_scope"},
		},
		{
			tool:      "gateway_route",
			args:      routeInput{Scope: scopeIn{Identity: "alice", ActiveProject: "proj-a"}, Tool: "kernel_write", Target: targetIn{ProjectID: "proj-a"}},
			wantKeys:  []string{"outcome", "block_reason"},
			wantField: map[string]string{"outcome": "refused_truth_write"},
		},
		{
			tool:     "gateway_tools",
			args:     emptyInput{},
			wantKeys: []string{"tools"},
		},
		{
			tool:     "gateway_servers",
			args:     emptyInput{},
			wantKeys: []string{"servers"},
		},
	}
}

// TestPactProviderVerification stands the gateway HTTP provider up in-process and
// verifies EACH contract interaction: the structured result's field set matches exactly
// and any pinned scalar field matches. A mismatch FAILS (the honesty assertion).
func TestPactProviderVerification(t *testing.T) {
	httpSrv := httptest.NewServer(httpHandler(nil))
	defer httpSrv.Close()
	cli := mcp.NewClient(&mcp.Implementation{Name: "pact-consumer", Version: "v0"}, nil)
	cs, err := cli.Connect(context.Background(), &mcp.StreamableClientTransport{Endpoint: httpSrv.URL}, nil)
	if err != nil {
		t.Fatalf("connect HTTP provider: %v", err)
	}
	defer func() { _ = cs.Close() }()

	for _, it := range gatewayContract() {
		res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: it.tool, Arguments: it.args})
		if err != nil {
			t.Fatalf("interaction %s: call: %v", it.tool, err)
		}
		if res.IsError {
			t.Fatalf("interaction %s: provider error: %+v", it.tool, res.Content)
		}
		got, ok := res.StructuredContent.(map[string]any)
		if !ok {
			t.Fatalf("interaction %s: result is not a JSON object: %T", it.tool, res.StructuredContent)
		}
		gotKeys := keysOf(got)
		// Every contract key must be present (no missing field).
		for _, k := range it.wantKeys {
			if _, ok := gotKeys[k]; !ok {
				t.Errorf("interaction %s: missing contract field %q (got %v)", it.tool, k, got)
			}
		}
		// No extra top-level field beyond the contract (no add — accounting for the
		// omitempty fields which simply do not appear).
		want := map[string]struct{}{}
		for _, k := range it.wantKeys {
			want[k] = struct{}{}
		}
		for k := range gotKeys {
			if _, ok := want[k]; !ok {
				t.Errorf("interaction %s: unexpected extra field %q (contract is %v)", it.tool, k, it.wantKeys)
			}
		}
		for k, v := range it.wantField {
			if gv, _ := got[k].(string); gv != v {
				t.Errorf("interaction %s: field %q = %q, want %q", it.tool, k, gv, v)
			}
		}
	}
}

// TestPactCoversEveryGatewayTool: the contract has ≥1 interaction per exposed gateway
// tool (gateway_route · gateway_tools · gateway_servers) — no tool is left unverified.
func TestPactCoversEveryGatewayTool(t *testing.T) {
	covered := map[string]bool{}
	for _, it := range gatewayContract() {
		covered[it.tool] = true
	}
	for _, name := range []string{"gateway_route", "gateway_tools", "gateway_servers"} {
		if !covered[name] {
			t.Errorf("gateway tool %q has no Pact interaction", name)
		}
	}
}

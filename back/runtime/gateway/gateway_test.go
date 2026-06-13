package gateway_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
)

// TestEveryServerExposed asserts the completeness done-criterion: EVERY one of the 14
// MCP servers the roadmap names has ≥1 tool exposed by the gateway (no server is left
// headless). A monster (a named server with zero tools) reddens this.
func TestEveryServerExposed(t *testing.T) {
	reg := gateway.DefaultRegistry()
	byServer := map[string]int{}
	for _, tl := range reg.Tools() {
		byServer[tl.Server]++
	}
	for _, s := range gateway.GatewayServers() {
		if byServer[s] == 0 {
			t.Errorf("server %q exposes no tool — the gateway is incomplete", s)
		}
	}
}

func TestRouteBelowLine(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "store_get",
		Target: projectwall.Target{ProjectID: "proj-a"},
	})
	if d.Outcome != gateway.OutcomeRoute {
		t.Fatalf("below-the-line store_get not routed: %v", d.Outcome)
	}
	if d.Tool == nil || d.Tool.Name != "store_get" {
		t.Fatalf("routed tool wrong: %+v", d.Tool)
	}
}

func TestRouteUnknownTool(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "definitely_not_a_tool",
		Target: projectwall.Target{ProjectID: "proj-a"},
	})
	if d.Outcome != gateway.OutcomeUnknownTool {
		t.Fatalf("unknown tool not refused: %v", d.Outcome)
	}
	if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeUnknownTool {
		t.Fatalf("unknown-tool refusal without GATEWAY_UNKNOWN_TOOL: %+v", d.BlockReason)
	}
}

func TestRouteScopeBeforeTruthWrite(t *testing.T) {
	reg := gateway.DefaultRegistry()
	// A truth-write to the WRONG project must refuse on SCOPE first (the leak is a
	// scope leak before it is a zone violation).
	d := reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "kernel_write",
		Target: projectwall.Target{ProjectID: "proj-b"},
	})
	if d.Outcome != gateway.OutcomeRefusedScope {
		t.Fatalf("expected scope refusal first, got %v", d.Outcome)
	}
}

func TestLookup(t *testing.T) {
	reg := gateway.DefaultRegistry()
	if _, ok := reg.Lookup("pact_verify"); !ok {
		t.Fatal("pact_verify must be exposed")
	}
	if _, ok := reg.Lookup("changeset_apply"); !ok {
		t.Fatal("changeset_apply must be exposed (the legal truth door)")
	}
	if _, ok := reg.Lookup("nope"); ok {
		t.Fatal("unknown tool must not resolve")
	}
}

// TestRouteProvisionStackToolsBelowLine: the DP13 provisioning tools the gateway now
// fronts are BELOW THE LINE — a same-project, same-identity call routes through (they
// re-emit/project, never write truth). Fault-injection: the gateway really routes them.
func TestRouteProvisionStackToolsBelowLine(t *testing.T) {
	reg := gateway.DefaultRegistry()
	scope := projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"}
	target := projectwall.Target{ProjectID: "proj-a"}
	for _, tool := range []string{"stack.emit", "stack.select_profile", "stack.bootstrap", "stack.resolve_ports", "stack.print_urls"} {
		d := reg.Route(gateway.Call{Scope: scope, Tool: tool, Target: target})
		if d.Outcome != gateway.OutcomeRoute {
			t.Fatalf("DP13 below-line tool %q not routed: %v", tool, d.Outcome)
		}
		if d.Tool == nil || d.Tool.Server != "provision" {
			t.Fatalf("DP13 tool %q routed to the wrong server: %+v", tool, d.Tool)
		}
	}
}

// TestRouteStackEngraveIsTruthWrite: the fenced stack.engrave_manifest door is refused
// at the edge with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — a StackManifest is above-the-
// line truth, it never moves through a direct provisioning write.
func TestRouteStackEngraveIsTruthWrite(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "stack.engrave_manifest",
		Target: projectwall.Target{ProjectID: "proj-a"},
	})
	if d.Outcome != gateway.OutcomeRefusedTruthWrite {
		t.Fatalf("stack.engrave_manifest not refused as a truth-write: %v", d.Outcome)
	}
	if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeTruthWriteNeedsChangeset {
		t.Fatalf("stack.engrave_manifest refusal without GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET: %+v", d.BlockReason)
	}
}

func TestDefaultToolsReproducible(t *testing.T) {
	a := gateway.DefaultTools()
	b := gateway.DefaultTools()
	if len(a) != len(b) {
		t.Fatalf("non-reproducible tool count: %d != %d", len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("tool %d differs across calls: %+v != %+v", i, a[i], b[i])
		}
	}
}

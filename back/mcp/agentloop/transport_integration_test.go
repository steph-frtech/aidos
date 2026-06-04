// transport_integration_test.go — the BA19 TRANSPORT-INTEGRATION mirror (gap C2: the
// crucial "is it real?" test). It mounts the REAL agentloop MCP server connected to a REAL
// MCP client over an in-memory transport, and drives agentloop.drive END TO END through the
// MCP serialization path. The point is that the enforcer is ON THE CALL PATH — not a faked
// return from a unit test: the refusal happens at the TRANSPORT BOUNDARY, inside the real
// handler, over the wire.
//
// Two assertions, both over the real transport:
//
//  1. an impl that BINDS the target tool drives a real run to green (the door is open);
//  2. an impl that does NOT bind the target tool is REFUSED at the boundary
//     (AGENT_TOOL_NOT_BOUND), with NO run executed — the capacity axis on the call path.
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; a refused call records no run.
package main

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// unboundView serves a builder layer that binds a DIFFERENT tool than the run will call —
// so ToolAllowed(impl, target) is false and the call must be refused at the boundary.
type unboundView struct{}

func (unboundView) Layers() []agentlayer.CoucheAgent {
	ls := exampleLayers()
	// Rebind the only tool to a server the run will NOT target (mirror-runner/run_mirror).
	ls[0].OutilsMCPAutorises = []agentlayer.MCPBinding{{Server: "some-other-server", Tool: "some_other_tool", Enabled: true}}
	ls[0].SkillsAutorises = nil
	return ls
}
func (uv unboundView) Layer(ref string) (agentlayer.CoucheAgent, bool) {
	for _, c := range uv.Layers() {
		if c.Version == ref || c.Spec.Role == ref || "agent:"+c.Version == ref || "agentlayer:"+c.Version == ref {
			return c, true
		}
	}
	return agentlayer.CoucheAgent{}, false
}

// connect mounts the given server over an in-memory transport and returns a connected client
// session. Both sessions are closed via t.Cleanup.
func connect(t *testing.T, s *server) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	clientT, serverT := mcp.NewInMemoryTransports()

	srv := newMCPServer(s)
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

// callDrive calls agentloop_drive over the transport and decodes the structured output.
func callDrive(t *testing.T, cs *mcp.ClientSession, in driveInput) driveOutput {
	t.Helper()
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "agentloop_drive", Arguments: in})
	if err != nil {
		t.Fatalf("CallTool agentloop_drive: %v", err)
	}
	if res.IsError {
		t.Fatalf("agentloop_drive returned a protocol error: %+v", res.Content)
	}
	var out driveOutput
	raw, err := json.Marshal(res.StructuredContent)
	if err != nil {
		t.Fatalf("marshal structured content: %v", err)
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode driveOutput: %v", err)
	}
	return out
}

func boundDriveInput() driveInput {
	return driveInput{
		LayerRef:     "agent:builder@v1",
		RedWorkItem:  "redset:checkout#1",
		ContextPack:  "pack-checkout",
		Scenario:     ScenarioHappy,
		GoalID:       "g-checkout",
		TargetServer: "mirror-runner",
		TargetTool:   "run_mirror",
		StartedAt:    "2026-06-03T10:00:00Z",
		EndedAt:      "2026-06-03T10:05:00Z",
	}
}

// TestTransport_BoundToolDrivesGreen proves the door is OPEN over the real transport: an impl
// that binds the target tool drives a real run to green, recorded with no truth write.
func TestTransport_BoundToolDrivesGreen(t *testing.T) {
	cs := connect(t, newServer())
	out := callDrive(t, cs, boundDriveInput())

	if out.Refused {
		t.Fatalf("a bound tool must NOT be refused: %+v", out.BlockReason)
	}
	if out.Run == nil {
		t.Fatal("a non-refused drive must record a run")
	}
	if string(out.Run.Result) != "green" {
		t.Fatalf("happy scenario must close green, got %q", out.Run.Result)
	}
	for i, a := range out.Run.Actions {
		if a.Autorisee && isAboveWaterline(a.Cible) {
			t.Fatalf("action %d wrote truth above the waterline: %q", i, a.Cible)
		}
	}
}

// TestTransport_UnboundToolRefusedAtBoundary is the crucial "is it real?" assertion: an impl
// that does NOT bind the target tool is REFUSED at the transport boundary, over the wire,
// with AGENT_TOOL_NOT_BOUND and NO run executed — the enforcer is on the call path.
func TestTransport_UnboundToolRefusedAtBoundary(t *testing.T) {
	cs := connect(t, newServerWithView(unboundView{}))
	out := callDrive(t, cs, boundDriveInput())

	if !out.Refused {
		t.Fatal("an impl that does NOT bind the target tool MUST be refused at the boundary")
	}
	if out.Run != nil {
		t.Fatalf("a refused call must NOT execute any run; got %+v", out.Run)
	}
	if out.BlockReason == nil || out.BlockReason.Code != blockreason.CodeAgentToolNotBound {
		t.Fatalf("refusal must carry AGENT_TOOL_NOT_BOUND, got %+v", out.BlockReason)
	}
}

// transport_integration_test.go — the BA23 TRANSPORT-INTEGRATION mirror (the "is it real?"
// test). It mounts the REAL scheduler MCP server connected to a REAL MCP client over an
// in-memory transport, and drives scheduler_tick / scheduler_assignments / scheduler_fence
// END TO END through the MCP serialization path. The point is that the dispatch capability
// is reachable + executable over the wire — not a faked return from a unit test.
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; the tick applies leases below the line.
package main

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

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

// TestTransport_TickDispatchesOverTheWire proves the dispatch capability is REAL over the
// transport: one scheduler_tick reclaims the dead-agent lease (epoch 3), keeps the dep-gated
// projection blocked, and leases the mirror-first head — all over the MCP serialization path.
func TestTransport_TickDispatchesOverTheWire(t *testing.T) {
	cs := connect(t, newServer())
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "scheduler_tick",
		Arguments: tickInput{Now: "2026-06-03T12:00:00Z", LeaseUntil: "2026-06-03T12:05:00Z"},
	})
	if err != nil {
		t.Fatalf("CallTool scheduler_tick: %v", err)
	}
	out := decode[tickOutput](t, res, "scheduler_tick")

	row := func(id string) rowView {
		for _, r := range out.Queue {
			if r.ItemID == id {
				return r
			}
		}
		t.Fatalf("no row %q in dispatch view", id)
		return rowView{}
	}
	if got := row("redset:checkout#dead"); got.LeaseEpoch != 3 || got.Status != "claimed" {
		t.Fatalf("dead item reclaimed+re-leased expected epoch 3 claimed, got epoch %d %q", got.LeaseEpoch, got.Status)
	}
	if got := row("redset:checkout#proj"); got.Status != "blocked" {
		t.Fatalf("dep-gated projection must stay blocked, got %q", got.Status)
	}
	if got := row("redset:checkout#mirror"); got.Status != "claimed" || got.OwnerAgent == "" {
		t.Fatalf("mirror head must be claimed by a role-matched agent, got %q owner %q", got.Status, got.OwnerAgent)
	}

	// the assignments are readable back over the transport.
	res2, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "scheduler_assignments", Arguments: struct{}{}})
	if err != nil {
		t.Fatalf("CallTool scheduler_assignments: %v", err)
	}
	asg := decode[assignmentsOutput](t, res2, "scheduler_assignments")
	if !asg.HadTick || len(asg.Assignments) == 0 {
		t.Fatalf("expected assignments after a tick, got %+v", asg)
	}
}

// TestTransport_FenceRefusesStaleEpoch proves the write-path fence is on the call path over
// the wire: a stale write epoch is refused with AGENT_LEASE_FENCED.
func TestTransport_FenceRefusesStaleEpoch(t *testing.T) {
	cs := connect(t, newServer())
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "scheduler_fence",
		Arguments: fenceInput{WriteEpoch: 1, CurrentEpoch: 2},
	})
	if err != nil {
		t.Fatalf("CallTool scheduler_fence: %v", err)
	}
	out := decode[fenceOutput](t, res, "scheduler_fence")
	if out.OK {
		t.Fatal("a stale write epoch MUST be fenced")
	}
	if out.BlockReason == nil || out.BlockReason.Code != blockreason.CodeAgentLeaseFenced {
		t.Fatalf("fenced write must carry AGENT_LEASE_FENCED, got %+v", out.BlockReason)
	}
}

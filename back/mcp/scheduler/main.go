// BA23 — the MCP server `scheduler`, the impure SHELL of the runtime ordonnanceur.
//
// ADR 0009 (every backend op is an MCP tool, no exception). The scheduler runtime's two
// below-the-line operations are exposed here as MCP tools:
//
//   - scheduler_tick      — run ONE scheduling pass (the pure Schedule planner), APPLY the
//     planned transitions ATOMICALLY under the aidos_scheduler role, and verify the epoch.
//     It is the "Dispatch next / Reclaim expired" capability the /agents panel binds to: a
//     dead-agent lease is reclaimed at the tick with no human, a dep-blocked item stays
//     blocked, and a leasable mirror-first head is staffed to its role-matched agent.
//   - scheduler_assignments — read the current AgentAssignments (leased | running |
//     released | expired) the last tick produced (read-only).
//
// THE WALL (CLAUDE.md §2). Every DECISION is the pure scheduler.Schedule planner; this
// shell only sequences it and applies the four transition columns under the scheduler
// role (the column-scoped UPDATE of scheduler_role_baseline.sql, BA20). It writes
// TELEMETRY + LEASES below the line — NEVER a truth schema (kernel/mirrors/fitness), never
// an idea/mirror. The applier here captures the result in-process (the testable seam); the
// production applier issues the scheduler-role UPDATE. The epoch fence (scheduler.Fence) is
// re-checked at apply so a stale write is refused (AGENT_LEASE_FENCED) — no lost-update.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The tool is a thin wrapper over the pure planner:
// `now` and `lease_until` are SUPPLIED in the request (no arg-less clock in the MCP path —
// the only sanctioned clock is the runtime daemon's Driver, BA22). Same request ⇒ same
// ScheduleResult. The reproducibility mirror (repro_property_test.go) pins it.
package main

import (
	"context"
	"fmt"
	"log"
	"sort"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/scheduler"
)

// ── the in-process applier seam ──
//
// captureApplier records the last applied ScheduleResult so scheduler_assignments can read
// it back. In production this is replaced by the aidos_scheduler-role UPDATE applier (the
// BA22 Applier interface), which issues the column-scoped UPDATE; here it is the testable,
// pure-memory capture. Either way the DECISION came from the pure planner.
type captureApplier struct {
	last scheduler.ScheduleResult
	had  bool
}

// Apply records the result (below the line — a lease/telemetry write, never truth).
func (c *captureApplier) Apply(result scheduler.ScheduleResult) error {
	c.last = result
	c.had = true
	return nil
}

// server holds the scheduler shell's state: the current queue + candidate roster (in
// production projected from runtime.red_work_queue + kernel.agent_layer under the scheduler
// role's SELECT), and the applier that captured the last tick.
type server struct {
	queue   []scheduler.QueueEntry
	agents  []scheduler.Candidate
	applier *captureApplier
}

// ── Tool I/O types (JSON-serialisable) ──

// tickInput supplies the per-tick clock + lease window (SUPPLIED — no arg-less clock here).
// Optional fixture overrides let a caller (and the BDD mirror) drive a known queue.
type tickInput struct {
	Now        string                 `json:"now" jsonschema:"RFC3339 instant for this tick (SUPPLIED — no arg-less clock in the MCP path)"`
	LeaseUntil string                 `json:"lease_until" jsonschema:"RFC3339 expiry to stamp on fresh leases this tick (SUPPLIED)"`
	Queue      []scheduler.QueueEntry `json:"queue,omitempty" jsonschema:"optional queue override; defaults to the server's current queue"`
	Agents     []scheduler.Candidate  `json:"agents,omitempty" jsonschema:"optional candidate roster override; defaults to the server's roster"`
}

// tickOutput is the planned + applied result of one scheduling pass.
type tickOutput struct {
	Queue       []rowView                   `json:"queue"`
	Assignments []scheduler.AgentAssignment `json:"assignments"`
	// Starvation is set iff the mirror-first head could not be staffed this tick — the
	// still_red anti-famine signal (gap E3) the /agents panel surfaces as an alert.
	Starvation *scheduler.StarvationSignal `json:"starvation,omitempty"`
}

// rowView is one queue row after the tick — the dispatch view the /agents panel renders
// (status / owner / lease / epoch + whether it is blocked on unresolved deps).
type rowView struct {
	ItemID       string   `json:"item_id"`
	Layer        string   `json:"layer"`
	Status       string   `json:"status"`
	OwnerAgent   string   `json:"owner_agent"`
	LeaseUntil   string   `json:"lease_until"`
	LeaseEpoch   int64    `json:"lease_epoch"`
	Dependencies []string `json:"dependencies,omitempty"`
}

// assignmentsOutput reads back the last tick's assignments (read-only).
type assignmentsOutput struct {
	Assignments []scheduler.AgentAssignment `json:"assignments"`
	HadTick     bool                        `json:"had_tick"`
}

// fenceInput / fenceOutput expose the write-path epoch fence as a tool — a stale write is
// refused (AGENT_LEASE_FENCED), proving the gate is on the path (not a unit-test return).
type fenceInput struct {
	WriteEpoch   int64 `json:"write_epoch" jsonschema:"the lease epoch the write carries"`
	CurrentEpoch int64 `json:"current_epoch" jsonschema:"the item's current (truth) lease epoch"`
}
type fenceOutput struct {
	OK          bool                     `json:"ok"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// tick is the capability: run ONE pure scheduling pass over the (possibly overridden)
// queue + roster at the supplied `now`, APPLY the result via the applier (below the line),
// and return the dispatch view + any starvation signal. The DECISION is the pure planner;
// the shell only sequences + applies. It re-checks the epoch fence implicitly (the planner's
// monotone epoch + the Apply seam mirror the scheduler-role UPDATE's WHERE guard).
func (s *server) tick(_ context.Context, _ *mcp.CallToolRequest, in tickInput) (*mcp.CallToolResult, tickOutput, error) {
	if in.Now == "" {
		return nil, tickOutput{}, fmt.Errorf("scheduler: tick needs a supplied `now` (no arg-less clock)")
	}
	if in.LeaseUntil == "" {
		return nil, tickOutput{}, fmt.Errorf("scheduler: tick needs a supplied `lease_until`")
	}
	queue := s.queue
	if in.Queue != nil {
		queue = in.Queue
	}
	agents := s.agents
	if in.Agents != nil {
		agents = in.Agents
	}

	result := scheduler.Schedule(queue, agents, in.Now, in.LeaseUntil)
	// APPLY below the line — the scheduler-role UPDATE on the four transition columns; here
	// captured in-process. The driver re-runs this every tick so a dead-agent lease reclaims
	// with no human action.
	if err := s.applier.Apply(result); err != nil {
		return nil, tickOutput{}, fmt.Errorf("scheduler: apply: %w", err)
	}
	// the applied result becomes the server's current queue (the next tick plans over it).
	s.queue = result.Queue

	out := tickOutput{Assignments: result.Assignments}
	for _, e := range result.Queue {
		out.Queue = append(out.Queue, rowView{
			ItemID:       e.Item.ItemID,
			Layer:        string(e.Layer),
			Status:       string(e.Item.Status),
			OwnerAgent:   e.Item.OwnerAgent,
			LeaseUntil:   e.Item.LeaseUntil,
			LeaseEpoch:   e.Item.LeaseEpoch,
			Dependencies: e.Dependencies,
		})
	}
	// anti-famine (gap E3): if the mirror-first head of the leasable open items could not be
	// staffed, surface the still_red signal. ticksWaited=threshold so a single unstaffed tick
	// surfaces it in the panel (the daemon counts real ticks; the MCP tool is single-shot).
	if head, ok := headOfOpen(result.Queue); ok {
		if sig, starving := scheduler.DetectStarvation(head, agents, 1, 1); starving {
			out.Starvation = &sig
		}
	}
	return nil, out, nil
}

// assignments reads back the last tick's AgentAssignments (read-only).
func (s *server) assignments(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, assignmentsOutput, error) {
	if !s.applier.had {
		return nil, assignmentsOutput{HadTick: false}, nil
	}
	out := assignmentsOutput{HadTick: true}
	out.Assignments = append(out.Assignments, s.applier.last.Assignments...)
	return nil, out, nil
}

// fence exposes the deterministic write-path epoch fence as a tool (the gate ON the path):
// a stale (or future) write epoch is refused with AGENT_LEASE_FENCED — no lost-update.
func (s *server) fenceTool(_ context.Context, _ *mcp.CallToolRequest, in fenceInput) (*mcp.CallToolResult, fenceOutput, error) {
	v := scheduler.Fence(in.WriteEpoch, in.CurrentEpoch)
	return nil, fenceOutput{OK: v.OK, BlockReason: v.BlockReason}, nil
}

// headOfOpen returns the mirror-first head among the OPEN items (the leasable head the
// staffing round considers). It mirrors the planner's leasable selection.
func headOfOpen(queue []scheduler.QueueEntry) (scheduler.QueueEntry, bool) {
	var open []scheduler.QueueEntry
	for _, e := range queue {
		if e.Item.Status == scheduler.StatusOpen {
			open = append(open, e)
		}
	}
	return scheduler.HeadOf(open)
}

// newMCPServer builds the MCP server and registers the scheduler tools.
func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-scheduler", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "scheduler_tick", Description: "Run ONE scheduling pass (pure Schedule planner), apply the transitions atomically under the scheduler role (below the line — never truth), and return the dispatch view + any starvation signal. Reclaims a dead-agent lease with no human, keeps a dep-blocked item blocked, staffs the mirror-first head role-matched."}, s.tick)
	mcp.AddTool(srv, &mcp.Tool{Name: "scheduler_assignments", Description: "Read the AgentAssignments (leased|running|released|expired) the last tick produced (read-only)."}, s.assignments)
	mcp.AddTool(srv, &mcp.Tool{Name: "scheduler_fence", Description: "Write-path epoch fence: refuse a stale/future write epoch with AGENT_LEASE_FENCED (no lost-update). The gate, on the call path."}, s.fenceTool)
	return srv
}

// newServer builds the shell over the canonical BA23 dispatch fixture: a mirror-first
// queue with a dep-blocked projection and a dead-agent (expired) lease, plus a roster with
// a free bdd-writer and executor. It is the same fixture the /agents panel + the e2e drive.
func newServer() *server {
	return &server{
		queue:   fixtureQueue(),
		agents:  fixtureAgents(),
		applier: &captureApplier{},
	}
}

// fixtureQueue is the canonical dispatch fixture (sorted mirror-first for a stable view).
func fixtureQueue() []scheduler.QueueEntry {
	q := []scheduler.QueueEntry{
		{
			Item:  scheduler.WorkItem{ItemID: "redset:checkout#mirror", Status: scheduler.StatusOpen, LeaseEpoch: 0},
			Layer: scheduler.LayerMirror,
		},
		{
			Item:         scheduler.WorkItem{ItemID: "redset:checkout#proj", Status: scheduler.StatusOpen, LeaseEpoch: 0},
			Layer:        scheduler.LayerProjection,
			Dependencies: []string{"redset:checkout#mirror"},
		},
		{
			Item:  scheduler.WorkItem{ItemID: "redset:checkout#dead", Status: scheduler.StatusClaimed, OwnerAgent: "executor@v1", LeaseUntil: "2026-06-03T11:00:00Z", LeaseEpoch: 2},
			Layer: scheduler.LayerOperationAction,
		},
	}
	sort.SliceStable(q, func(i, j int) bool {
		ri, rj := scheduler.LayerRank(q[i].Layer), scheduler.LayerRank(q[j].Layer)
		if ri != rj {
			return ri < rj
		}
		return q[i].Item.ItemID < q[j].Item.ItemID
	})
	return q
}

func fixtureAgents() []scheduler.Candidate {
	return []scheduler.Candidate{
		{Ref: "bdd-writer@v1", Role: "bdd-writer", Free: true},
		{Ref: "executor@v1", Role: "executor", Free: true},
	}
}

func main() {
	srv := newMCPServer(newServer())
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("scheduler: run: %v", err)
	}
}

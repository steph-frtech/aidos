// Command async-operation is the AIDOS Kernel ASYNC / SCHEDULED operation + OUTBOX MCP server
// (S73; ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over S73 (back/kernel/operation async.go): the async/scheduled
// extension of the Operation DSL — a THIRD dimension (cron / queue / webhook_out / notification)
// with the transactional OUTBOX pattern (exactly-once relative). It validates an async block
// (refusing ASYNC_UNKNOWN_TRIGGER_KIND / ASYNC_CRON_MISSING_ECHEANCE, never coercing),
// content-addresses an effect (the idempotency key), answers the scheduling predicate (due),
// ticks a schedule against an INJECTED clock (pure), and dispatches an outbox exactly-once.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it validates, addresses, schedules
// and dispatches as VALUES, and writes NOTHING (an async operation is a SOURCE above the line;
// the outbox is a runtime datastore table, never the truth-store; only the `aidos` CLI via an
// approved changeset writes the kernel). It reads what the caller pins; it never authors an
// async operation into truth.
//
// Tools (one tool = one backend op):
//
//	async_validate    — validate an async block (trigger + effects) → ok | ASYNC_* BlockReason
//	async_effect_id   — content-address an effect (the exactly-once-relative idempotency key)
//	async_due         — the scheduling predicate: is an echeance due at now? (now ≥ echeance)
//	async_tick        — tick a schedule against an injected clock → the fired operation names
//	async_dispatch    — dispatch an outbox exactly-once → delivered effects + suppressed replays
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock
// (it is INJECTED), no rng, no I/O, never an LLM. The hash REUSES records.Hash verbatim; the
// refusal REUSES blockreason; the scheduler is code. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ── async_validate ──

type validateInput struct {
	Async operation.Async `json:"async" jsonschema:"the async block (trigger {kind, at}, effects[])"`
}

type validateOutput struct {
	OK    bool                     `json:"ok"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func validate(_ context.Context, _ *mcp.CallToolRequest, in validateInput) (*mcp.CallToolResult, validateOutput, error) {
	if err := operation.ValidateAsync(in.Async); err != nil {
		br := operation.BlockAsync(err)
		return nil, validateOutput{OK: false, Block: &br}, nil
	}
	return nil, validateOutput{OK: true}, nil
}

// ── async_effect_id ──

type effectIDInput struct {
	Effect operation.Effect `json:"effect" jsonschema:"the side-effect to content-address (kind, target, payload)"`
}

type effectIDOutput struct {
	OK bool   `json:"ok"`
	ID string `json:"id,omitempty"`
}

func effectID(_ context.Context, _ *mcp.CallToolRequest, in effectIDInput) (*mcp.CallToolResult, effectIDOutput, error) {
	id, err := operation.EffectID(in.Effect)
	if err != nil {
		return nil, effectIDOutput{OK: false}, nil
	}
	return nil, effectIDOutput{OK: true, ID: id}, nil
}

// ── async_due ──

type dueInput struct {
	Echeance string `json:"echeance" jsonschema:"the RFC3339 echeance of a cron trigger"`
	Now      string `json:"now" jsonschema:"the RFC3339 instant of the injected clock"`
}

type dueOutput struct {
	OK  bool `json:"ok"`
	Due bool `json:"due"`
}

func due(_ context.Context, _ *mcp.CallToolRequest, in dueInput) (*mcp.CallToolResult, dueOutput, error) {
	d, err := operation.Due(in.Echeance, in.Now)
	if err != nil {
		return nil, dueOutput{OK: false}, nil
	}
	return nil, dueOutput{OK: true, Due: d}, nil
}

// ── async_tick ──

type tickInput struct {
	Scheduled []operation.ScheduledOp `json:"scheduled" jsonschema:"the scheduled operations (name + cron trigger)"`
	Now       string                  `json:"now" jsonschema:"the RFC3339 instant of the injected clock"`
}

type tickOutput struct {
	OK    bool     `json:"ok"`
	Fired []string `json:"fired"`
}

func tick(_ context.Context, _ *mcp.CallToolRequest, in tickInput) (*mcp.CallToolResult, tickOutput, error) {
	fired, err := operation.Tick(in.Scheduled, operation.FixedClock{At: in.Now})
	if err != nil {
		return nil, tickOutput{OK: false}, nil
	}
	if fired == nil {
		fired = []string{}
	}
	return nil, tickOutput{OK: true, Fired: fired}, nil
}

// ── async_dispatch ──

// dispatchInput presents the outbox + the already-dispatched id set as VALUES (the MCP
// is stateless / pure): the tool replays Dispatch over this snapshot and reports the
// deliveries + the suppressions, never touching a real datastore (the wall).
type dispatchInput struct {
	Pending    []operation.OutboxEntry `json:"pending" jsonschema:"the PENDING outbox entries (id, effect, status)"`
	Dispatched []string                `json:"dispatched" jsonschema:"the ids already dispatched (the dedup set)"`
}

type dispatchOutput struct {
	OK         bool     `json:"ok"`
	Delivered  int      `json:"delivered"`  // effects actually delivered this run
	Suppressed []string `json:"suppressed"` // ids recognised as already-dispatched (replays)
}

// snapshotOutbox is a pure, value-backed Outbox the MCP builds from the input — no DB.
type snapshotOutbox struct {
	pending    []operation.OutboxEntry
	dispatched map[string]bool
	suppressed []string
}

func (o *snapshotOutbox) Pending() []operation.OutboxEntry { return o.pending }
func (o *snapshotOutbox) MarkDispatched(id string)         { o.dispatched[id] = true }
func (o *snapshotOutbox) IsDispatched(id string) bool {
	if o.dispatched[id] {
		o.suppressed = append(o.suppressed, id)
		return true
	}
	return false
}

// countingSink records deliveries without reaching the world (pure).
type countingSink struct{}

func (countingSink) Deliver(_ operation.Effect) error { return nil }

func dispatch(_ context.Context, _ *mcp.CallToolRequest, in dispatchInput) (*mcp.CallToolResult, dispatchOutput, error) {
	disp := make(map[string]bool, len(in.Dispatched))
	for _, id := range in.Dispatched {
		disp[id] = true
	}
	ob := &snapshotOutbox{pending: in.Pending, dispatched: disp}
	delivered, err := operation.Dispatch(ob, countingSink{})
	if err != nil {
		return nil, dispatchOutput{OK: false}, nil
	}
	sup := ob.suppressed
	if sup == nil {
		sup = []string{}
	}
	return nil, dispatchOutput{OK: true, Delivered: delivered, Suppressed: sup}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-async-operation", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "async_validate", Description: "S73: validate an async block (trigger {cron|queue|webhook_out|notification} + effects) → ok, or ASYNC_UNKNOWN_TRIGGER_KIND / ASYNC_CRON_MISSING_ECHEANCE (never coerced). PURE, writes nothing (the wall)."}, validate)
	mcp.AddTool(srv, &mcp.Tool{Name: "async_effect_id", Description: "S73: content-address an effect (id = Hash(Canonicalize(effect))) — the exactly-once-relative idempotency key the dispatcher dedupes on. PURE, writes nothing."}, effectID)
	mcp.AddTool(srv, &mcp.Tool{Name: "async_due", Description: "S73: the scheduling predicate — is a cron echeance due at the injected now? (now ≥ echeance). PURE, the clock is INJECTED, writes nothing."}, due)
	mcp.AddTool(srv, &mcp.Tool{Name: "async_tick", Description: "S73: tick a schedule against an injected clock → the SORTED names of the operations whose echeance has arrived. PURE function of (schedule, now), never an LLM. Writes nothing."}, tick)
	mcp.AddTool(srv, &mcp.Tool{Name: "async_dispatch", Description: "S73: dispatch an outbox exactly-once-relative → delivered effects + suppressed replays (a content-addressed id already dispatched is suppressed). PURE over value-snapshots, writes nothing."}, dispatch)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("async-operation: run: %w", err))
	}
}

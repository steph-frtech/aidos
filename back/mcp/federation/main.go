// Command federation is the AIDOS Runtime cross-cell federation MCP server (S103; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over S103 (back/runtime/federation): the COMPOSITION layer that
// wires the cross-cell invariant kinds (S48 GlobalInvariant, S49 SagaInvariant, S50
// TemporalInvariant) onto REAL MULTIPLE cells (S100) and the runtime red-wave (S22) — §51.
//
//	saga_over_cells     — run the canonical saga (payment_captured ⇒ order_confirmed ∨
//	                      compensation) over two REAL contracted cells; a broken leg triggers
//	                      compensation; a non-contracted pair is refused (CROSS_CELL_NO_CONTRACT).
//	fan_out             — a GLOBAL policy (a GlobalInvariant expressed once) fans out to a
//	                      RedWorkQueue PER CELL; non-violating cells stay GREEN (§51).
//	temporal_over_cells — a temporal deadline (within) across two REAL contracted cells.
//	affected_cells      — project a fan-out result to the cells it actually reddened.
//
// THE WALL (CLAUDE.md §2): this server is READ-ONLY — it returns the per-cell RedWorkQueue
// rows as VALUES and writes NOTHING to the kernel/mirrors/fitness; the actual INSERT into
// runtime.red_work_queue is the S22 PostKernelChange hook's job below the waterline.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. Same input → identical output (the S103 reproducibility
// mirror). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/cell"
	gi "github.com/steph-frtech/aidos/back/kernel/globalinvariant"
	"github.com/steph-frtech/aidos/back/kernel/sagas"
	"github.com/steph-frtech/aidos/back/kernel/temporal"
	"github.com/steph-frtech/aidos/back/runtime/federation"
)

// ── saga_over_cells ──

type sagaInput struct {
	Saga       sagas.SagaInvariant `json:"saga" jsonschema:"the cross-cell saga invariant (≥2 participant cells)"`
	Federation cell.Federation     `json:"federation" jsonschema:"the context-map: the contracts_with links between cells"`
	Trace      sagas.Trace         `json:"trace" jsonschema:"the ordered events the federation emitted"`
}

func sagaOverCells(_ context.Context, _ *mcp.CallToolRequest, in sagaInput) (*mcp.CallToolResult, federation.SagaRun, error) {
	return nil, federation.SagaOverCells(in.Saga, in.Federation, in.Trace), nil
}

// ── fan_out ──

type fanOutInput struct {
	Policy       gi.GlobalInvariant         `json:"policy" jsonschema:"the global policy invariant expressed once over the federation"`
	ViolatedCell gi.CellRef                 `json:"violated_cell" jsonschema:"the cell the policy violation seeds the fan-out at"`
	PolicyWaveID string                     `json:"policy_wave_id" jsonschema:"the policy bump's content address — stamps every cell's queue row"`
	Cells        []federation.CellViolation `json:"cells" jsonschema:"per-cell: does it violate the policy, and its own stale edges/heads"`
}

type fanOutOutput struct {
	Waves    []federation.CellRedWave `json:"waves"`
	Affected []gi.CellRef             `json:"affected"`
}

func fanOut(_ context.Context, _ *mcp.CallToolRequest, in fanOutInput) (*mcp.CallToolResult, fanOutOutput, error) {
	waves := federation.FanOut(in.Policy, in.ViolatedCell, in.PolicyWaveID, in.Cells)
	return nil, fanOutOutput{Waves: waves, Affected: federation.AffectedCells(waves)}, nil
}

// ── temporal_over_cells ──

type temporalInput struct {
	Invariant      temporal.TemporalInvariant `json:"invariant" jsonschema:"the temporal (within) invariant crossing two cells"`
	AntecedentCell cell.Ref                   `json:"antecedent_cell" jsonschema:"the cell that emits the antecedent event"`
	ConsequentCell cell.Ref                   `json:"consequent_cell" jsonschema:"the cell that must emit the consequent within the bound"`
	Federation     cell.Federation            `json:"federation" jsonschema:"the context-map of contracts_with links"`
	Observation    temporal.Observation       `json:"observation" jsonschema:"the observed event order + elapsed time (passed in, never read here)"`
}

func temporalOverCells(_ context.Context, _ *mcp.CallToolRequest, in temporalInput) (*mcp.CallToolResult, federation.TemporalRun, error) {
	return nil, federation.TemporalOverCells(in.Invariant, in.AntecedentCell, in.ConsequentCell, in.Federation, in.Observation), nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-federation", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "saga_over_cells", Description: "S103/§51: run the canonical saga (payment_captured ⇒ order_confirmed ∨ compensation) over two REAL contracted cells; a broken leg triggers the declared compensation; a non-contracted pair is refused (CROSS_CELL_NO_CONTRACT). PURE, deterministic, writes nothing (the wall)."}, sagaOverCells)
	mcp.AddTool(srv, &mcp.Tool{Name: "fan_out", Description: "S103/§51: a GLOBAL policy expressed once fans out to a RedWorkQueue PER CELL — each violating cell gets its own queue stamped with the policy wave id; non-violating cells stay GREEN. PURE, deterministic, writes nothing (the S22 hook does the INSERT below the waterline)."}, fanOut)
	mcp.AddTool(srv, &mcp.Tool{Name: "temporal_over_cells", Description: "S103/§51: evaluate a temporal `within` deadline crossing two REAL contracted cells; a non-contracted pair is refused. PURE, no wall clock (elapsed is passed in), deterministic."}, temporalOverCells)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("federation: run: %w", err))
	}
}

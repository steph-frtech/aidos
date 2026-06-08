// Command cell is the AIDOS S100 CELL (bounded context federation) MCP server (ADR 0009:
// every backend op is an MCP tool; app-builder EPIC 11).
//
// It is the capability door over kernel/cell: the FEDERATION primitive that partitions a
// project's Kernel into small per-cell sub-Kernels (KRD §43–§51), each with its OWN ratchet,
// linked ONLY by versioned contracts_with (S17). Tools:
//
//	partition    — Project → []Cell — split the project's Kernel into per-cell sub-Kernels by
//	               bounded_context; a node with no cell is refused. PURE.
//	cell_pack    — (Project, cell, Federation) → CellContextPack — the per-cell context
//	               frontier: the cell's OWN Kernel + ONLY contracted neighbors' PUBLIC contracts,
//	               never a neighbor's internals (the done-criterion, half 1). PURE, content-addressed.
//	check_access — (from, to, Federation) → BlockReason|nil — a cross-cell access without a
//	               honored contracts_with link is refused CROSS_CELL_NO_CONTRACT (the done-criterion,
//	               half 2). PURE.
//	shippable    — []Cell → []cell — the cells that ship (green ratchet), INDEPENDENT per cell
//	               (§43 fractal). PURE.
//
// THE WALL (CLAUDE.md §2/§9): pure planning + pure comparisons over supplied facts — writes
// NOTHING to the kernel/mirrors/fitness. The Context-Map (which cells exist, which contract)
// persists via a ChangeSet (S101), never a direct write from here; a cross-cell refusal is a
// typed BlockReason, not a prison. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/cell"
)

type partitionInput struct {
	Project cell.Project `json:"project" jsonschema:"the project view: its kernel nodes (each tagged with its cell + kind) and each cell's own ratchet state"`
}

type partitionOutput struct {
	OK    bool        `json:"ok"`
	Cells []cell.Cell `json:"cells,omitempty"`
	Error string      `json:"error,omitempty"`
}

func partitionTool(_ context.Context, _ *mcp.CallToolRequest, in partitionInput) (*mcp.CallToolResult, partitionOutput, error) {
	cells, err := cell.Partition(in.Project)
	if err != nil {
		return nil, partitionOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, partitionOutput{OK: true, Cells: cells}, nil
}

type cellPackInput struct {
	Project    cell.Project    `json:"project" jsonschema:"the project view (nodes + ratchets)"`
	Cell       cell.Ref        `json:"cell" jsonschema:"the target cell the context frontier is compiled for"`
	Federation cell.Federation `json:"federation" jsonschema:"the contracts_with links between the project's cells (the Context-Map)"`
}

type cellPackOutput struct {
	OK   bool                 `json:"ok"`
	Pack cell.CellContextPack `json:"pack"`
}

func cellPackTool(_ context.Context, _ *mcp.CallToolRequest, in cellPackInput) (*mcp.CallToolResult, cellPackOutput, error) {
	return nil, cellPackOutput{OK: true, Pack: cell.CellPack(in.Project, in.Cell, in.Federation)}, nil
}

type checkAccessInput struct {
	From       cell.Ref        `json:"from" jsonschema:"the cell requesting access"`
	To         cell.Ref        `json:"to" jsonschema:"the cell being accessed"`
	Federation cell.Federation `json:"federation" jsonschema:"the contracts_with links (the Context-Map)"`
}

type checkAccessOutput struct {
	OK      bool              `json:"ok"`
	Allowed bool              `json:"allowed"`
	Block   *cell.BlockReason `json:"block,omitempty"`
}

func checkAccessTool(_ context.Context, _ *mcp.CallToolRequest, in checkAccessInput) (*mcp.CallToolResult, checkAccessOutput, error) {
	br := cell.CheckCrossCellAccess(in.From, in.To, in.Federation)
	return nil, checkAccessOutput{OK: true, Allowed: br == nil, Block: br}, nil
}

type shippableInput struct {
	Cells []cell.Cell `json:"cells" jsonschema:"the partitioned cells (from partition)"`
}

type shippableOutput struct {
	OK        bool       `json:"ok"`
	Shippable []cell.Ref `json:"shippable"`
}

func shippableTool(_ context.Context, _ *mcp.CallToolRequest, in shippableInput) (*mcp.CallToolResult, shippableOutput, error) {
	return nil, shippableOutput{OK: true, Shippable: cell.ShippableCells(in.Cells)}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-cell", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "partition", Description: "S100: split a project's Kernel into per-cell sub-Kernels by bounded_context (KRD §43), each with its own ratchet. A node with no cell is refused (no node lives outside a cell). PURE, writes nothing (the wall)."}, partitionTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "cell_pack", Description: "S100: compile a cell's context frontier — its OWN Kernel + ONLY contracted neighbors' PUBLIC contracts, never a neighbor's internals (§145). PURE, content-addressed, reproducible. Writes nothing (the wall)."}, cellPackTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "check_access", Description: "S100: a cross-cell access without a honored contracts_with link (S17) is refused CROSS_CELL_NO_CONTRACT (§46). Own-cell + contracted access pass. PURE; the refusal names the fix path."}, checkAccessTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "shippable", Description: "S100: the cells that ship — green ratchet, INDEPENDENT per cell (§43 fractal): a green cell ships even while a sibling is red. PURE."}, shippableTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("cell: run: %w", err))
	}
}

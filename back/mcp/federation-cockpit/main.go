// Command federation-cockpit is the AIDOS Workbench federation-cockpit MCP server (S105; ADR
// 0009: every backend op is an MCP tool).
//
// It is the capability door over S105 (back/runtime/cockpit): the §50 "cockpit de fédération"
// assembler that snapshots a project's federation into ONE cockpit view — the cell graph, the
// inter-cell contracts, the status of BOTH ratchets (S100 behavioural + S102 structural), local
// vs global stability, and the red-wave fan-out.
//
//	assemble_snapshot — compose the whole cockpit (cell.Partition + archfitness.Measure/Ratchet
//	                    + red-wave fan-out): each cell's two ratchets, the contracts, the
//	                    structural verdict, the cells that ship right now, the reddened cells, and
//	                    whether the federation is globally stable. The §50 done-criterion: a green
//	                    cell SHIPS while a reddened neighbor is still red.
//
// THE WALL (CLAUDE.md §2): this server is READ-ONLY — it returns a VALUE and writes NOTHING to
// the kernel/mirrors/fitness; the structural baseline moves only via a DRAFT ChangeSet (S102),
// the per-cell RedWorkQueue INSERT is the S22 hook's job below the waterline.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the tool is a PURE function of its input — no clock, no
// rng, no I/O, never an LLM. Same input → identical snapshot (the S105 reproducibility mirror).
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/mirror/archfitness"
	"github.com/steph-frtech/aidos/back/runtime/cockpit"
)

// ── assemble_snapshot ──

type assembleInput struct {
	Project  cell.Project                 `json:"project" jsonschema:"the project's kernel nodes (tagged with their cell) + per-cell ratchet state"`
	DepGraph archfitness.DepGraph         `json:"dep_graph" jsonschema:"the candidate cut's inter-cell dependency graph (the structural ratchet input)"`
	Baseline archfitness.StructuralMetric `json:"baseline" jsonschema:"the structural baseline the candidate cut is ratcheted against"`
	Fed      cell.Federation              `json:"federation" jsonschema:"the context-map: the contracts_with links between cells"`
	Wave     cockpit.FanOutSpec           `json:"wave" jsonschema:"the active red-wave fan-out: the policy wave id + which spanned cells violate it (empty ⇒ no active wave)"`
}

func assembleSnapshot(_ context.Context, _ *mcp.CallToolRequest, in assembleInput) (*mcp.CallToolResult, cockpit.CockpitSnapshot, error) {
	snap, err := cockpit.AssembleSnapshot(in.Project, in.DepGraph, in.Baseline, in.Fed, in.Wave)
	if err != nil {
		return nil, cockpit.CockpitSnapshot{}, err
	}
	return nil, snap, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-federation-cockpit", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "assemble_snapshot", Description: "S105/§50: assemble the federation cockpit — the cell graph, the inter-cell contracts, BOTH ratchets (S100 behavioural per cell + S102 structural over the cut), the cells that ship right now (local stability), the reddened cells (red-wave fan-out), and whether the federation is globally stable. The done-criterion: a green cell SHIPS while a reddened neighbor is still red. PURE, deterministic, writes nothing (the wall)."}, assembleSnapshot)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("federation-cockpit: run: %w", err))
	}
}

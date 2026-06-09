// Command truth-level is the AIDOS Kernel truth-level MCP server (FK01; ADR 0009: every
// backend op is an MCP tool).
//
// It is the capability door over FK01 (back/kernel/truthlevel): the seven KRD truth
// levels (FKE-5, Raw→Reconciled) and their deterministic transition:
//
//	compute       — the SOLE legal writer of a truth_level: signals → the highest rung.
//	check_parity  — the parity mirror: stored vs computed (divergence = RED, aligned = GREEN).
//	levels        — the seven canonical FKE-5 rungs in Raw→Reconciled order (the panel filter set).
//
// THE WALL (CLAUDE.md §2): this server WRITES NOTHING to the kernel/mirrors/fitness. The
// level is a value the transition COMPUTES; persisting it onto a record goes through the
// privileged aidos CLI role at the legal door, never from here.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no
// clock, no rng, no I/O, never an LLM. Same signals → same level (the FK01 done-criterion).
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/truthlevel"
)

// ── compute ──

type computeInput struct {
	Signals truthlevel.Signals `json:"signals" jsonschema:"the FKE-5 provenance doors (idea/changeset/mirror/evidence/conscience), one boolean each"`
}

type computeOutput struct {
	OK    bool   `json:"ok"`
	Level int    `json:"level"`
	Name  string `json:"name"`
}

func compute(_ context.Context, _ *mcp.CallToolRequest, in computeInput) (*mcp.CallToolResult, computeOutput, error) {
	lvl := truthlevel.Compute(in.Signals)
	return nil, computeOutput{OK: true, Level: int(lvl), Name: lvl.Name()}, nil
}

// ── check_parity ──

type parityInput struct {
	Stored  int                `json:"stored" jsonschema:"the rung stored on the record (1=raw … 7=reconciled, 0=unknown)"`
	Signals truthlevel.Signals `json:"signals" jsonschema:"the record's provenance doors, to recompute the level"`
}

type parityOutput struct {
	OK       bool   `json:"ok"`
	Aligned  bool   `json:"aligned"`
	Stored   int    `json:"stored"`
	Computed int    `json:"computed"`
	Reason   string `json:"reason,omitempty"`
}

func checkParity(_ context.Context, _ *mcp.CallToolRequest, in parityInput) (*mcp.CallToolResult, parityOutput, error) {
	res, err := truthlevel.CheckParity(truthlevel.Level(in.Stored), in.Signals)
	out := parityOutput{OK: true, Aligned: res.Aligned, Stored: int(res.Stored), Computed: int(res.Computed)}
	if err != nil {
		out.Reason = err.Error()
	}
	return nil, out, nil
}

// ── levels ──

type levelsInput struct{}

type levelRow struct {
	Level int    `json:"level"`
	Name  string `json:"name"`
}

type levelsOutput struct {
	OK     bool       `json:"ok"`
	Levels []levelRow `json:"levels"`
}

func levels(_ context.Context, _ *mcp.CallToolRequest, _ levelsInput) (*mcp.CallToolResult, levelsOutput, error) {
	out := levelsOutput{OK: true}
	for _, l := range truthlevel.Levels() {
		out.Levels = append(out.Levels, levelRow{Level: int(l), Name: l.Name()})
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-truth-level", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "compute", Description: "FK01: the SOLE legal writer of a truth_level — map the FKE-5 provenance doors (signals) to the highest satisfied rung (Raw→Reconciled). PURE, total, deterministic; writes nothing (the wall)."}, compute)
	mcp.AddTool(srv, &mcp.Tool{Name: "check_parity", Description: "FK01: the parity mirror — recompute the level from the signals and compare to the stored rung. aligned=GREEN, divergence=RED (the stored level is a cache proven by the computation). PURE."}, checkParity)
	mcp.AddTool(srv, &mcp.Tool{Name: "levels", Description: "FK01: the seven canonical FKE-5 truth levels (Raw→Reconciled) — the panel filter set, never invented. PURE."}, levels)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("truth-level: run: %w", err))
	}
}

// Command strangler is the AIDOS Archive STRANGLER-FIG MCP server (S104; ADR 0009: every
// backend op is an MCP tool).
//
// It is the capability door over S104 (back/archive/strangler): the §50 strangler-fig pattern
// for absorbing a LEGACY system into the federation without a big-bang rewrite —
//
//	carve    — draw a cell boundary around the legacy (S100 bounded context) and validate it is
//	           observable; refuse a legacy with no observed behaviour (STRANGLER_NO_OBSERVED_BEHAVIOUR).
//	freeze   — auto-generate one CHARACTERIZATION mirror per observed (input → output) trace: a
//	           content-addressed fixture mirror pinning "whatever the legacy currently does".
//	refactor — run the frozen characterization mirrors against the REFACTORED implementation's
//	           observed behaviour; ACCEPT iff every mirror stays GREEN ∧ the published contract is
//	           honored; refuse a drift (STRANGLER_CHARACTERIZATION_DRIFT) or a broken contract.
//
// THE WALL (CLAUDE.md §2): this server is READ-ONLY — it returns the StranglerCell, the
// characterization mirrors and the refactor verdict as VALUES and writes NOTHING to the
// kernel/mirrors/fitness; the StranglerCell + its mirrors persist via ChangeSet (the mirrors
// schema is above the line), never a direct write from here.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. Characterization-mirror generation is DETERMINISTIC CODE
// (observed traces → fixture mirrors), never an LLM "write some tests". Same input → identical
// output (the S104 reproducibility mirror). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/strangler"
)

// ── carve ──

type carveInput struct {
	Legacy strangler.Legacy `json:"legacy" jsonschema:"the legacy to absorb: its cell ref, internal nodes, published contract id, and the observed input→output traces of its current behaviour"`
}

type carveOutput struct {
	Cell  *strangler.StranglerCell `json:"cell,omitempty"`
	Error string                   `json:"error,omitempty"`
}

func carve(_ context.Context, _ *mcp.CallToolRequest, in carveInput) (*mcp.CallToolResult, carveOutput, error) {
	sc, err := strangler.Carve(in.Legacy)
	if err != nil {
		return nil, carveOutput{Error: err.Error()}, nil
	}
	return nil, carveOutput{Cell: &sc}, nil
}

// ── freeze ──

type freezeInput struct {
	Cell strangler.StranglerCell `json:"cell" jsonschema:"the carved strangler cell whose observed behaviour to freeze"`
}

type freezeOutput struct {
	Mirrors []strangler.CharacterizationMirror `json:"mirrors"`
}

func freeze(_ context.Context, _ *mcp.CallToolRequest, in freezeInput) (*mcp.CallToolResult, freezeOutput, error) {
	return nil, freezeOutput{Mirrors: strangler.Freeze(in.Cell)}, nil
}

// ── refactor ──

type refactorInput struct {
	Cell        strangler.StranglerCell            `json:"cell" jsonschema:"the carved strangler cell being refactored"`
	Mirrors     []strangler.CharacterizationMirror `json:"mirrors" jsonschema:"the frozen characterization mirrors (the green net)"`
	Observation strangler.RefactorObservation      `json:"observation" jsonschema:"the refactored cell's observed (scenario→output) behaviour + whether the published contract still verifies"`
}

func refactor(_ context.Context, _ *mcp.CallToolRequest, in refactorInput) (*mcp.CallToolResult, strangler.RefactorVerdict, error) {
	return nil, strangler.Refactor(in.Cell, in.Mirrors, in.Observation), nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-strangler", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "carve", Description: "S104/§50: draw a cell boundary around a legacy system and validate it is observable; refuse a legacy with no observed behaviour (STRANGLER_NO_OBSERVED_BEHAVIOUR) or an unnamed cell. PURE, deterministic, writes nothing (the wall)."}, carve)
	mcp.AddTool(srv, &mcp.Tool{Name: "freeze", Description: "S104/§50: auto-generate one CHARACTERIZATION mirror per observed (input→output) trace — content-addressed fixture mirrors pinning the legacy's CURRENT behaviour (bug-for-bug), tagged characterization so completeness never confuses them with intent mirrors. DETERMINISTIC code, never an LLM. Writes nothing (the ChangeSet proposes them above the line)."}, freeze)
	mcp.AddTool(srv, &mcp.Tool{Name: "refactor", Description: "S104/§50: run the frozen characterization mirrors against the REFACTORED cell's observed behaviour; ACCEPT iff every mirror stays GREEN ∧ the published contract is honored; refuse a drift (STRANGLER_CHARACTERIZATION_DRIFT) or a broken contract (STRANGLER_PUBLISHED_CONTRACT_BROKEN). PURE, deterministic, writes nothing."}, refactor)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("strangler: run: %w", err))
	}
}

// Package stranglersrv is the AIDOS Archive STRANGLER-FIG MCP server (S104; ADR 0009: every
// backend op is an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse, ADR 0092).
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
// output (the S104 reproducibility mirror).
//
// DISPATCH NOTE (ADR 0092). strangler is DELIBERATELY NOT dispatched through the S59 gateway.
// Every tool's I/O embeds a json.RawMessage (strangler.Trace.Input/Output, CharacterizationMirror
// .Input/ExpectedOutput, RefactorObservation.Outputs, RefactorVerdict) — an arbitrary-JSON-value
// field the go-sdk reflects to a BYTE-ARRAY input schema, so a real HTTP `args:{object}` payload
// is REFUSED at input validation (the S59 byte-array transport scar). Wrapping the whole Legacy/
// Cell/Mirror/Observation surface as dispatch-safe `any` types is a large surface AND carve/freeze/
// refactor are NOT cheap synchronous reads a panel fires on load — they consume observed legacy
// traces and GENERATE fixture mirrors (a refactor-time gesture, heavy/governed by design, the
// run_mutation precedent). So strangler stays EXPOSED by this server (the stdio binary + CI use
// it) but OFF-dispatch; the /strangler panel keeps its own voie propre (the arch-fitness `propose`
// / watch_materialize precedent). Recorded as an OpenQuestion (a dispatch-safe wrapper would need
// `any`-typed Trace fields), never a regression.
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) MAY reuse this SAME
// server in-process if a future dispatch-safe wrapper lands; extracting the handlers here (rather
// than the old package-main) lets BOTH the standalone stdio binary (back/mcp/strangler) and any
// future dispatch construct identical behaviour — no duplicated logic, no twin (reuse, don't
// reinvent — CLAUDE.md §0).
package stranglersrv

import (
	"context"

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

// NewServer builds the S104 strangler-fig MCP server (carve / freeze / refactor). Reused by the
// standalone stdio binary; OFF the S59 dispatch (see the package doc on the RawMessage scar).
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-strangler", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "carve", Description: "S104/§50: draw a cell boundary around a legacy system and validate it is observable; refuse a legacy with no observed behaviour (STRANGLER_NO_OBSERVED_BEHAVIOUR) or an unnamed cell. PURE, deterministic, writes nothing (the wall)."}, carve)
	mcp.AddTool(srv, &mcp.Tool{Name: "freeze", Description: "S104/§50: auto-generate one CHARACTERIZATION mirror per observed (input→output) trace — content-addressed fixture mirrors pinning the legacy's CURRENT behaviour (bug-for-bug), tagged characterization so completeness never confuses them with intent mirrors. DETERMINISTIC code, never an LLM. Writes nothing (the ChangeSet proposes them above the line)."}, freeze)
	mcp.AddTool(srv, &mcp.Tool{Name: "refactor", Description: "S104/§50: run the frozen characterization mirrors against the REFACTORED cell's observed behaviour; ACCEPT iff every mirror stays GREEN ∧ the published contract is honored; refuse a drift (STRANGLER_CHARACTERIZATION_DRIFT) or a broken contract (STRANGLER_PUBLISHED_CONTRACT_BROKEN). PURE, deterministic, writes nothing."}, refactor)
	return srv
}

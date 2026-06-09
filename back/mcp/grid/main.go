// Command grid is the AIDOS Kernel grille MCP server (FK03; ADR 0009: every backend op is an
// MCP tool).
//
// It is the capability door over FK03 (back/kernel/grid): the GRILLE of FKE-1.4 — every truth
// carries TWO coordinates (verticale rung × FK02 facette) and resolves to a single cell. The
// ContextRouter exposes the cell; the grid's three laws are surfaced as four pure tools:
//
//	resolve  — LAW 1: a (rung, facet) coordinate → its deterministic Cell + content address.
//	mark     — LAW 2 (lateral coupling): a changed rung → the source rungs ABOVE it, marked stale.
//	affected — LAWS 2+3: a Change → its blast radius (stale cells, facet held constant) + the
//	           untouched OTHER facets (orthogonality made visible).
//	rungs    — the seven source rungs of the verticale (produit→entité), top-down — the ladder.
//
// THE WALL (CLAUDE.md §2): this server WRITES NOTHING to the kernel/mirrors/fitness. A cell is
// a COORDINATE the router exposes, never a truth written from here.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. Same input → same cell, same mark, same blast radius (the FK03
// done-criteria). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/grid"
)

// ── resolve ──

type resolveInput struct {
	Rung  string `json:"rung" jsonschema:"the verticale rung (product|journey|view|control|action|operation|entity)"`
	Facet string `json:"facet" jsonschema:"the FK02 facet letter (F|I|S|B|R|V|M|X)"`
}

type resolveOutput struct {
	OK    bool   `json:"ok"`
	Rung  string `json:"rung,omitempty"`
	Facet string `json:"facet,omitempty"`
	Cell  string `json:"cell,omitempty"`
	Hash  string `json:"hash,omitempty"`
	Error string `json:"error,omitempty"`
}

func resolve(_ context.Context, _ *mcp.CallToolRequest, in resolveInput) (*mcp.CallToolResult, resolveOutput, error) {
	c, err := grid.Resolve(grid.Rung(in.Rung), facets.Facet(in.Facet))
	if err != nil {
		return nil, resolveOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, resolveOutput{OK: true, Rung: string(c.Rung), Facet: string(c.Facet), Cell: c.String(), Hash: c.Hash()}, nil
}

// ── mark ──

type markInput struct {
	Rung string `json:"rung" jsonschema:"the changed verticale rung whose stale dependents to compute"`
}

type markOutput struct {
	OK         bool     `json:"ok"`
	Changed    string   `json:"changed"`
	StaleRungs []string `json:"stale_rungs"`
}

func mark(_ context.Context, _ *mcp.CallToolRequest, in markInput) (*mcp.CallToolResult, markOutput, error) {
	out := markOutput{OK: true, Changed: in.Rung, StaleRungs: []string{}}
	for _, r := range grid.MarkStale(grid.Rung(in.Rung)) {
		out.StaleRungs = append(out.StaleRungs, string(r))
	}
	return nil, out, nil
}

// ── affected ──

type affectedInput struct {
	Rung  string `json:"rung" jsonschema:"the rung the change landed on"`
	Facet string `json:"facet" jsonschema:"the FK02 facet the change landed on (the change stays in this facet)"`
}

type cellOut struct {
	Rung  string `json:"rung"`
	Facet string `json:"facet"`
	Cell  string `json:"cell"`
}

type affectedOutput struct {
	OK              bool      `json:"ok"`
	Changed         cellOut   `json:"changed"`
	StaleRungs      []string  `json:"stale_rungs"`
	StaleCells      []cellOut `json:"stale_cells"`
	UntouchedFacets []string  `json:"untouched_facets"`
}

func affected(_ context.Context, _ *mcp.CallToolRequest, in affectedInput) (*mcp.CallToolResult, affectedOutput, error) {
	aff := grid.AffectedCells(grid.Change{Rung: grid.Rung(in.Rung), Facet: facets.Facet(in.Facet)})
	out := affectedOutput{
		OK:              true,
		Changed:         cellOut{Rung: string(aff.Changed.Rung), Facet: string(aff.Changed.Facet), Cell: aff.Changed.String()},
		StaleRungs:      []string{},
		StaleCells:      []cellOut{},
		UntouchedFacets: []string{},
	}
	for _, r := range aff.StaleRungs {
		out.StaleRungs = append(out.StaleRungs, string(r))
	}
	for _, c := range aff.StaleCells {
		out.StaleCells = append(out.StaleCells, cellOut{Rung: string(c.Rung), Facet: string(c.Facet), Cell: c.String()})
	}
	for _, f := range aff.UntouchedFacets {
		out.UntouchedFacets = append(out.UntouchedFacets, string(f))
	}
	return nil, out, nil
}

// ── rungs ──

type rungsInput struct{}

type rungRow struct {
	Letter string `json:"id"`
	Name   string `json:"name"`
	Depth  int    `json:"depth"`
}

type rungsOutput struct {
	OK    bool      `json:"ok"`
	Rungs []rungRow `json:"rungs"`
}

func listRungs(_ context.Context, _ *mcp.CallToolRequest, _ rungsInput) (*mcp.CallToolResult, rungsOutput, error) {
	out := rungsOutput{OK: true}
	for _, r := range grid.Rungs() {
		out.Rungs = append(out.Rungs, rungRow{Letter: string(r), Name: r.Name(), Depth: r.Depth()})
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-grid", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "resolve", Description: "FK03 LAW 1: resolve a truth's two coordinates (verticale rung × FK02 facet) to its single deterministic Cell + content address. Refuses an out-of-ladder rung or out-of-octuor facet. PURE; writes nothing (the wall)."}, resolve)
	mcp.AddTool(srv, &mcp.Tool{Name: "mark", Description: "FK03 LAW 2 (lateral coupling): given a CHANGED verticale rung, return the source rungs ABOVE it marked stale, top-down — a low change marks the foundation's dependents (the verticale couples). PURE."}, mark)
	mcp.AddTool(srv, &mcp.Tool{Name: "affected", Description: "FK03 LAWS 2+3: the blast radius of a Change — stale cells with the FACET HELD CONSTANT (lateral coupling) + the seven OTHER facets left untouched (orthogonality: the facets do not interact). PURE."}, affected)
	mcp.AddTool(srv, &mcp.Tool{Name: "rungs", Description: "FK03: the seven source rungs of the verticale (produit→entité) in canonical top-down order — the architectural ladder, never invented. PURE."}, listRungs)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("grid: run: %w", err))
	}
}

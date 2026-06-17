// Package gridsrv is the AIDOS Kernel grille MCP server (FK03; ADR 0009: every backend op is
// an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse).
//
// It is the capability door over FK03 (back/kernel/grid): the GRILLE of FKE-1.4 — every truth
// carries TWO coordinates (verticale rung × FK02 facette) and resolves to a single cell. Five
// PURE, write-nothing tools call the EXISTING grid engine (it never reimplements it):
//
//	grid_build     — a set of placed truths → the full Level×Facet matrix (one column per
//	                 canonical facet F→X), content-addressed (grid.Build + Grid.Hash). The
//	                 read the /v3/grille lens renders (ADR 0092: the Go engine is the SINGLE
//	                 live source — the lib/v2/grid TS twin becomes the demo fallback only).
//	grid_resolve   — LAW 1: a (rung, facet) coordinate → its deterministic Cell + content address.
//	grid_mark      — LAW 2 (lateral coupling): a changed rung → the source rungs ABOVE it, stale.
//	grid_affected  — LAWS 2+3: a Change → its blast radius (stale cells, facet held constant) +
//	                 the untouched OTHER facets (orthogonality made visible).
//	grid_rungs     — the seven source rungs of the verticale (produit→entité), top-down.
//
// THE WALL (CLAUDE.md §2): this server WRITES NOTHING to the kernel/mirrors/fitness. A cell /
// a grid is a COORDINATE projection the router exposes, never a truth written from here.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. Same input → same cell, same matrix, same blast radius (the
// FK03 done-criteria). Every tool's I/O is a JSON OBJECT (no json.RawMessage), so the S59
// gateway dispatches all five synchronously over the in-memory transport (the HTTP honours
// the MCP — the S59 byte-array transport scar is avoided by construction).
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; extracting the handler here (rather than the old package-main) lets BOTH
// the standalone stdio binary (back/mcp/grid) and the dispatcher construct identical behaviour
// — no duplicated logic, no twin (reuse, don't reinvent — CLAUDE.md §0).
package gridsrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/grid"
)

// ── grid_build ──

// truthIn is a placed truth on the grid as a JSON object (id + rung + facet) — a scalar
// object so the HTTP args:{object} payload survives the round-trip (no json.RawMessage).
type truthIn struct {
	ID    string `json:"id" jsonschema:"the truth's content-addressed id, surfaced verbatim"`
	Rung  string `json:"rung" jsonschema:"the verticale rung (product|journey|view|control|action|operation|entity)"`
	Facet string `json:"facet" jsonschema:"the FK02 facet letter (F|I|S|B|R|V|M|X)"`
}

type buildInput struct {
	Truths []truthIn `json:"truths" jsonschema:"the placed truths to project onto the Level×Facet matrix"`
}

type cellRow struct {
	Rung  string `json:"rung"`
	Facet string `json:"facet"`
	Cell  string `json:"cell"`
}

type columnOut struct {
	Facet  string    `json:"facet"`
	Cells  []cellRow `json:"cells"`
	Truths []string  `json:"truths"`
}

type buildOutput struct {
	OK      bool        `json:"ok"`
	Columns []columnOut `json:"columns"`
	Hash    string      `json:"hash,omitempty"`
}

// build projects the placed truths onto the full grid via the EXISTING grid.Build (it never
// re-derives the matrix): one column per canonical facet (F→X), each carrying its truths
// top-down by rung. Content-addressed via Grid.Hash. PURE; writes nothing (the wall).
func build(_ context.Context, _ *mcp.CallToolRequest, in buildInput) (*mcp.CallToolResult, buildOutput, error) {
	truths := make([]grid.Truth, 0, len(in.Truths))
	for _, t := range in.Truths {
		truths = append(truths, grid.Truth{ID: t.ID, Rung: grid.Rung(t.Rung), Facet: facets.Facet(t.Facet)})
	}
	g := grid.Build(truths)
	out := buildOutput{OK: true, Columns: make([]columnOut, 0, len(g.Columns)), Hash: g.Hash()}
	for _, col := range g.Columns {
		c := columnOut{Facet: string(col.Facet), Cells: make([]cellRow, 0, len(col.Cells)), Truths: col.Truths}
		if c.Truths == nil {
			c.Truths = []string{}
		}
		for _, cell := range col.Cells {
			c.Cells = append(c.Cells, cellRow{Rung: string(cell.Rung), Facet: string(cell.Facet), Cell: cell.String()})
		}
		out.Columns = append(out.Columns, c)
	}
	return nil, out, nil
}

// ── grid_resolve ──

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

// ── grid_mark ──

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

// ── grid_affected ──

type affectedInput struct {
	Rung  string `json:"rung" jsonschema:"the rung the change landed on"`
	Facet string `json:"facet" jsonschema:"the FK02 facet the change landed on (the change stays in this facet)"`
}

type affectedOutput struct {
	OK              bool      `json:"ok"`
	Changed         cellRow   `json:"changed"`
	StaleRungs      []string  `json:"stale_rungs"`
	StaleCells      []cellRow `json:"stale_cells"`
	UntouchedFacets []string  `json:"untouched_facets"`
}

func affected(_ context.Context, _ *mcp.CallToolRequest, in affectedInput) (*mcp.CallToolResult, affectedOutput, error) {
	aff := grid.AffectedCells(grid.Change{Rung: grid.Rung(in.Rung), Facet: facets.Facet(in.Facet)})
	out := affectedOutput{
		OK:              true,
		Changed:         cellRow{Rung: string(aff.Changed.Rung), Facet: string(aff.Changed.Facet), Cell: aff.Changed.String()},
		StaleRungs:      []string{},
		StaleCells:      []cellRow{},
		UntouchedFacets: []string{},
	}
	for _, r := range aff.StaleRungs {
		out.StaleRungs = append(out.StaleRungs, string(r))
	}
	for _, c := range aff.StaleCells {
		out.StaleCells = append(out.StaleCells, cellRow{Rung: string(c.Rung), Facet: string(c.Facet), Cell: c.String()})
	}
	for _, f := range aff.UntouchedFacets {
		out.UntouchedFacets = append(out.UntouchedFacets, string(f))
	}
	return nil, out, nil
}

// ── grid_rungs ──

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

// NewServer builds the configured grille *mcp.Server and registers the five pure tools —
// identical behaviour whether driven by the standalone stdio binary or the S59 gateway
// dispatcher over an in-memory transport. It takes no deps: every tool is a pure projection
// over the EXISTING back/kernel/grid engine.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-grid", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "grid_build", Description: "FK03 (FKE-1.4): project a set of placed truths onto the full Level×Facet matrix — one column per canonical facet (F→X), each carrying its truths top-down by rung — content-addressed. The read the /v3/grille lens renders. PURE; writes nothing (the wall)."}, build)
	mcp.AddTool(srv, &mcp.Tool{Name: "grid_resolve", Description: "FK03 LAW 1: resolve a truth's two coordinates (verticale rung × FK02 facet) to its single deterministic Cell + content address. Refuses an out-of-ladder rung or out-of-octuor facet. PURE; writes nothing (the wall)."}, resolve)
	mcp.AddTool(srv, &mcp.Tool{Name: "grid_mark", Description: "FK03 LAW 2 (lateral coupling): given a CHANGED verticale rung, return the source rungs ABOVE it marked stale, top-down — a low change marks the foundation's dependents (the verticale couples). PURE."}, mark)
	mcp.AddTool(srv, &mcp.Tool{Name: "grid_affected", Description: "FK03 LAWS 2+3: the blast radius of a Change — stale cells with the FACET HELD CONSTANT (lateral coupling) + the seven OTHER facets left untouched (orthogonality: the facets do not interact). PURE."}, affected)
	mcp.AddTool(srv, &mcp.Tool{Name: "grid_rungs", Description: "FK03: the seven source rungs of the verticale (produit→entité) in canonical top-down order — the architectural ladder, never invented. PURE."}, listRungs)
	return srv
}

// Package facetwiresrv is the AIDOS Mirror facet-wire MCP server (FK08; ADR 0009: every backend
// op is an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse, ADR 0092).
//
// It is the capability door over FK08 (back/kernel/mirror/facetwire): the pure STRUCTURAL judge
// that WIRES the five non-functional facet columns (S/R/V/M/X) as parallel six-pair skeletons,
// each reusing an existing sensor. Two pure, write-nothing tools:
//
//	facet_wire     — one facet column (S/R/V/M/X) + the declared/proven state of its six rungs →
//	                 a ColumnReport (sensor, verdict green/red, structural rung divergences).
//	                 Breaking a declared-not-proven pair reddens the column — EXCEPT the soft X
//	                 column, whose divergences are ADVISORY and never flip the verdict (§13.6).
//	facet_skeleton — a kernel's five non-functional columns judged in parallel → a SkeletonReport
//	                 (per-column verdicts + overall verdict, content-addressed). Red iff any HARD
//	                 column is red; the soft X column never flips the overall verdict.
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS the declared+proven
// rungs and returns a projection — a red column is a SIGNAL; acting on it goes idea → mirror →
// /goal. DETERMINISM-FIRST (§8): both tools are PURE functions — no clock, no rng, no LLM (the
// judge is the structural set-comparison, reusing the doc-mirror engine, not an agent). The X
// column is SOFT — it informs, never clicks the ratchet hard. Every tool's I/O is a JSON OBJECT
// (no json.RawMessage), so the S59 gateway dispatches both synchronously over the in-memory
// transport (the HTTP honours the MCP — the byte-array transport scar is avoided by construction).
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; extracting the handlers here (rather than the old package-main) lets BOTH
// the standalone stdio binary (back/mcp/facet-wire) and the dispatcher construct identical
// behaviour — no duplicated logic, no twin (reuse, don't reinvent — CLAUDE.md §0).
package facetwiresrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetwire"
)

// ── inputs ──

type rungIn struct {
	Rung     string `json:"rung" jsonschema:"the skeleton rung (1-spec|2-behaviour|3-scenarios|4-model|5-contract|6-evidence)"`
	Declared bool   `json:"declared" jsonschema:"the skeleton requires this rung to be proven"`
	Proven   bool   `json:"proven" jsonschema:"a living sensor/mirror asserts this rung (green)"`
}

type columnIn struct {
	KernelID string   `json:"kernel_id,omitempty"`
	Facet    string   `json:"facet" jsonschema:"the non-functional facet letter (S|R|V|M|X)"`
	Rungs    []rungIn `json:"rungs,omitempty" jsonschema:"the state of the six skeleton rungs"`
}

// ── outputs ──

type divergenceOut struct {
	Facet    string `json:"facet"`
	Rung     string `json:"rung"`
	Kind     string `json:"kind"`
	Advisory bool   `json:"advisory"`
}

type columnReportOut struct {
	OK          bool            `json:"ok"`
	Facet       string          `json:"facet"`
	Sensor      string          `json:"sensor"`
	Soft        bool            `json:"soft"`
	Verdict     string          `json:"verdict"`
	Green       bool            `json:"green"`
	Divergences []divergenceOut `json:"divergences"`
	Advisories  []divergenceOut `json:"advisories,omitempty"`
}

type skeletonReportOut struct {
	OK       bool              `json:"ok"`
	KernelID string            `json:"kernel_id,omitempty"`
	Verdict  string            `json:"verdict"`
	Green    bool              `json:"green"`
	Columns  []columnReportOut `json:"columns"`
	Hash     string            `json:"hash"`
}

func toColumn(in columnIn) facetwire.Column {
	col := facetwire.Column{KernelID: in.KernelID, Facet: facets.Facet(in.Facet)}
	for _, r := range in.Rungs {
		col.Rungs = append(col.Rungs, facetwire.RungState{
			Rung: facetwire.Rung(r.Rung), Declared: r.Declared, Proven: r.Proven,
		})
	}
	return col
}

func renderDivs(ds []facetwire.Divergence) []divergenceOut {
	out := make([]divergenceOut, 0, len(ds))
	for _, d := range ds {
		out = append(out, divergenceOut{
			Facet: string(d.Facet), Rung: string(d.Rung), Kind: string(d.Kind), Advisory: d.Advisory,
		})
	}
	return out
}

func renderColumn(cr facetwire.ColumnReport) columnReportOut {
	return columnReportOut{
		OK:          true,
		Facet:       string(cr.Facet),
		Sensor:      cr.Sensor,
		Soft:        cr.Soft,
		Verdict:     cr.Verdict,
		Green:       cr.Green(),
		Divergences: renderDivs(cr.Divergences),
		Advisories:  renderDivs(cr.Advisories),
	}
}

// ── facet_wire ──

func facetWire(_ context.Context, _ *mcp.CallToolRequest, in columnIn) (*mcp.CallToolResult, columnReportOut, error) {
	return nil, renderColumn(facetwire.WireColumn(toColumn(in))), nil
}

// ── facet_skeleton ──

type skeletonIn struct {
	KernelID string     `json:"kernel_id,omitempty"`
	Columns  []columnIn `json:"columns,omitempty" jsonschema:"the non-functional facet columns the kernel instantiates"`
}

func facetSkeleton(_ context.Context, _ *mcp.CallToolRequest, in skeletonIn) (*mcp.CallToolResult, skeletonReportOut, error) {
	sk := facetwire.Skeleton{KernelID: in.KernelID}
	for _, c := range in.Columns {
		sk.Columns = append(sk.Columns, toColumn(c))
	}
	rep := facetwire.WireSkeleton(sk)
	cols := make([]columnReportOut, 0, len(rep.Columns))
	for _, cr := range rep.Columns {
		cols = append(cols, renderColumn(cr))
	}
	return nil, skeletonReportOut{
		OK:       true,
		KernelID: rep.KernelID,
		Verdict:  rep.Verdict,
		Green:    rep.Green(),
		Columns:  cols,
		Hash:     rep.Hash,
	}, nil
}

// NewServer builds the FK08 facet-wire MCP server (facet_wire + facet_skeleton). Reused by BOTH
// the standalone stdio binary AND the S59 gateway dispatcher.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-facet-wire", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "facet_wire",
		Description: "FK08 (câbler une colonne de facette): given a non-functional facet (S|R|V|M|X) and the declared/proven state of its six skeleton rungs, return the ColumnReport — the reused sensor, the verdict green/red, and the structural rung divergences. Breaking a declared-not-proven pair reddens the column. The soft X column is ADVISORY: its divergences inform, never flip the verdict (§13.6). PURE; writes nothing (the wall).",
	}, facetWire)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "facet_skeleton",
		Description: "FK08 (le squelette 6-paires lu sur toutes les facettes): given a kernel's non-functional facet columns, judge them in parallel → a SkeletonReport (per-column verdicts + overall verdict, content-addressed). Red iff any HARD column (S/R/V/M) is red; the soft X column never flips the overall verdict. The facets are orthogonal — a broken pair reddens its own column only. PURE; writes nothing.",
	}, facetSkeleton)
	return srv
}

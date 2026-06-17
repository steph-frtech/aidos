// Package kerneltreesrv is the AIDOS Kernel COMPOSITION-TREE MCP server (KRD §108/§109 — the
// `composes` mereology link; ADR 0009: every backend op is an MCP tool), exposed as a LIBRARY
// (S59 dispatcher reuse).
//
// It is the capability door over back/kernel/composes — the SEVENTH KRD link `composes` (a whole
// CONTAINS a part, version-pinned and WEIGHTED), which makes the completeness law RECURSIVE
// (§109): a composite is GREEN only if its OWN mirror is green AND every composes-child's
// aggregate is GREEN — so a red child reddens the aggregated parent. Three PURE, write-nothing
// tools call the EXISTING composes engine (they never reimplement it):
//
//	tree_weights   — the closed declared weights (load-bearing | cosmetic) — the panel legend.
//	tree_aggregate — the §109 recursive verdict at a queried root (GREEN | RED) + the §110
//	                 drill-down path naming the chain down to the red child, OR a typed cycle
//	                 refusal (CAUSED_BY_CYCLE — never a silent infinite recursion).
//	tree_reopens   — the §112 weighted/thresholded activation: does this cut's change reopen the
//	                 composite's emergent invariant? (cosmetic change below threshold ⇒ no).
//
// The /v3/arbres lens renders the composition tree from this engine (ADR 0092: the Go engine is
// the SINGLE live source — the lib/v2/kernel-tree TS twin becomes the demo fallback only).
//
// THE WALL (CLAUDE.md §2): this server WRITES NOTHING to kernel/mirrors/fitness. It READS a
// composes tree (+ the per-node own_mirror verdicts, CONSUMED from S06 — never re-derived) and
// returns the recursive verdict / drill-down — freezing a new composes edge flows through the
// aidos CLI role via an approved ChangeSet, never here (WroteKernel always false).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of (tree, root) — no clock,
// no rng, no I/O, never an LLM. Same tree ⇒ same verdict + drill-down (the §109 done-criteria).
// Weights/thresholds are DECLARED above the line, never learned (§8) — this server only READS the
// values handed in. Every tool's I/O is a JSON OBJECT (no json.RawMessage), so the S59 gateway
// dispatches all three synchronously over the in-memory transport (the byte-array scar avoided).
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; the standalone stdio binary (back/mcp/kernel-tree) and the dispatcher
// construct identical behaviour from one source — no duplicated logic, no twin (CLAUDE.md §0).
package kerneltreesrv

import (
	"context"
	"errors"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/composes"
)

// ── shared shapes (a composes Tree as scalar JSON objects, no json.RawMessage) ──

type refIn struct {
	ID      string `json:"id" jsonschema:"the layer id"`
	Version string `json:"version" jsonschema:"the pinned version (id@version)"`
}

func (r refIn) toRef() composes.Ref { return composes.Ref{ID: r.ID, Version: r.Version} }

type nodeIn struct {
	LayerID             string  `json:"layer_id" jsonschema:"the layer id (the node key)"`
	Version             string  `json:"version" jsonschema:"the pinned version"`
	OwnMirror           string  `json:"own_mirror" jsonschema:"the node's OWN mirror verdict (GREEN|RED), CONSUMED from S06, never re-derived"`
	ActivationThreshold float64 `json:"activation_threshold" jsonschema:"the §112 declared activation threshold (>=0)"`
}

type edgeIn struct {
	Parent refIn  `json:"parent" jsonschema:"the composite (the whole), pinned id@version"`
	Child  refIn  `json:"child" jsonschema:"the part (the contained layer), pinned id@version"`
	Weight string `json:"weight" jsonschema:"the §112 declared edge weight (load-bearing|cosmetic)"`
}

type treeIn struct {
	Nodes   []nodeIn `json:"nodes" jsonschema:"the layers (own_mirror verdict + declared threshold), keyed by layer_id"`
	Edges   []edgeIn `json:"edges" jsonschema:"the declared composes edges (parent composes child, weighted)"`
	Changed []string `json:"changed,omitempty" jsonschema:"the children that changed this cut (drives §112 activation)"`
}

func (t treeIn) toTree() composes.Tree {
	nodes := make(map[string]composes.Node, len(t.Nodes))
	for _, n := range t.Nodes {
		nodes[n.LayerID] = composes.Node{
			LayerID:             n.LayerID,
			Version:             n.Version,
			OwnMirror:           composes.Verdict(n.OwnMirror),
			ActivationThreshold: n.ActivationThreshold,
		}
	}
	edges := make([]composes.Composes, 0, len(t.Edges))
	for _, e := range t.Edges {
		edges = append(edges, composes.Composes{Parent: e.Parent.toRef(), Child: e.Child.toRef(), Weight: composes.Weight(e.Weight)})
	}
	return composes.Tree{Nodes: nodes, Edges: edges, Changed: t.Changed}
}

// ── tree_weights ──

type weightsInput struct{}

type weightsOutput struct {
	OK      bool     `json:"ok"`
	Weights []string `json:"weights"`
}

func weights(_ context.Context, _ *mcp.CallToolRequest, _ weightsInput) (*mcp.CallToolResult, weightsOutput, error) {
	return nil, weightsOutput{OK: true, Weights: []string{string(composes.WeightLoadBearing), string(composes.WeightCosmetic)}}, nil
}

// ── tree_aggregate ──

type aggregateInput struct {
	Tree treeIn `json:"tree" jsonschema:"the composes tree (nodes + edges + changed)"`
	Root string `json:"root" jsonschema:"the layer id to aggregate the recursive verdict at"`
}

type pathStepOut struct {
	LayerID   string `json:"layer_id"`
	Version   string `json:"version"`
	OwnMirror string `json:"own_mirror"`
	Aggregate string `json:"aggregate"`
}

type aggregateOutput struct {
	OK        bool          `json:"ok"`
	Verdict   string        `json:"verdict,omitempty"`
	DrillDown []pathStepOut `json:"drill_down,omitempty"`
	Cycle     []string      `json:"cycle,omitempty"`
	Error     string        `json:"error,omitempty"`
}

// aggregate runs the EXISTING composes.Aggregate (the §109 recursive law, it never re-derives
// the verdict): GREEN ⟺ own_mirror green ∧ every composes-child aggregates GREEN; the §110
// drill-down names the chain down to the red child. A cycle is a typed refusal (CAUSED_BY_CYCLE
// — never a silent infinite recursion). PURE; writes nothing (the wall).
func aggregate(_ context.Context, _ *mcp.CallToolRequest, in aggregateInput) (*mcp.CallToolResult, aggregateOutput, error) {
	res, err := composes.Aggregate(in.Tree.toTree(), in.Root)
	if err != nil {
		var ce *composes.CycleError
		if errors.As(err, &ce) {
			return nil, aggregateOutput{OK: false, Error: "CAUSED_BY_CYCLE", Cycle: ce.Cycle}, nil
		}
		return nil, aggregateOutput{OK: false, Error: err.Error()}, nil
	}
	out := aggregateOutput{OK: true, Verdict: string(res.Verdict), DrillDown: make([]pathStepOut, 0, len(res.DrillDown))}
	for _, s := range res.DrillDown {
		out.DrillDown = append(out.DrillDown, pathStepOut{
			LayerID:   s.LayerID,
			Version:   s.Version,
			OwnMirror: string(s.OwnMirror),
			Aggregate: string(s.Aggregate),
		})
	}
	return nil, out, nil
}

// ── tree_reopens ──

type reopensInput struct {
	Tree treeIn `json:"tree" jsonschema:"the composes tree (nodes + edges + changed)"`
	Root string `json:"root" jsonschema:"the composite to test for reopening"`
}

type reopensOutput struct {
	OK         bool    `json:"ok"`
	Reopens    bool    `json:"reopens"`
	Activation float64 `json:"activation"`
}

// reopens runs the EXISTING composes.ReopensOnChange + composes.Activation (the §112 weighted/
// thresholded activation): does this cut's change reopen the composite's emergent invariant? A
// change confined to cosmetic children stays below threshold ⇒ false ("épingle un défaut, pas un
// changement"). PURE; reads only DECLARED weights/thresholds; writes nothing (the wall).
func reopens(_ context.Context, _ *mcp.CallToolRequest, in reopensInput) (*mcp.CallToolResult, reopensOutput, error) {
	tree := in.Tree.toTree()
	return nil, reopensOutput{OK: true, Reopens: composes.ReopensOnChange(tree, in.Root), Activation: composes.Activation(tree, in.Root)}, nil
}

// NewServer builds the configured COMPOSITION-TREE *mcp.Server and registers the three pure tools
// — identical behaviour whether driven by the standalone stdio binary or the S59 gateway
// dispatcher over an in-memory transport. It takes no deps: every tool is a pure verdict over the
// EXISTING back/kernel/composes engine.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-kernel-tree", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "tree_weights", Description: "KRD §112: the two closed declared composes-edge weights (load-bearing · cosmetic) — the /v3/arbres panel legend, never invented. PURE; writes nothing."}, weights)
	mcp.AddTool(srv, &mcp.Tool{Name: "tree_aggregate", Description: "KRD §109/§110: the recursive compositional-truth verdict at a queried root (GREEN ⟺ own_mirror green ∧ every composes-child aggregates GREEN) + the drill-down path down to the red child, OR a typed cycle refusal (CAUSED_BY_CYCLE — never a silent infinite recursion). The read the /v3/arbres lens renders. PURE; writes nothing (the wall)."}, aggregate)
	mcp.AddTool(srv, &mcp.Tool{Name: "tree_reopens", Description: "KRD §112: the weighted/thresholded activation — does this cut's change reopen the composite's emergent invariant? A cosmetic change below threshold ⇒ false. Reads only DECLARED weights/thresholds (never learned). PURE; writes nothing."}, reopens)
	return srv
}

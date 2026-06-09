// Command why-tree is the AIDOS Runtime WhyTree MCP server (FK13; ADR 0009: every backend op is
// an MCP tool).
//
// It is the capability door over FK13 (back/kernel/whytree): the `/why` gesture — the 5-whys
// REDRESSED. From a RED symptom it builds a content-addressed, provenanced WhyTree by walking
// `caused_by` UPWARD (FK12), admitting ONLY reproduced causes (anti-confabulation), terminating
// OBLIGATORILY in an anti-recurrence mirror (root → /learn → mirror). Three PURE, write-nothing tools:
//
//	build      — a symptom (+ provenance) + the caused_by edge set + the per-cause reproduction
//	             verdicts + the terminal mirror → the built WhyTree, OR the closed refusal:
//	             WHYTREE_NO_MIRROR (no terminal mirror) / WHYTREE_CAUSE_NOT_REPRODUCED
//	             (anti-confabulation) / WHYTREE_TERMINAL_MISMATCH / CAUSED_BY_CYCLE / UNKNOWN_PROVENANCE.
//	serialize  — a built WhyTree → its content-addressed kernel.link body + the record id/version
//	             (a changed cause/mirror id yields a new version, never a mutation — KRD §12).
//	kinds      — the why_tree link-kind discriminator + the closed provenance set.
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS a symptom/graph and
// returns a tree / a refusal — freezing the terminal mirror goes idea → mirror → /goal → human
// approval (the aidos CLI writer role, never the agent). DETERMINISM-FIRST (§8): all three tools are
// PURE — no clock, no rng, NO LLM (the build is a graph walk + a reproduction gate, never a
// judgment; the judge is the reproduction bool). Transport: stdio.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/causedby"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/whytree"
)

// ── shared shapes ──

type refIn struct {
	ID      string `json:"id" jsonschema:"the layer id"`
	Version string `json:"version" jsonschema:"the pinned version (id@version)"`
}

func (r refIn) toRef() links.Ref { return links.Ref{ID: r.ID, Version: r.Version} }

type edgeIn struct {
	From refIn `json:"from" jsonschema:"the symptom/effect side, pinned id@version"`
	To   refIn `json:"to" jsonschema:"the candidate-cause side, pinned id@version"`
}

func (e edgeIn) toEdge() causedby.Edge {
	return causedby.Edge{From: e.From.toRef(), To: e.To.toRef()}
}

type reproIn struct {
	CauseID    string `json:"cause_id" jsonschema:"the candidate-cause id this reproduction is about"`
	Reproduced bool   `json:"reproduced" jsonschema:"true iff a deterministic re-run reddened on this cause (the authoritative gate)"`
	Detail     string `json:"detail,omitempty" jsonschema:"verbatim reproduction evidence (advisory; never the judge)"`
}

type terminalIn struct {
	MirrorID          string `json:"mirror_id" jsonschema:"the anti-recurrence mirror content hash (root → /learn → mirror); empty ⇒ WHYTREE_NO_MIRROR"`
	ReflectsRootCause string `json:"reflects_root_cause" jsonschema:"the root-cause id the terminal mirror reflects"`
}

// ── build ──

type buildIn struct {
	Symptom       string     `json:"symptom" jsonschema:"the red symptom id to rise from"`
	Provenance    string     `json:"provenance" jsonschema:"who/what raised the symptom: incident | mirror | human"`
	Edges         []edgeIn   `json:"edges" jsonschema:"the caused_by edge set (FK12); the upward walk follows it"`
	Reproductions []reproIn  `json:"reproductions" jsonschema:"the per-cause reproduction verdicts (anti-confabulation)"`
	Terminal      terminalIn `json:"terminal" jsonschema:"the OBLIGATORY anti-recurrence terminal mirror"`
}

type causeOut struct {
	CauseID    string `json:"cause_id"`
	Depth      int    `json:"depth"`
	Reproduced bool   `json:"reproduced"`
}

type buildOut struct {
	OK         bool       `json:"ok"`
	Symptom    string     `json:"symptom,omitempty"`
	Provenance string     `json:"provenance,omitempty"`
	Causes     []causeOut `json:"causes,omitempty"`
	RootCause  string     `json:"root_cause,omitempty"`
	IsLeaf     bool       `json:"is_leaf"`
	MirrorID   string     `json:"mirror_id,omitempty"`
	Error      string     `json:"error,omitempty"`
}

func build(_ context.Context, _ *mcp.CallToolRequest, in buildIn) (*mcp.CallToolResult, buildOut, error) {
	edges := make([]causedby.Edge, 0, len(in.Edges))
	for _, e := range in.Edges {
		edges = append(edges, e.toEdge())
	}
	repros := make([]whytree.Reproduction, 0, len(in.Reproductions))
	for _, r := range in.Reproductions {
		repros = append(repros, whytree.Reproduction{CauseID: r.CauseID, Reproduced: r.Reproduced, Detail: r.Detail})
	}
	tree, err := whytree.Build(whytree.Input{
		Symptom:       in.Symptom,
		Provenance:    whytree.ProvenanceKind(in.Provenance),
		Edges:         edges,
		Reproductions: repros,
		Terminal:      whytree.TerminalMirror{MirrorID: in.Terminal.MirrorID, ReflectsRootCause: in.Terminal.ReflectsRootCause},
	})
	if err != nil {
		return nil, buildOut{OK: true, Error: classify(err)}, nil
	}
	causes := make([]causeOut, len(tree.Causes))
	for i, c := range tree.Causes {
		causes[i] = causeOut{CauseID: c.CauseID, Depth: c.Depth, Reproduced: c.Reproduced}
	}
	return nil, buildOut{
		OK:         true,
		Symptom:    tree.Symptom,
		Provenance: string(tree.Provenance),
		Causes:     causes,
		RootCause:  tree.RootCause,
		IsLeaf:     tree.IsLeaf(),
		MirrorID:   tree.Terminal.MirrorID,
	}, nil
}

// classify maps a Build error to its closed BlockReason code (the same codes the Workbench renders).
func classify(err error) string {
	switch {
	case errors.Is(err, whytree.ErrNoTerminalMirror):
		return "WHYTREE_NO_MIRROR"
	case errors.Is(err, whytree.ErrCauseNotReproduced):
		return "WHYTREE_CAUSE_NOT_REPRODUCED"
	case errors.Is(err, whytree.ErrTerminalMismatch):
		return "WHYTREE_TERMINAL_MISMATCH"
	case errors.Is(err, whytree.ErrCycle):
		return "CAUSED_BY_CYCLE"
	case errors.Is(err, whytree.ErrUnknownProvenance):
		return "UNKNOWN_PROVENANCE"
	default:
		return err.Error()
	}
}

// ── serialize ──

type serializeOut struct {
	OK      bool   `json:"ok"`
	Body    string `json:"body,omitempty"`
	ID      string `json:"id,omitempty"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

func serialize(_ context.Context, _ *mcp.CallToolRequest, in buildIn) (*mcp.CallToolResult, serializeOut, error) {
	edges := make([]causedby.Edge, 0, len(in.Edges))
	for _, e := range in.Edges {
		edges = append(edges, e.toEdge())
	}
	repros := make([]whytree.Reproduction, 0, len(in.Reproductions))
	for _, r := range in.Reproductions {
		repros = append(repros, whytree.Reproduction{CauseID: r.CauseID, Reproduced: r.Reproduced, Detail: r.Detail})
	}
	tree, err := whytree.Build(whytree.Input{
		Symptom:       in.Symptom,
		Provenance:    whytree.ProvenanceKind(in.Provenance),
		Edges:         edges,
		Reproductions: repros,
		Terminal:      whytree.TerminalMirror{MirrorID: in.Terminal.MirrorID, ReflectsRootCause: in.Terminal.ReflectsRootCause},
	})
	if err != nil {
		return nil, serializeOut{OK: true, Error: classify(err)}, nil
	}
	rec, err := whytree.Record(tree)
	if err != nil {
		return nil, serializeOut{OK: true, Error: err.Error()}, nil
	}
	return nil, serializeOut{OK: true, Body: string(rec.Body), ID: rec.ID, Version: rec.Version}, nil
}

// ── kinds ──

type kindsOut struct {
	OK          bool     `json:"ok"`
	LinkKind    string   `json:"link_kind"`
	Provenances []string `json:"provenances"`
}

func kinds(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, kindsOut, error) {
	return nil, kindsOut{
		OK:          true,
		LinkKind:    "why_tree",
		Provenances: []string{string(whytree.FromIncident), string(whytree.FromMirror), string(whytree.FromHuman)},
	}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-why-tree", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "build",
		Description: "FK13 (/why — the 5-whys redressed): a red symptom (+ provenance) + the caused_by edge set + per-cause reproduction verdicts + the OBLIGATORY terminal mirror → the WhyTree (ordered reproduced causes, root cause, terminal mirror), OR the closed refusal: WHYTREE_NO_MIRROR / WHYTREE_CAUSE_NOT_REPRODUCED (anti-confabulation) / WHYTREE_TERMINAL_MISMATCH / CAUSED_BY_CYCLE / UNKNOWN_PROVENANCE. PURE; writes nothing (the wall).",
	}, build)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "serialize",
		Description: "FK13 (content-addressed round-trip): a (valid) WhyTree input → its canonical kernel.link body + the record id/version. A changed cause/mirror id yields a NEW version (never a mutation — KRD §12). PURE; writes nothing — freezing the terminal mirror goes idea → mirror → /goal.",
	}, serialize)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "kinds",
		Description: "FK13: the why_tree link-kind discriminator + the closed symptom provenance set (incident | mirror | human). PURE; writes nothing.",
	}, kinds)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("why-tree: run: %w", err))
	}
}

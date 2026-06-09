// Command caused-by is the AIDOS Kernel caused_by MCP server (FK12; ADR 0009: every backend op
// is an MCP tool).
//
// It is the capability door over FK12 (back/kernel/causedby): the SEVENTH versioned link kind —
// the backward causal edge (the inverse of the forward red-wave `impacts`, S22), and the
// deterministic upward Trace from a red symptom to its candidate causes (the WhyTree substrate,
// FK13). Four PURE, write-nothing tools:
//
//	validate   — a caused_by edge (from, to as id@version) → OK or the closed error
//	             (UNPINNED_FROM / UNPINNED_TO / SELF_CAUSE). An unpinned or self edge is refused.
//	trace      — a symptom id + the caused_by edge set → the deterministic CauseChain (candidate
//	             causes ordered nearest-first then by id), OR the cycle refusal (CAUSED_BY_CYCLE).
//	             Same graph + symptom ⇒ same chain (FK12 criterion); a cycle is REFUSED.
//	serialize  — a caused_by edge → its content-addressed kernel.link body + the record id/version
//	             (the round-trip half: a changed cause version yields a new version, never a mutation).
//	kinds      — the caused_by kind discriminator (so a caller can confirm it sits beside the six
//	             S17 §41 kinds, additive).
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS an edge / a graph and
// returns a verdict / a chain / a serialized body — freezing a caused_by row goes idea → mirror →
// /goal → human approval (the aidos CLI writer role, never the agent). DETERMINISM-FIRST (§8): all
// four tools are PURE — no clock, no rng, no LLM (the trace is a graph walk, never a judgment).
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/causedby"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// ── shared edge shape ──

type refIn struct {
	ID      string `json:"id" jsonschema:"the layer id"`
	Version string `json:"version" jsonschema:"the pinned version (id@version); empty is rejected"`
}

func (r refIn) toRef() links.Ref { return links.Ref{ID: r.ID, Version: r.Version} }

type edgeIn struct {
	From refIn `json:"from" jsonschema:"the symptom/effect side (the red node), pinned id@version"`
	To   refIn `json:"to" jsonschema:"the candidate-cause side (the prior node), pinned id@version"`
}

func (e edgeIn) toEdge() causedby.Edge {
	return causedby.Edge{From: e.From.toRef(), To: e.To.toRef()}
}

// ── validate ──

type validateOut struct {
	OK    bool   `json:"ok"`
	Valid bool   `json:"valid"`
	Error string `json:"error,omitempty"`
}

func validate(_ context.Context, _ *mcp.CallToolRequest, in edgeIn) (*mcp.CallToolResult, validateOut, error) {
	err := causedby.Validate(in.toEdge())
	out := validateOut{OK: true, Valid: err == nil}
	if err != nil {
		switch {
		case isErr(err, causedby.ErrUnpinnedFrom):
			out.Error = "UNPINNED_FROM"
		case isErr(err, causedby.ErrUnpinnedTo):
			out.Error = "UNPINNED_TO"
		case isErr(err, causedby.ErrSelfCause):
			out.Error = "SELF_CAUSE"
		default:
			out.Error = err.Error()
		}
	}
	return nil, out, nil
}

// ── trace ──

type traceIn struct {
	Symptom string   `json:"symptom" jsonschema:"the red symptom id to trace upward from"`
	Edges   []edgeIn `json:"edges" jsonschema:"the caused_by edge set (from caused_by to)"`
}

type traceOut struct {
	OK      bool     `json:"ok"`
	Symptom string   `json:"symptom"`
	Causes  []string `json:"causes,omitempty"`
	Cycle   bool     `json:"cycle"`
	Error   string   `json:"error,omitempty"`
}

func traceTool(_ context.Context, _ *mcp.CallToolRequest, in traceIn) (*mcp.CallToolResult, traceOut, error) {
	edges := make([]causedby.Edge, 0, len(in.Edges))
	for _, e := range in.Edges {
		edges = append(edges, e.toEdge())
	}
	chain, err := causedby.Trace(in.Symptom, edges)
	if err != nil {
		return nil, traceOut{OK: true, Symptom: in.Symptom, Cycle: true, Error: "CAUSED_BY_CYCLE"}, nil
	}
	return nil, traceOut{OK: true, Symptom: chain.Symptom, Causes: chain.Causes, Cycle: false}, nil
}

// ── serialize ──

type serializeOut struct {
	OK      bool   `json:"ok"`
	Body    string `json:"body,omitempty"`
	ID      string `json:"id,omitempty"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

func serialize(_ context.Context, _ *mcp.CallToolRequest, in edgeIn) (*mcp.CallToolResult, serializeOut, error) {
	e := in.toEdge()
	if err := causedby.Validate(e); err != nil {
		return nil, serializeOut{OK: true, Error: err.Error()}, nil
	}
	body, err := causedby.SerializeEdgeBody(e)
	if err != nil {
		return nil, serializeOut{OK: true, Error: err.Error()}, nil
	}
	rec, err := records.NewRecord(records.KindLink, body)
	if err != nil {
		return nil, serializeOut{OK: true, Error: err.Error()}, nil
	}
	return nil, serializeOut{OK: true, Body: string(rec.Body), ID: rec.ID, Version: rec.Version}, nil
}

// ── kinds ──

type kindsOut struct {
	OK   bool   `json:"ok"`
	Kind string `json:"kind"`
}

func kinds(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, kindsOut, error) {
	return nil, kindsOut{OK: true, Kind: string(causedby.Kind)}, nil
}

func isErr(err, target error) bool {
	for err != nil {
		if err == target {
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-caused-by", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "validate",
		Description: "FK12 (caused_by validation): a caused_by edge (from, to as id@version) → OK or the closed error (UNPINNED_FROM / UNPINNED_TO / SELF_CAUSE). An unpinned or self edge is REFUSED. PURE; writes nothing (the wall).",
	}, validate)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "trace",
		Description: "FK12 (deterministic upward trace): a symptom id + the caused_by edge set → the CauseChain (candidate causes ordered nearest-first then by id), OR the cycle refusal CAUSED_BY_CYCLE. Same graph + symptom ⇒ same chain; a cycle is REFUSED (never a partial chain). PURE; writes nothing — the inverse of the red wave (S22).",
	}, traceTool)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "serialize",
		Description: "FK12 (content-addressed round-trip): a caused_by edge → its canonical kernel.link body + the record id/version. A changed cause version yields a NEW version (a new row, never a mutation — KRD §12). PURE; writes nothing — freezing the row goes idea → mirror → /goal.",
	}, serialize)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "kinds",
		Description: "FK12: the caused_by kind discriminator — the SEVENTH versioned link kind, ADDITIVE to the six S17 §41 kinds. PURE; writes nothing.",
	}, kinds)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("caused-by: run: %w", err))
	}
}

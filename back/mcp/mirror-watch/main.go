// Command mirror-watch is the AIDOS Mirror watch-it-fail MCP server (S69; ADR 0009: every backend op
// is an MCP tool).
//
// It is the capability door over S69 (back/kernel/mirror/watch): a human TRIGGERS materialization of
// an authored, red mirror toward its runner (Godog / rapid / the fixture interpreter) and watches the
// verdict stream RED → (stub) → GREEN live. The "watch it fail" of KRD made a product path.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it materializes a mirror and computes a
// run stream as VALUES, and writes NOTHING. It never freezes a mirror into the mirrors schema (that
// stays the propose → ChangeSet → approval path of S68/S20). The mirror it runs is authored above the
// line; S69 only RUNS it (a read + a verdict).
//
// Tools (one tool = one backend op):
//
//	watch_materialize — project an S68 Proposal into a runnable MaterializedMirror (dispatch + source)
//	watch_run         — run a materialized mirror against a code-probe → the live red/green stream
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no rng,
// no I/O. The runner dispatch + verdict are pure functions of (shape, code-presence), never an LLM.
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/mirror/watch"
	"github.com/steph-frtech/aidos/back/runtime/shapeeditor"
)

// ── watch_materialize ──

type materializeInput struct {
	Proposal shapeeditor.Proposal `json:"proposal" jsonschema:"the S68 Proposal (authored red mirror) to materialize"`
}

type materializeOutput struct {
	OK                 bool   `json:"ok"`
	Error              string `json:"error,omitempty"`
	MirrorID           string `json:"mirror_id,omitempty"`
	ProjectID          string `json:"project_id,omitempty"`
	TargetRunner       string `json:"target_runner,omitempty"`
	Shape              string `json:"shape,omitempty"`
	MaterializedSource string `json:"materialized_source,omitempty"`
}

func materialize(_ context.Context, _ *mcp.CallToolRequest, in materializeInput) (*mcp.CallToolResult, materializeOutput, error) {
	m, err := watch.Materialize(in.Proposal)
	if err != nil {
		return nil, materializeOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, materializeOutput{
		OK:                 true,
		MirrorID:           m.MirrorID,
		ProjectID:          m.ProjectID,
		TargetRunner:       string(m.TargetRunner),
		Shape:              string(m.Shape),
		MaterializedSource: m.MaterializedSource,
	}, nil
}

// ── watch_run ──

type runInput struct {
	Materialized watch.MaterializedMirror `json:"materialized" jsonschema:"the materialized mirror to run"`
	CodePresent  bool                     `json:"code_present" jsonschema:"true if the code under test exists (a stub or real impl); false ⇒ watch it fail"`
}

type runEventOut struct {
	Phase  string `json:"phase"`
	Runner string `json:"runner"`
	Status string `json:"status"`
	Detail string `json:"detail"`
}

type runOutput struct {
	OK       bool          `json:"ok"`
	Error    string        `json:"error,omitempty"`
	MirrorID string        `json:"mirror_id,omitempty"`
	Runner   string        `json:"runner,omitempty"`
	Final    string        `json:"final,omitempty"` // liveness: alive=green | dead=red
	Red      bool          `json:"red"`
	Events   []runEventOut `json:"events,omitempty"`
}

func run(_ context.Context, _ *mcp.CallToolRequest, in runInput) (*mcp.CallToolResult, runOutput, error) {
	s, err := watch.RunStream(in.Materialized, watch.CodeProbe{Present: in.CodePresent})
	if err != nil {
		return nil, runOutput{OK: false, Error: err.Error()}, nil
	}
	evs := make([]runEventOut, 0, len(s.Events))
	for _, e := range s.Events {
		evs = append(evs, runEventOut{Phase: string(e.Phase), Runner: string(e.Runner), Status: string(e.Status), Detail: e.Detail})
	}
	return nil, runOutput{
		OK:       true,
		MirrorID: s.MirrorID,
		Runner:   string(s.Runner),
		Final:    string(s.Final()),
		Red:      s.IsRed(),
		Events:   evs,
	}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-mirror-watch", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "watch_materialize", Description: "S69: project an authored S68 red mirror into a runnable MaterializedMirror (dispatch by shape to Godog/rapid/fixture + canonical source). PURE."}, materialize)
	mcp.AddTool(srv, &mcp.Tool{Name: "watch_run", Description: "S69: run a materialized mirror against a code-probe → the live red/green stream. Absent code ⇒ RED (watch it fail); a stub ⇒ GREEN. PURE, writes nothing (the wall)."}, run)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("mirror-watch: run: %w", err))
	}
}

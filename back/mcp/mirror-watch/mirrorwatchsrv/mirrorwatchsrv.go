// Package mirrorwatchsrv is the AIDOS Mirror watch-it-fail MCP server (S69; ADR 0009: every backend op
// is an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse, ADR 0092).
//
// It is the capability door over S69 (back/kernel/mirror/watch): a human TRIGGERS materialization of an
// authored, red mirror toward its runner (Godog / rapid / the fixture interpreter) and watches the
// verdict stream RED → (stub) → GREEN live. The "watch it fail" of KRD made a product path.
//
//	watch_materialize — project an S68 Proposal into a runnable MaterializedMirror (dispatch + source)
//	watch_run         — run a materialized mirror against a code-probe → the live red/green stream
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it materializes a mirror and computes a run
// stream as VALUES, and writes NOTHING. It never freezes a mirror into the mirrors schema (that stays
// the propose → ChangeSet → approval path of S68/S20). The mirror it runs is authored above the line;
// S69 only RUNS it (a read + a verdict).
//
// S59 DISPATCH NOTE (ADR 0092). watch_run's input (watch.MaterializedMirror) is a scalar OBJECT (no
// json.RawMessage / []byte) → it dispatches synchronously over HTTP and is the LIVE path the /mirror-watch
// panel reads. watch_materialize stays EXPOSED by this server (the stdio binary + the watch sequence use
// it) but its input (shapeeditor.Proposal) EMBEDS a changeset.ChangeSet whose Delta.Body is a
// json.RawMessage (the S59 byte-array transport scar) — so it is DELIBERATELY NOT dispatched
// (route(watch_materialize) → unknown_tool; the panel materializes via its own path, like the
// arch-fitness `propose` precedent), never a readVia.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no rng, no
// I/O. The runner dispatch + verdict are pure functions of (shape, code-presence), never an LLM.
//
// WHY A LIBRARY (S59). The gateway dispatcher reuses this SAME server in-process; extracting the handler
// here (rather than the old package-main) lets BOTH the standalone stdio binary (back/mcp/mirror-watch)
// and the dispatcher construct identical behaviour — no duplicated logic, no twin (CLAUDE.md §0).
package mirrorwatchsrv

import (
	"context"

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

// NewServer builds the configured mirror-watch *mcp.Server and registers the two pure tools —
// identical behaviour whether driven by the standalone stdio binary or the S59 gateway dispatcher.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-mirror-watch", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "watch_materialize", Description: "S69: project an authored S68 red mirror into a runnable MaterializedMirror (dispatch by shape to Godog/rapid/fixture + canonical source). PURE."}, materialize)
	mcp.AddTool(srv, &mcp.Tool{Name: "watch_run", Description: "S69: run a materialized mirror against a code-probe → the live red/green stream. Absent code ⇒ RED (watch it fail); a stub ⇒ GREEN. PURE, writes nothing (the wall)."}, run)
	return srv
}

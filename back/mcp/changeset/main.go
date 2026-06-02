// Command changeset is the AIDOS Archive ChangeSet MCP server (KRD §44, §98; ADR 0009).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the
// `changesets` schema — the transactional history of truth. A ChangeSet is the ONLY legal way truth
// moves: it bundles a spec_delta and its mirror_delta in ONE atomic, content-addressed body and
// flips through DRAFT → APPLIED → REVERTED, append-only. This server carries the privileged `aidos`
// writer DSN; the agent role is SELECT-only (the wall, CLAUDE.md §2) and never writes truth directly.
//
// Tools (one tool = one backend op):
//
//	changeset_open     — stage a DRAFT envelope (spec_delta + mirror_delta); no truth touched
//	changeset_apply    — run the commit-gate (completeness law) then stamp APPLIED — the ONLY path that applies
//	changeset_revert   — append a NEW DRAFT inverse (negated deltas, reverts=source); the source stays APPLIED
//	changeset_discard  — remove a hard-errored DRAFT (there is no FAILED)
//	changeset_status   — read an envelope's status + atomic deltas
//	changeset_list     — list envelopes (latest stamp per id)
//
// DETERMINISM-FIRST (CLAUDE.md §6): every decision (open id, completeness gate, inverse delta,
// immutability) is the pure changeset functions; this server only persists an already-decided
// transition. Transport: stdio. DSN comes from AIDOS_CHANGESET_DSN.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	cs "github.com/steph-frtech/aidos/back/archive/changeset"
)

// ── Tool I/O types ──

type deltaIO struct {
	Kind   string `json:"kind" jsonschema:"the change_type: add | remove | refine (KRD §44.1)"`
	Target string `json:"target" jsonschema:"the layer/entity the delta touches, e.g. Order.discount"`
}

func toDelta(d *deltaIO) *cs.Delta {
	if d == nil {
		return nil
	}
	return &cs.Delta{Kind: d.Kind, Target: d.Target}
}

type openInput struct {
	Label       string   `json:"label" jsonschema:"the envelope label, e.g. add order discount"`
	ParentPhase string   `json:"parent_phase" jsonschema:"the stable phase this envelope moves from"`
	SpecDelta   *deltaIO `json:"spec_delta,omitempty" jsonschema:"the Kernel-plane change"`
	MirrorDelta *deltaIO `json:"mirror_delta,omitempty" jsonschema:"the Mirror-plane change (required to apply when spec_delta is set)"`
}
type openOutput struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type idInput struct {
	ID string `json:"id" jsonschema:"the changeset content-hash id"`
}

type applyOutput struct {
	ID          string   `json:"id"`
	Status      string   `json:"status"`
	AppliedAt   string   `json:"applied_at,omitempty"`
	Blocked     bool     `json:"blocked"`
	BlockCode   string   `json:"block_code,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
}

type revertOutput struct {
	InverseID string `json:"inverse_id"`
	Reverts   string `json:"reverts"`
	Status    string `json:"status"`
	Blocked   bool   `json:"blocked"`
	BlockCode string `json:"block_code,omitempty"`
}

type statusOutput struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Status      string `json:"status"`
	ParentPhase string `json:"parent_phase"`
	Reverts     string `json:"reverts,omitempty"`
}

type listOutput struct {
	Envelopes []statusOutput `json:"envelopes"`
}

// server wires the MCP tools to one changeset Store.
type server struct {
	store *cs.Store
	now   func() time.Time
}

func (s *server) open(ctx context.Context, _ *mcp.CallToolRequest, in openInput) (*mcp.CallToolResult, openOutput, error) {
	c, err := cs.Open(in.Label, in.ParentPhase, toDelta(in.SpecDelta), toDelta(in.MirrorDelta))
	if err != nil {
		return nil, openOutput{}, err
	}
	if err := s.store.Persist(ctx, c); err != nil {
		return nil, openOutput{}, err
	}
	return nil, openOutput{ID: c.ID, Status: string(c.Status)}, nil
}

// apply reads the head envelope, runs the pure commit-gate (completeness), and on success stamps
// APPLIED — the ONLY path that applies. On a block it returns the actionable BlockReason.
func (s *server) apply(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, applyOutput, error) {
	c, err := s.load(ctx, in.ID, cs.StatusDraft)
	if err != nil {
		return nil, applyOutput{}, err
	}
	applied, br := cs.Apply(c, s.now(), cs.SpecHasMirror)
	if br != nil {
		return nil, applyOutput{ID: c.ID, Status: string(c.Status), Blocked: true, BlockCode: string(br.Code), HowToFix: br.HowToFix, Explanation: br.Explanation}, nil
	}
	if err := s.store.Stamp(ctx, applied); err != nil {
		return nil, applyOutput{}, err
	}
	return nil, applyOutput{ID: applied.ID, Status: string(applied.Status), AppliedAt: applied.AppliedAt.UTC().Format(time.RFC3339)}, nil
}

// revert appends a NEW DRAFT inverse (negated deltas, reverts=source) without mutating the source.
func (s *server) revert(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, revertOutput, error) {
	source, err := s.load(ctx, in.ID, cs.StatusApplied)
	if err != nil {
		return nil, revertOutput{}, err
	}
	inv, br := cs.Revert(source)
	if br != nil {
		return nil, revertOutput{Blocked: true, BlockCode: string(br.Code)}, nil
	}
	if err := s.store.Persist(ctx, inv); err != nil {
		return nil, revertOutput{}, err
	}
	return nil, revertOutput{InverseID: inv.ID, Reverts: inv.Reverts, Status: string(inv.Status)}, nil
}

func (s *server) discard(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, applyOutput, error) {
	c, err := s.load(ctx, in.ID, cs.StatusDraft)
	if err != nil {
		return nil, applyOutput{}, err
	}
	if br := cs.Discard(c); br != nil {
		return nil, applyOutput{ID: c.ID, Status: string(c.Status), Blocked: true, BlockCode: string(br.Code), HowToFix: br.HowToFix}, nil
	}
	if err := s.store.Discarded(ctx, c.ID); err != nil {
		return nil, applyOutput{}, err
	}
	return nil, applyOutput{ID: c.ID, Status: "DISCARDED"}, nil
}

func (s *server) status(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, statusOutput, error) {
	r, err := s.store.Get(ctx, in.ID)
	if err != nil {
		return nil, statusOutput{}, err
	}
	return nil, statusOutput{ID: r.ID, Label: r.Label, Status: r.Status, ParentPhase: r.ParentPhase, Reverts: r.Reverts}, nil
}

func (s *server) list(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, listOutput, error) {
	rows, err := s.store.List(ctx)
	if err != nil {
		return nil, listOutput{}, err
	}
	out := listOutput{Envelopes: make([]statusOutput, len(rows))}
	for i, r := range rows {
		out.Envelopes[i] = statusOutput{ID: r.ID, Label: r.Label, Status: r.Status, ParentPhase: r.ParentPhase, Reverts: r.Reverts}
	}
	return nil, out, nil
}

// load reads the head envelope and reconstructs the in-memory ChangeSet, asserting the expected
// status (the state machine is the gate; the store only persists). It rebuilds the deltas from the
// stored body so Apply/Revert run on the real envelope.
func (s *server) load(ctx context.Context, id string, want cs.Status) (cs.ChangeSet, error) {
	r, err := s.store.Get(ctx, id)
	if err != nil {
		return cs.ChangeSet{}, err
	}
	c := cs.ChangeSet{ID: r.ID, Label: r.Label, Status: cs.Status(r.Status), ParentPhase: r.ParentPhase, Reverts: r.Reverts}
	if len(r.SpecDelta) > 0 && string(r.SpecDelta) != "null" {
		var d cs.Delta
		_ = json.Unmarshal(r.SpecDelta, &d)
		c.SpecDelta = &d
	}
	if len(r.MirrorDelta) > 0 && string(r.MirrorDelta) != "null" {
		var d cs.Delta
		_ = json.Unmarshal(r.MirrorDelta, &d)
		c.MirrorDelta = &d
	}
	if want != "" && c.Status != want {
		return cs.ChangeSet{}, fmt.Errorf("changeset %s is %s, expected %s", id, c.Status, want)
	}
	return c, nil
}

func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-changeset", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_open", Description: "Stage a DRAFT envelope (spec_delta + mirror_delta together); returns the content-addressed id."}, s.open)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_apply", Description: "Run the commit-gate (completeness law) then stamp APPLIED — the only path that applies."}, s.apply)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_revert", Description: "Append a NEW DRAFT inverse (negated deltas, reverts=source); the source stays APPLIED."}, s.revert)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_discard", Description: "Remove a hard-errored DRAFT (there is no FAILED)."}, s.discard)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_status", Description: "Read an envelope's status + atomic deltas."}, s.status)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_list", Description: "List envelopes (latest stamp per id)."}, s.list)
	return srv
}

func main() {
	dsn := os.Getenv("AIDOS_CHANGESET_DSN")
	if dsn == "" {
		log.Fatal("changeset: AIDOS_CHANGESET_DSN is required")
	}
	ctx := context.Background()
	st, err := cs.NewStore(ctx, dsn)
	if err != nil {
		log.Fatalf("changeset: open store: %v", err)
	}
	defer st.Close()

	srv := newMCPServer(&server{store: st, now: time.Now})
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("changeset: run: %v", err)
	}
}

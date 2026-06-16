// Package changesetsrv is the AIDOS Archive ChangeSet MCP server, exposed as a LIBRARY
// (S59 dispatcher reuse). It is the single capability door (ADR 0009: every backend op is
// an MCP tool) over the `changesets` schema — the transactional history of truth. A
// ChangeSet is the ONLY legal way truth moves: it bundles a spec_delta and its
// mirror_delta in ONE atomic, content-addressed body and flips through DRAFT → APPLIED →
// REVERTED, append-only. The server carries the privileged `aidos` writer DSN; the agent
// role is SELECT-only (the wall, CLAUDE.md §2) and never writes truth directly.
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
// DETERMINISM-FIRST (CLAUDE.md §6): every decision (open id, completeness gate, inverse
// delta, immutability) is the pure changeset functions; this server only persists an
// already-decided transition.
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this
// SAME server in-process: it builds the changeset *mcp.Server via NewServer and dispatches
// a routed below-the-line changeset_* call to it over an in-memory transport. Extracting
// the handlers here (rather than the old package-main) lets BOTH the standalone stdio
// binary (back/mcp/changeset) and the dispatcher construct identical behaviour — no
// duplicated logic, no twin (reuse, don't reinvent — CLAUDE.md §0).
package changesetsrv

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	cs "github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
	"github.com/steph-frtech/aidos/back/runtime/redwork"
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

// FanOut is the red-wave fan-out seam: it is invoked AFTER a ChangeSet is stamped APPLIED (a
// DRAFT → APPLIED flip IS a kernel bump, KRD §42/§74/§98) with the applied envelope, so the
// fan-out can compute + enqueue the red wave. It is BEST-EFFORT: the apply is already committed
// when it fires, so an error is logged, never surfaced as an apply failure (§42 — the wave is a
// downstream worklist, not part of the apply transaction). A nil FanOut means "no fan-out wired"
// (the default prod NewServer; the gateway wires the real one via NewServerWithRedWave).
type FanOut func(ctx context.Context, applied cs.ChangeSet) error

// server wires the MCP tools to one changeset Store. It is unexported: callers construct
// the configured *mcp.Server via NewServer / NewServerWithRedWave and never touch the handlers
// directly. fanOut is the optional red-wave seam fired after a successful apply.
type server struct {
	store  *cs.Store
	now    func() time.Time
	fanOut FanOut
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

// apply reads the head envelope, runs the pure commit-gate (completeness), and on success
// stamps APPLIED — the ONLY path that applies. On a block it returns the actionable
// BlockReason.
func (s *server) apply(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, applyOutput, error) {
	c, err := s.load(ctx, in.ID, cs.StatusDraft)
	if err != nil {
		return nil, applyOutput{}, err
	}
	applied, br := cs.Apply(c, s.now(), cs.SpecHasMirror)
	if br != nil {
		// BLOCKED: the completeness gate refused — Stamp is NEVER reached, so the red-wave fan-out
		// NEVER fires (no bump on a non-apply, §42). This is the discriminant the mirror pins.
		return nil, applyOutput{ID: c.ID, Status: string(c.Status), Blocked: true, BlockCode: string(br.Code), HowToFix: br.HowToFix, Explanation: br.Explanation}, nil
	}
	if err := s.store.Stamp(ctx, applied); err != nil {
		return nil, applyOutput{}, err
	}
	// APPLIED: a DRAFT → APPLIED flip IS a kernel bump (KRD §42/§74/§98). NOW — and only now,
	// after Stamp succeeds — fire the red-wave fan-out on the applied envelope. It is BEST-EFFORT:
	// the apply is already committed, so a fan-out error is logged, never rolled back into an apply
	// failure (the wave is a downstream worklist, below the waterline — the wall, CLAUDE.md §2).
	if s.fanOut != nil {
		if err := s.fanOut(ctx, applied); err != nil {
			log.Printf("changeset: red-wave fan-out for %s failed (apply stands, best-effort): %v", applied.ID, err)
		}
	}
	return nil, applyOutput{ID: applied.ID, Status: string(applied.Status), AppliedAt: applied.AppliedAt.UTC().Format(time.RFC3339)}, nil
}

// revert appends a NEW DRAFT inverse (negated deltas, reverts=source) without mutating the
// source.
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

// load reads the head envelope and reconstructs the in-memory ChangeSet, asserting the
// expected status (the state machine is the gate; the store only persists). It rebuilds the
// deltas from the stored body so Apply/Revert run on the real envelope.
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

// newServer is the internal constructor: it wires the handlers to a Store, a clock and an
// OPTIONAL red-wave fan-out. The exported NewServer / NewServerWithRedWave delegate here so the
// in-package mirror can drive the handlers with a spy fan-out directly. A nil fanOut means no
// fan-out (the apply still works; it simply fires no wave).
func newServer(store *cs.Store, now func() time.Time, fanOut FanOut) *server {
	return &server{store: store, now: now, fanOut: fanOut}
}

// RedWaveFanOut builds the production fan-out: it turns an APPLIED ChangeSet into a kernel bump
// and ENQUEUES the resulting red wave into runtime.red_work_queue, through the SAME reusable seam
// the PostKernelChange hook uses (redwork.FireRedWave + redwork.PgRedWorkQueue). The wave is
// computed by the PURE engine (determinism-first, no LLM); this adapter only DERIVES the bump from
// the applied delta and persists the rows below the waterline (the wall, CLAUDE.md §2).
//
// The bump derivation: the bumped source is the spec_delta's Target, the wave_id is the changeset
// id (the bump's content hash), and the mirror edge is seeded from the mirror_delta's Target (the
// completeness gate guarantees a mirror_delta exists for any applied spec change), so the wave at
// least reddens the mirror first (mirror-first, §42). The FULL projection-link graph (api/db/types
// fan-out) is resolved by S17's runtime link feed once it lands — OpenQuestion OQ-S22-1, a forward
// dependency (CLAUDE.md §6 bootstrap exception): until then the wave carries the mirror seed, the
// minimum honest wave, never a fabricated graph.
func RedWaveFanOut(q *redwork.PgRedWorkQueue) FanOut {
	return func(ctx context.Context, applied cs.ChangeSet) error {
		if applied.SpecDelta == nil {
			return nil // a mirror-only envelope bumps no kernel source — no wave (§42).
		}
		rows := redwork.FireRedWave(changeToBump(applied))
		return q.Enqueue(ctx, rows)
	}
}

// changeToBump derives the KernelChange (bump) from an applied envelope. PURE: it reads only the
// applied deltas, coins no version, fetches nothing. The edge graph is the mirror seed the
// completeness gate guarantees; the broader projection graph lands with OQ-S22-1.
func changeToBump(applied cs.ChangeSet) redwork.KernelChange {
	bumped := applied.SpecDelta.Target
	c := redwork.KernelChange{
		Bumped: []string{bumped},
		Heads:  links.Heads{bumped: bumpedHead},
		WaveID: applied.ID,
	}
	if applied.MirrorDelta != nil {
		c.Edges = []redwave.Edge{{
			Link: links.Link{
				Kind: links.KindMirrors,
				From: links.Ref{ID: applied.MirrorDelta.Target, Version: pinnedVersion},
				To:   links.Ref{ID: bumped, Version: pinnedVersion},
			},
			LoadBearing: true,
			Layer:       redwave.LayerMirror,
		}}
	}
	return c
}

// pinnedVersion / bumpedHead model the bump: the consumers pin the OLD version (pinnedVersion)
// while the bumped source's head MOVED (bumpedHead), so links.Resolve reports the mirror stale and
// the wave fires (§42). They are the bump shape, not real DAG versions — those arrive with
// OQ-S22-1's runtime head feed.
const (
	pinnedVersion = "v1"
	bumpedHead    = "v2"
)

// NewServer builds the configured ChangeSet *mcp.Server over a single changeset Store and a
// clock, WITHOUT a red-wave fan-out (the apply applies; it fires no wave). It registers the six
// capability-door tools (open/apply/revert/discard/status/list) — identical behaviour whether
// driven by the standalone stdio binary or the S59 gateway dispatcher over an in-memory transport.
// The clock is injectable (deterministic tests). Prefer NewServerWithRedWave in production so a
// DRAFT → APPLIED flip fires the red wave (Trou dormant #2 wiring).
func NewServer(store *cs.Store, now func() time.Time) *mcp.Server {
	return registerTools(newServer(store, now, nil))
}

// NewServerWithRedWave builds the server WIRED to the red-wave fan-out: every successful apply
// (DRAFT → APPLIED) fires the wave and enqueues it into runtime.red_work_queue (the live trigger
// of the §42 vague de rouge). This is the production wiring used by the gateway/stdio binary.
func NewServerWithRedWave(store *cs.Store, now func() time.Time, q *redwork.PgRedWorkQueue) *mcp.Server {
	return registerTools(newServer(store, now, RedWaveFanOut(q)))
}

// registerTools attaches the six capability-door tools to a fresh *mcp.Server bound to s.
func registerTools(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-changeset", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_open", Description: "Stage a DRAFT envelope (spec_delta + mirror_delta together); returns the content-addressed id."}, s.open)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_apply", Description: "Run the commit-gate (completeness law) then stamp APPLIED — the only path that applies."}, s.apply)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_revert", Description: "Append a NEW DRAFT inverse (negated deltas, reverts=source); the source stays APPLIED."}, s.revert)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_discard", Description: "Remove a hard-errored DRAFT (there is no FAILED)."}, s.discard)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_status", Description: "Read an envelope's status + atomic deltas."}, s.status)
	mcp.AddTool(srv, &mcp.Tool{Name: "changeset_list", Description: "List envelopes (latest stamp per id)."}, s.list)
	return srv
}

// Package learnsrv is the AIDOS S107 `/learn` MCP server (ROADMAP-app-builder §S107, EPIC 12 / E12;
// ADR 0009: every backend op is an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse).
//
// It is the capability door over S107 (back/runtime/learn): the LOOP-CLOSURE that turns an approved
// new mirror (the human's /goal outcome over an incident, S106/S43) into a kernel hash bump and a
// TARGETED red wave (the worklist):
//
//	bump_hash      — the deterministic content-address delta the approved mirror causes on its
//	                 operation/policy target (before/after hash + moved). The §S107 "le hash
//	                 policy/operation change … mécaniquement".
//	targeted_wave  — seed the red wave the bump triggers (redwave.Impact, REUSED): mirror-first,
//	                 the worklist. Empty when the bump did not move.
//	close_loop     — the full loop: incident → draft idea (reality.Learn, provenance=incident,
//	                 wrote-no-kernel) → bump → targeted wave → the wall verdict (always a refusal).
//
// THE WALL (CLAUDE.md §2): this server is READ-ONLY on the kernel — every tool returns a VALUE whose
// WroteKernel is false; the loop never authors the approved mirror (the human's /goal does) and the
// direct Reality→Kernel edge is ALWAYS refused (REALITY_CANNOT_DECLARE_TRUTH). Nothing learns its
// own fitness — the `fitness` schema is never named.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no
// rng, no I/O, never an LLM. Same input → identical output (the S107 reproducibility mirror).
//
// THE S59 SCAR (json.RawMessage → byte-array schema). learn.Target.SpecBody is a json.RawMessage
// (the target's AST body): a RawMessage field reflects to the go-sdk as a BYTE-ARRAY input schema,
// so a real HTTP `spec_body:{object}` payload is REFUSED at input validation before the handler ever
// runs (the S59 scar — a unit test calling the engine in-Go is green while the HTTP path 0-rows).
// This server therefore wraps Target in a DISPATCH-SAFE `targetIn` whose SpecBody is a
// map[string]any (an OBJECT schema), and re-marshals it to the json.RawMessage the engine expects.
// The shared kernel type learn.Target is UNCHANGED (content-addressing intact); only the gateway
// tool's I/O schema is object-typed (the byte-array regression cannot reach the transport).
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME server
// in-process; extracting the handler here (rather than the old package-main) lets BOTH the standalone
// stdio binary (back/mcp/learn) and the dispatcher construct identical behaviour — no duplicated
// logic, no twin (reuse, don't reinvent — CLAUDE.md §0).
package learnsrv

import (
	"context"
	"encoding/json"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/learn"
	"github.com/steph-frtech/aidos/back/runtime/reality"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// targetIn is the DISPATCH-SAFE mirror of learn.Target: SpecBody is a map[string]any (an OBJECT
// input schema the HTTP transport accepts) instead of learn.Target's json.RawMessage (which the
// go-sdk infers as a byte-array, breaking the real HTTP `spec_body:{object}` payload — the S59 scar).
// toTarget re-marshals the object to the json.RawMessage the engine canonicalises/hashes over.
type targetIn struct {
	Kind     string         `json:"kind" jsonschema:"the layer (operation|policy) — one of the closed TargetKind set"`
	ID       string         `json:"id" jsonschema:"the target's content hash / id at the current head"`
	Version  string         `json:"version" jsonschema:"the target's current head version (the bump moves it)"`
	SpecBody map[string]any `json:"spec_body" jsonschema:"the target's AST body (object) BEFORE the reflection attaches; re-canonicalised to compute the bump"`
}

// toTarget converts the dispatch-safe targetIn to the engine's learn.Target, marshalling the
// SpecBody object to the canonical JSON the engine expects. A nil/empty object marshals to "{}"
// (a valid, hashable empty body — the engine's reflectionAttached tolerates it).
func (t targetIn) toTarget() (learn.Target, error) {
	body := t.SpecBody
	if body == nil {
		body = map[string]any{}
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return learn.Target{}, err
	}
	return learn.Target{
		Kind:     learn.TargetKind(t.Kind),
		ID:       t.ID,
		Version:  t.Version,
		SpecBody: raw,
	}, nil
}

// ── bump_hash ──

type bumpInput struct {
	Target targetIn             `json:"target" jsonschema:"the operation/policy target at its current head: kind, id, version, spec_body (object)"`
	Mirror learn.ApprovedMirror `json:"mirror" jsonschema:"the human-approved new mirror (the /goal outcome): mirror_id + the reflected target ref"`
}

type bumpOutput struct {
	Bump learn.Bump `json:"bump"`
}

func bumpHash(_ context.Context, _ *mcp.CallToolRequest, in bumpInput) (*mcp.CallToolResult, bumpOutput, error) {
	tgt, err := in.Target.toTarget()
	if err != nil {
		return nil, bumpOutput{}, err
	}
	b, err := learn.BumpHash(tgt, in.Mirror)
	if err != nil {
		return nil, bumpOutput{}, err
	}
	return nil, bumpOutput{Bump: b}, nil
}

// ── targeted_wave ──

type waveInput struct {
	Bump  learn.Bump     `json:"bump" jsonschema:"the bump (from bump_hash) whose seeded wave to compute"`
	Edges []redwave.Edge `json:"edges" jsonschema:"the target's S17 link graph (mirror reflection first, then projections), with load_bearing + layer"`
	Heads links.Heads    `json:"heads" jsonschema:"the S17 head map AFTER the bump (the bumped target advanced to its new address)"`
}

type waveOutput struct {
	Wave redwave.RedWave `json:"wave"`
}

func targetedWave(_ context.Context, _ *mcp.CallToolRequest, in waveInput) (*mcp.CallToolResult, waveOutput, error) {
	return nil, waveOutput{Wave: learn.TargetedWave(in.Bump, in.Edges, in.Heads)}, nil
}

// ── close_loop ──

type closeInput struct {
	Incident reality.Incident     `json:"incident" jsonschema:"the production incident (RealityMirror, provenance=incident) the loop learns from"`
	Mirror   learn.ApprovedMirror `json:"mirror" jsonschema:"the human-approved new mirror (the /goal outcome)"`
	Target   targetIn             `json:"target" jsonschema:"the operation/policy target the mirror reflects, at its current head"`
	Edges    []redwave.Edge       `json:"edges" jsonschema:"the target's link graph (mirror-first), with load_bearing + layer"`
	Heads    links.Heads          `json:"heads" jsonschema:"the S17 head map AFTER the bump"`
}

type closeOutput struct {
	Outcome learn.Outcome `json:"outcome"`
}

func closeLoop(_ context.Context, _ *mcp.CallToolRequest, in closeInput) (*mcp.CallToolResult, closeOutput, error) {
	tgt, err := in.Target.toTarget()
	if err != nil {
		return nil, closeOutput{}, err
	}
	out, err := learn.Close(in.Incident, in.Mirror, tgt, in.Edges, in.Heads)
	if err != nil {
		return nil, closeOutput{}, err
	}
	return nil, closeOutput{Outcome: out}, nil
}

// NewServer builds the configured learn *mcp.Server and registers the three pure loop-closure tools
// — identical behaviour whether driven by the standalone stdio binary or the S59 gateway dispatcher
// over an in-memory transport. It takes no deps: every tool is a pure composition over its input
// (with the dispatch-safe object-typed Target — see the package doc on the S59 RawMessage scar).
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-learn", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "bump_hash", Description: "S107/E12: compute the deterministic content-address delta an approved new mirror causes on its operation/policy target — before/after hash + moved. A no-op re-reflection does not move it. PURE (records.Hash/Canonicalize, no LLM), writes nothing (the wall)."}, bumpHash)
	mcp.AddTool(srv, &mcp.Tool{Name: "targeted_wave", Description: "S107/E12: seed the TARGETED red wave a bump triggers — redwave.Impact (REUSED), mirror-first, the worklist. Empty when the bump did not move (no tooth, no work). PURE, deterministic."}, targetedWave)
	mcp.AddTool(srv, &mcp.Tool{Name: "close_loop", Description: "S107/E12: close the full /learn loop — incident → draft idea (reality.Learn, provenance=incident, wrote-no-kernel) → hash bump → targeted red wave → the wall verdict (always REALITY_CANNOT_DECLARE_TRUTH). WroteKernel always false; nothing learns its own fitness. PURE, deterministic."}, closeLoop)
	return srv
}

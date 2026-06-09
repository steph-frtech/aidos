// Command learn is the AIDOS S107 `/learn` MCP server (ROADMAP-app-builder §S107, EPIC 12 /
// E12; ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over S107 (back/runtime/learn): the LOOP-CLOSURE that turns an
// approved new mirror (the human's /goal outcome over an incident, S106/S43) into a kernel
// hash bump and a TARGETED red wave (the worklist):
//
//	bump_hash      — the deterministic content-address delta the approved mirror causes on its
//	                 operation/policy target (before/after hash + moved). The §S107 "le hash
//	                 policy/operation change … mécaniquement".
//	targeted_wave  — seed the red wave the bump triggers (redwave.Impact, REUSED): mirror-first,
//	                 the worklist. Empty when the bump did not move.
//	close_loop     — the full loop: incident → draft idea (reality.Learn, provenance=incident,
//	                 wrote-no-kernel) → bump → targeted wave → the wall verdict (always a refusal).
//
// THE WALL (CLAUDE.md §2): this server is READ-ONLY on the kernel — every tool returns a VALUE
// whose WroteKernel is false; the loop never authors the approved mirror (the human's /goal does)
// and the direct Reality→Kernel edge is ALWAYS refused (REALITY_CANNOT_DECLARE_TRUTH). Nothing
// learns its own fitness — the `fitness` schema is never named.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no
// rng, no I/O, never an LLM. Same input → identical output (the S107 reproducibility mirror).
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/learn"
	"github.com/steph-frtech/aidos/back/runtime/reality"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// ── bump_hash ──

type bumpInput struct {
	Target learn.Target         `json:"target" jsonschema:"the operation/policy target at its current head: kind, id, version, spec_body (canonical JSON)"`
	Mirror learn.ApprovedMirror `json:"mirror" jsonschema:"the human-approved new mirror (the /goal outcome): mirror_id + the reflected target ref"`
}

type bumpOutput struct {
	Bump learn.Bump `json:"bump"`
}

func bumpHash(_ context.Context, _ *mcp.CallToolRequest, in bumpInput) (*mcp.CallToolResult, bumpOutput, error) {
	b, err := learn.BumpHash(in.Target, in.Mirror)
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
	Target   learn.Target         `json:"target" jsonschema:"the operation/policy target the mirror reflects, at its current head"`
	Edges    []redwave.Edge       `json:"edges" jsonschema:"the target's link graph (mirror-first), with load_bearing + layer"`
	Heads    links.Heads          `json:"heads" jsonschema:"the S17 head map AFTER the bump"`
}

type closeOutput struct {
	Outcome learn.Outcome `json:"outcome"`
}

func closeLoop(_ context.Context, _ *mcp.CallToolRequest, in closeInput) (*mcp.CallToolResult, closeOutput, error) {
	out, err := learn.Close(in.Incident, in.Mirror, in.Target, in.Edges, in.Heads)
	if err != nil {
		return nil, closeOutput{}, err
	}
	return nil, closeOutput{Outcome: out}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-learn", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "bump_hash", Description: "S107/E12: compute the deterministic content-address delta an approved new mirror causes on its operation/policy target — before/after hash + moved. A no-op re-reflection does not move it. PURE (records.Hash/Canonicalize, no LLM), writes nothing (the wall)."}, bumpHash)
	mcp.AddTool(srv, &mcp.Tool{Name: "targeted_wave", Description: "S107/E12: seed the TARGETED red wave a bump triggers — redwave.Impact (REUSED), mirror-first, the worklist. Empty when the bump did not move (no tooth, no work). PURE, deterministic."}, targetedWave)
	mcp.AddTool(srv, &mcp.Tool{Name: "close_loop", Description: "S107/E12: close the full /learn loop — incident → draft idea (reality.Learn, provenance=incident, wrote-no-kernel) → hash bump → targeted red wave → the wall verdict (always REALITY_CANNOT_DECLARE_TRUTH). WroteKernel always false; nothing learns its own fitness. PURE, deterministic."}, closeLoop)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("learn: run: %w", err))
	}
}

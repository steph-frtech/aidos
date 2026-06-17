// Package archfitnesssrv is the AIDOS S102 STRUCTURAL-RATCHET MCP server (ADR 0009: every backend
// op is an MCP tool; app-builder EPIC 11, the second ratchet §47), exposed as a LIBRARY (S59
// dispatcher reuse).
//
// It is the capability door over kernel/mirror/archfitness: the ARCH-FITNESS ratchet over the
// inter-cell dependency graph (go-arch-lint/depguard AIDOS side, dependency-cruiser emitted side),
// made first-rank and computed in pure Go. It prevents "tests verts, système pourri": a cut whose
// behavioural mirrors are all green yet whose architecture has rotted. Tools:
//
//	measure  — DepGraph → StructuralMetric — the four "lower-is-better" metrics (boundary
//	           violations, inter-cell cycles, inter-BC edges, max cell complexity) + the concrete
//	           witnesses, content-addressed. PURE.
//	ratchet  — (baseline, candidate StructuralMetric) → RatchetVerdict — the MONOTONE gate: HELD
//	           iff every metric is non-increasing, BROKEN (STRUCTURAL_REGRESSION) the moment a
//	           metric climbs. The done-criterion. PURE.
//	gate     — (DepGraph candidate-cut, baseline StructuralMetric) → RatchetVerdict — measure the
//	           candidate cut then ratchet it against the baseline, in one call (the CI gate). PURE.
//	propose  — (DepGraph, baseline, label, parentPhase) → DRAFT ChangeSet — move the structural
//	           baseline THE ONLY LEGAL WAY (propose → ChangeSet → approval). Writes NOTHING.
//
// THE WALL (CLAUDE.md §2/§9): pure measurement + pure comparison over supplied facts — writes
// NOTHING to the kernel/mirrors/fitness. The baseline moves ONLY via the DRAFT ChangeSet `propose`
// returns. DETERMINISM-FIRST (CLAUDE.md §6): every metric is a graph algorithm (Tarjan SCC, edge
// dedup, max), the ratchet is an integer comparison — never an LLM.
//
// DISPATCH (S59): measure/ratchet/gate are CHEAP pure reads with object-only I/O — the gateway
// dispatches them synchronously (the registry wires them below-the-line). `propose` is the
// baseline-MOVE proposal: it returns a DRAFT changeset.ChangeSet whose Delta.Body is a
// json.RawMessage (an AST fragment) — a byte-array the HTTP output schema would reject — AND it is
// the truth-PROPOSAL door (the front never fires it synchronously; the move goes through the
// changeset commit gate under approval). So `propose` stays EXPOSED by this server (the standalone
// stdio binary + CI use it) but is NOT registered for synchronous gateway dispatch (like
// run_mutation, KRD §19 — a heavy/proposal tool is async/governed by design, never a blocking
// one-shot from a screen). The wall holds either way: propose writes nothing.
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; extracting the handler here (rather than the old package-main) lets BOTH the
// standalone stdio binary (back/mcp/arch-fitness) and the dispatcher construct identical behaviour
// — no duplicated logic, no twin (reuse, don't reinvent — CLAUDE.md §0).
package archfitnesssrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/mirror/archfitness"
)

type measureInput struct {
	Graph archfitness.DepGraph `json:"graph" jsonschema:"the federation cut: cells (with node counts), directed dependency edges, and the honored contract pairs"`
}

type measureOutput struct {
	OK     bool                         `json:"ok"`
	Metric archfitness.StructuralMetric `json:"metric"`
}

func measureTool(_ context.Context, _ *mcp.CallToolRequest, in measureInput) (*mcp.CallToolResult, measureOutput, error) {
	return nil, measureOutput{OK: true, Metric: archfitness.Measure(in.Graph)}, nil
}

type ratchetInput struct {
	Baseline  archfitness.StructuralMetric `json:"baseline" jsonschema:"the structural metric of the baseline cut"`
	Candidate archfitness.StructuralMetric `json:"candidate" jsonschema:"the structural metric of the candidate cut"`
}

type ratchetOutput struct {
	OK      bool                       `json:"ok"`
	Verdict archfitness.RatchetVerdict `json:"verdict"`
}

func ratchetTool(_ context.Context, _ *mcp.CallToolRequest, in ratchetInput) (*mcp.CallToolResult, ratchetOutput, error) {
	return nil, ratchetOutput{OK: true, Verdict: archfitness.Ratchet(in.Baseline, in.Candidate)}, nil
}

type gateInput struct {
	Candidate archfitness.DepGraph         `json:"candidate" jsonschema:"the candidate federation cut to measure then ratchet"`
	Baseline  archfitness.StructuralMetric `json:"baseline" jsonschema:"the baseline structural metric the cut may not regress past"`
}

type gateOutput struct {
	OK      bool                         `json:"ok"`
	Metric  archfitness.StructuralMetric `json:"metric"`
	Verdict archfitness.RatchetVerdict   `json:"verdict"`
}

func gateTool(_ context.Context, _ *mcp.CallToolRequest, in gateInput) (*mcp.CallToolResult, gateOutput, error) {
	m := archfitness.Measure(in.Candidate)
	return nil, gateOutput{OK: true, Metric: m, Verdict: archfitness.Ratchet(in.Baseline, m)}, nil
}

type proposeInput struct {
	Graph       archfitness.DepGraph         `json:"graph" jsonschema:"the federation cut to baseline"`
	Baseline    archfitness.StructuralMetric `json:"baseline" jsonschema:"the prior baseline the new cut is ratcheted against (carried as the mirror proof)"`
	Label       string                       `json:"label" jsonschema:"the human label of the proposed envelope"`
	ParentPhase string                       `json:"parent_phase" jsonschema:"the stable phase the envelope moves from"`
}

type proposeOutput struct {
	OK        bool                `json:"ok"`
	ChangeSet changeset.ChangeSet `json:"changeset"`
	Error     string              `json:"error,omitempty"`
}

func proposeTool(_ context.Context, _ *mcp.CallToolRequest, in proposeInput) (*mcp.CallToolResult, proposeOutput, error) {
	cs, err := archfitness.Propose(in.Graph, in.Baseline, in.Label, in.ParentPhase)
	if err != nil {
		return nil, proposeOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, proposeOutput{OK: true, ChangeSet: cs}, nil
}

// NewServer builds the configured arch-fitness *mcp.Server and registers all four tools —
// identical behaviour whether driven by the standalone stdio binary or the S59 gateway dispatcher.
// measure/ratchet/gate are dispatched synchronously (cheap pure reads, object-only I/O); `propose`
// stays exposed but un-dispatched (a truth-proposal door + a RawMessage envelope body) — see the
// package doc. It takes no deps: every tool is a pure graph algorithm over its input.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-arch-fitness", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "measure", Description: "S102: measure a federation cut's four 'lower-is-better' arch-fitness metrics (boundary violations, inter-cell cycles, inter-BC edges, max cell complexity) + concrete witnesses, content-addressed. PURE, deterministic."}, measureTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "ratchet", Description: "S102: the MONOTONE structural gate — HELD iff every metric is non-increasing, BROKEN (STRUCTURAL_REGRESSION, blocks the cut) the moment one climbs. INDEPENDENT of behavioural mirrors. PURE."}, ratchetTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "gate", Description: "S102: measure the candidate cut, then ratchet it against the baseline, in one CI call. A new boundary violation or inter-cell cycle BREAKS it and blocks the cut. PURE."}, gateTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "propose", Description: "S102: move the structural baseline THE ONLY LEGAL WAY — a DRAFT ChangeSet (propose → ChangeSet → approval). Returns the envelope (metric spec + ratchet mirror); writes NOTHING (the wall)."}, proposeTool)
	return srv
}

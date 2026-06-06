// Command headroom is the AIDOS Runtime context-compression SIDECAR MCP server (HR03, ADR 0035).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the
// `chopratejas/headroom` context compressor, behind the HR02 ContextCompressor port. The Workbench
// (the /context-compression panel) and the agent loop (HR04) call these tools to compress the
// LLM-INPUT prompt BEFORE the model — extending the margin UNDER the budget cap, never relieving
// it — and to retrieve the original (CCR). They never re-implement the compressor.
//
// Tools (one per backend op):
//
//	headroom_compress  — compact an LLM-input prompt → (compacted text, reversible handle, ratio)
//	headroom_retrieve  — re-expand a handle back to the original prompt (byte-lossless mod ws)
//	headroom_gate_check — prove the agentimpl.GateAction verdict is INVARIANT to compression for a
//	                      prompt (the HR03 theorem, callable as a tool): derive the action before
//	                      and after retrieve∘compress, return both verdicts + whether they match.
//
// THE WALL (CLAUDE.md §2): this server is PURE / read-only and below the line. It reads the
// prompt it is handed and returns a Compacted + Handle; it writes NO truth (kernel/mirrors/
// fitness), has no DB, no clock, no rng. The gate-check only COMPOSES the pure compressor and the
// pure agentimpl.GateAction — it decides nothing it could not recompute.
//
// SIDECAR / REPLACEABLE (CLAUDE.md §3): the compressor is a REPLACEABLE slot behind the HR02 port.
// This server wires the deterministic byte-lossless reference adapter (headroom.SidecarCompressor
// over a FakeSidecar) so the capability is demonstrable end-to-end with no external binary; when
// the real `headroom` sidecar process lands, the FakeSidecar is swapped for a process-backed
// Sidecar and the tools + the wall hold unchanged.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): compression is the GATED exception, never authoritative —
// headroom_gate_check is the runnable proof that the gate verdict is invariant to it.
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	rctx "github.com/steph-frtech/aidos/back/runtime/context"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"github.com/steph-frtech/aidos/back/runtime/headroom"
)

// ── Tool I/O types (JSON-serialisable) ──

type compressInput struct {
	Prompt string `json:"prompt" jsonschema:"the LLM-input prompt (rendered ContextPack + transcript) to compact"`
}
type compressOutput struct {
	Compacted      rctx.Compacted `json:"compacted" jsonschema:"the compacted prompt the model receives"`
	Handle         rctx.Handle    `json:"handle" jsonschema:"the reversible CCR handle (retrieve with headroom_retrieve)"`
	OriginalChars  int            `json:"original_chars" jsonschema:"length of the original prompt (normalized)"`
	CompactedChars int            `json:"compacted_chars" jsonschema:"length of the compacted prompt"`
	Lossless       bool           `json:"lossless" jsonschema:"true iff retrieve∘compress reproduces the normalized original"`
}

type retrieveInput struct {
	Handle rctx.Handle `json:"handle" jsonschema:"the CCR handle to re-expand back to the original prompt"`
}
type retrieveOutput struct {
	Original string `json:"original" jsonschema:"the re-expanded original prompt (byte-lossless modulo whitespace)"`
}

type gateCheckInput struct {
	Prompt string `json:"prompt" jsonschema:"a context prompt carrying the boundaries block (allowed_paths/tool/skill)"`
}
type gateCheckOutput struct {
	OriginalVerdict   verdict `json:"original_verdict" jsonschema:"the GateAction verdict on the action derived from the original prompt"`
	CompressedVerdict verdict `json:"compressed_verdict" jsonschema:"the GateAction verdict after retrieve∘compress"`
	Invariant         bool    `json:"invariant" jsonschema:"true iff the gate verdict is unchanged by compression (the HR03 theorem)"`
}

// verdict is the JSON-friendly projection of agentimpl.Decision for the gate-check tool.
type verdict struct {
	Allowed     bool   `json:"allowed"`
	DeniedAxis  string `json:"denied_axis,omitempty"`
	BlockReason string `json:"block_reason,omitempty"`
}

// server wires the tool handlers to the HR03 sidecar adapter (the REPLACEABLE slot, ADR 0035).
type server struct {
	comp rctx.ContextCompressor
}

func newServer() *server {
	// The deterministic byte-lossless reference adapter (FakeSidecar). Swap for a process-backed
	// Sidecar when the real `headroom` binary lands — the tools + the wall are unchanged.
	return &server{comp: headroom.SidecarCompressor{Side: headroom.FakeSidecar{}}}
}

func (s *server) compress(_ context.Context, _ *mcp.CallToolRequest, in compressInput) (*mcp.CallToolResult, compressOutput, error) {
	compacted, handle := s.comp.Compress(in.Prompt)
	normalized := rctx.Normalize(in.Prompt)
	restored := s.comp.Retrieve(handle)
	return nil, compressOutput{
		Compacted:      compacted,
		Handle:         handle,
		OriginalChars:  len(normalized),
		CompactedChars: len(compacted.Text),
		Lossless:       restored == normalized,
	}, nil
}

func (s *server) retrieve(_ context.Context, _ *mcp.CallToolRequest, in retrieveInput) (*mcp.CallToolResult, retrieveOutput, error) {
	return nil, retrieveOutput{Original: s.comp.Retrieve(in.Handle)}, nil
}

func (s *server) gateCheck(_ context.Context, _ *mcp.CallToolRequest, in gateCheckInput) (*mcp.CallToolResult, gateCheckOutput, error) {
	originalV := s.gate(headroom.DeriveAction(in.Prompt))
	_, handle := s.comp.Compress(in.Prompt)
	restored := s.comp.Retrieve(handle)
	compressedV := s.gate(headroom.DeriveAction(restored))
	return nil, gateCheckOutput{
		OriginalVerdict:   originalV,
		CompressedVerdict: compressedV,
		Invariant:         sameVerdict(originalV, compressedV),
	}, nil
}

// gate evaluates the real agentimpl.GateAction over the derived action with a permissive,
// canonical governed implementation (grants app/, binds store/read + tdd, carries the wall).
func (s *server) gate(d headroom.DerivedAction) verdict {
	impl := agentimpl.AgentImplementation{
		LayerRef:       "couche-agent@sidecar",
		AllowedPaths:   []string{"app/"},
		ForbiddenPaths: agentimpl.WallForbiddenPaths(),
		Tools:          []agentimpl.ResolvedTool{{Server: "store", Tool: "read"}},
		Skills:         []string{"tdd"},
	}
	act := agentimpl.Action{
		AgentAction: agentimpl.AgentAction{Tool: "bash", Args: []string{"rg", "foo"}},
		Target:      d.Target, Server: d.Server, Tool: d.Tool, Skill: d.Skill, Host: d.Host, Exec: d.Exec,
	}
	m := agentimpl.RunMeter{Tokens: 10, Turns: 1, WallClockSecs: 1}
	h := economics.HarnessCostBudget{CellRef: "cell-1", MaxCIMinutes: 100, MaxLLMTokensPerGoal: 1000}
	b := goal.Budgets{TimeSeconds: 100, Turns: 100, Tokens: 1000}
	dec := agentimpl.GateAction(impl, act, m, h, b, 0.001, nil)
	out := verdict{Allowed: dec.Allowed, DeniedAxis: dec.DeniedAxis}
	if dec.BlockReason != nil {
		out.BlockReason = string(dec.BlockReason.Code)
	}
	return out
}

func sameVerdict(a, b verdict) bool {
	return a.Allowed == b.Allowed && a.DeniedAxis == b.DeniedAxis && a.BlockReason == b.BlockReason
}

func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-headroom", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "headroom_compress", Description: "Compact an LLM-input prompt → (compacted text, reversible handle, reduction). Extends the margin UNDER the budget cap; never relieves it."}, s.compress)
	mcp.AddTool(srv, &mcp.Tool{Name: "headroom_retrieve", Description: "Re-expand a handle back to the original prompt (byte-lossless modulo whitespace — CCR)."}, s.retrieve)
	mcp.AddTool(srv, &mcp.Tool{Name: "headroom_gate_check", Description: "Prove the GateAction verdict is INVARIANT to compression for a prompt (the HR03 theorem) — derive + gate before and after retrieve∘compress."}, s.gateCheck)
	return srv
}

func main() {
	srv := newMCPServer(newServer())
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("headroom: run: %v", err)
	}
}

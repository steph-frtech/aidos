package main

// emitted_fitness.go — FN04: the MCP tool over the EMITTED-functional arch-fitness rules
// (ADR 0036; ADR 0009: every backend op is an MCP tool). It exposes the deterministic,
// fail-closed scan of the emitted projection tree (agentloop.ScanEmittedTree /
// CheckEmittedFunctional) so the Workbench, the CLI, and the harness share ONE door.
//
// THE WALL (CLAUDE.md §2): the scan is BELOW the line — it READS gen/ and reports
// violations (telemetry / a gate verdict), it NEVER writes truth. Softening an invariant
// or widening the gen/ scope is a truth change (idée → miroir → /goal), never via this tool.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the scan is a pure AST walk over a fixed tree —
// same tree ⇒ same violations, never an LLM "is this functional?" judgement. The default
// target is back/gen (ADR 0036 §3 scope); a caller may pass an explicit dir (e.g. a fixture
// tree) but the rule's scope marker still gates which files are bound.

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/agentloop"
)

type emittedFitnessInput struct {
	Dir string `json:"dir" jsonschema:"the emitted-projection tree to scan; defaults to back/gen (ADR 0036 §3 scope) when empty"`
}

// emittedViolation is the JSON-serialisable projection of agentloop.Violation for the wire
// (flattening the BlockReason to the fields a panel/CLI renders).
type emittedViolation struct {
	Code        string   `json:"code"`
	Package     string   `json:"package"`
	Symbol      string   `json:"symbol"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

type emittedFitnessOutput struct {
	Dir        string             `json:"dir"`
	Invariants []string           `json:"invariants"`
	Green      bool               `json:"green"`
	Violations []emittedViolation `json:"violations"`
}

func defaultEmittedDir(dir string) string {
	if dir == "" {
		return "back/gen"
	}
	return dir
}

func (s *server) emittedFitness(_ context.Context, _ *mcp.CallToolRequest, in emittedFitnessInput) (*mcp.CallToolResult, emittedFitnessOutput, error) {
	dir := defaultEmittedDir(in.Dir)
	vs, err := agentloop.ScanEmittedTree(dir)
	if err != nil {
		return nil, emittedFitnessOutput{}, err
	}
	out := emittedFitnessOutput{
		Dir:        dir,
		Green:      len(vs) == 0,
		Violations: make([]emittedViolation, 0, len(vs)),
	}
	for _, c := range agentloop.EmittedInvariantCodes() {
		out.Invariants = append(out.Invariants, string(c))
	}
	for _, v := range vs {
		out.Violations = append(out.Violations, emittedViolation{
			Code:        string(v.BlockReason.Code),
			Package:     v.Package,
			Symbol:      v.Import,
			Severity:    string(v.BlockReason.Severity),
			Explanation: v.BlockReason.Explanation,
			HowToFix:    v.BlockReason.HowToFix,
		})
	}
	return nil, out, nil
}

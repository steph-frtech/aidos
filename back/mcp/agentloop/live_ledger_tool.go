// live_ledger_tool.go — ADR 0078: the agentloop_live_ledger MCP tool (ADR 0009 — one tool =
// one backend op). It is the capability door over the LIVING Merkle ledger: it drives the
// requested deterministic scenarios on the REAL call path (the same gate + agentloop.Drive the
// agentloop_drive tool uses), APPENDS each really-executed AgentRun into the append-only Merkle
// ledger (AppendRunToLedger → agentrun.Append, GV03 reused not forked), and returns the tip
// Merkle root + the agentrun.Verify verdict.
//
// WHY (the audit gap). The pre-existing agentloop_ledger tool reconciles runs derived from the
// ledgerRuns() FIXTURE — a ledger over fiction. This tool feeds the SAME GV03 Merkle ledger the
// runs that were really driven, so the audit ledger now chains REALITY (the ADR's monster-kill).
// The fixture is not deleted — it is requalified as a reproducibility gold (anti-overwrite §9).
//
// THE WALL (CLAUDE.md §2). Read-only above the line: driving a scenario records an AgentRun
// (telemetry), appending it to the Merkle chain is an OBSERVATION. WroteTruth is ALWAYS false —
// no kernel/mirrors/fitness is touched. A kernel-write a scenario attempts is refused in place
// by the gate (Autorisee:false), exactly as in agentloop_drive.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Same scenarios (same supplied timestamps) ⇒ same runs ⇒
// same Merkle root (the reproducibility mirror pins it); the Verify verdict is the pure GV03
// fold, never an agent judgement. No LLM, no clock, no rng.
package main

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/agentloop"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
)

// ── Tool I/O ──

type liveLedgerInput struct {
	LayerRef     string   `json:"layer_ref" jsonschema:"the CoucheAgent@version the runs act as (governed identity)"`
	Scenarios    []string `json:"scenarios" jsonschema:"the declared scenarios to drive, in order (happy|kernel-write|over-budget); empty ⇒ all"`
	GoalID       string   `json:"goal_id" jsonschema:"the /goal the runs serve"`
	ContextPack  string   `json:"context_pack,omitempty" jsonschema:"the ContextPack ref the runs were given"`
	TargetServer string   `json:"target_server" jsonschema:"the MCP server the runs call (its tool must be BOUND)"`
	TargetTool   string   `json:"target_tool" jsonschema:"the MCP tool the runs call"`
	StartedAt    string   `json:"started_at" jsonschema:"RFC3339 base run start (SUPPLIED — no arg-less clock)"`
	EndedAt      string   `json:"ended_at" jsonschema:"RFC3339 base run end (SUPPLIED)"`
}

// liveLedgerEntryOut is the JSON projection of one Merkle-chained ledger row over a REAL run.
type liveLedgerEntryOut struct {
	Index     int    `json:"index"`
	RunID     string `json:"run_id"`
	Agent     string `json:"agent"`
	Goal      string `json:"goal"`
	Result    string `json:"result"`
	PriorRoot string `json:"prior_root"`
	Root      string `json:"root"`
}

type liveLedgerOutput struct {
	// Entries is the append-only ledger over the REALLY-driven runs, in execution order.
	Entries []liveLedgerEntryOut `json:"entries"`
	// Root is the tip Merkle root — the content-address of the WHOLE ordered live ledger.
	Root string `json:"root"`
	// Verify is the deterministic tamper-evidence verdict (GV03 agentrun.Verify). OK on an
	// intact ledger; any tamper ⇒ OK=false with the kind + position.
	Verify agentrun.VerifyResult `json:"verify"`
	// WroteTruth is ALWAYS false — the living ledger observes; it writes no truth (the wall).
	WroteTruth bool `json:"wrote_truth"`
}

// driveRealRuns drives the requested scenarios on the REAL call path (gate + agentloop.Drive)
// and returns the recorded AgentRun records — the runs that really executed. A scenario refused
// at the transport boundary is SKIPPED (no run was produced); an empty Scenarios list drives the
// full declared set in canonical order. Pure over its supplied inputs (deterministic).
func (s *server) driveRealRuns(in liveLedgerInput) ([]agentrun.AgentRun, error) {
	scenarios := in.Scenarios
	if len(scenarios) == 0 {
		scenarios = scenarioNames()
	}
	runs := make([]agentrun.AgentRun, 0, len(scenarios))
	for _, sc := range scenarios {
		if !isKnownScenario(sc) {
			return nil, fmt.Errorf("agentloop: unknown scenario %q (want happy|kernel-write|over-budget)", sc)
		}
		impl, br := s.gate(in.LayerRef, in.TargetServer, in.TargetTool, in.ContextPack)
		if br != nil {
			// Refused at the boundary — no run executed; the wall held. Skip it (the ledger
			// chains only runs that really happened).
			continue
		}
		di := buildDriveInput(impl, sc, in.GoalID, "redset:"+sc, in.ContextPack, in.StartedAt, in.EndedAt)
		run, err := agentloop.Drive(di)
		if err != nil {
			return nil, fmt.Errorf("agentloop: drive scenario %q: %w", sc, err)
		}
		runs = append(runs, run)
	}
	return runs, nil
}

// liveLedger is the capability: drive the requested scenarios for REAL, append each recorded run
// into the append-only Merkle ledger, and return the ledger + tip root + Verify verdict. Read-
// only above the line (WroteTruth always false — the wall).
func (s *server) liveLedger(_ context.Context, _ *mcp.CallToolRequest, in liveLedgerInput) (*mcp.CallToolResult, liveLedgerOutput, error) {
	runs, err := s.driveRealRuns(in)
	if err != nil {
		return nil, liveLedgerOutput{}, err
	}
	ledger, err := LiveLedger(runs)
	if err != nil {
		return nil, liveLedgerOutput{}, fmt.Errorf("agentloop: build live ledger: %w", err)
	}
	entries := make([]liveLedgerEntryOut, len(ledger))
	for i, e := range ledger {
		entries[i] = liveLedgerEntryOut{
			Index:     e.Index,
			RunID:     e.BOM.Run,
			Agent:     e.BOM.Agent,
			Goal:      e.BOM.Goal,
			Result:    string(e.BOM.Result),
			PriorRoot: e.PriorRoot,
			Root:      e.Root,
		}
	}
	return nil, liveLedgerOutput{
		Entries:    entries,
		Root:       agentrun.Root(ledger),
		Verify:     VerifyLiveLedger(ledger),
		WroteTruth: false,
	}, nil
}

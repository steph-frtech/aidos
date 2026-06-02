// Command mirror-runner is the AIDOS Mirror cliquet MCP server (S05). It is the
// single capability door (ADR 0009: every backend op is an MCP tool) over the
// cliquet: replay the living mirror set, and check a candidate against the
// recorded baseline. It READS the mirror set from the `mirrors` schema and WRITES
// only its own run-log (runtime.mirror_runs) — the wall holds (CLAUDE.md §2).
//
// Tools (one per backend op):
//
//	mirror_replay  — replay every living mirror; return per-mirror verdicts + summary
//	ratchet_check  — replay + compare to the recorded baseline; return the merge verdict
//
// Transport: stdio. DSN comes from AIDOS_ARCHIVE_DSN. The Replayer wiring (how a
// materialized mirror is actually run) is injected by the host; here we default
// to a baseline-comparison runner whose verdicts come from a prior recorded run,
// so the server is operable now and S06+ tightens the replay seam.
package main

import (
	"context"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	ratchet "github.com/steph-frtech/aidos/back/mcp/mirror-runner"
)

type replayInput struct {
	Ref string `json:"ref" jsonschema:"the commit/changeset reference this replay is taken against"`
}
type replayOutput struct {
	RunID   string               `json:"run_id"`
	Results []ratchet.RunRecord  `json:"results" jsonschema:"per-mirror run records, append-only"`
	Verdict ratchet.MergeVerdict `json:"verdict"`
}

type checkInput struct {
	Ref   string `json:"ref" jsonschema:"the candidate reference being gated"`
	RunID string `json:"run_id" jsonschema:"caller-supplied run identity (determinism: no clock/rng inside)"`
}
type checkOutput struct {
	RunID       string               `json:"run_id"`
	Verdict     ratchet.MergeVerdict `json:"verdict"`
	Regressed   []ratchet.Regression `json:"regressed"`
	BlockReason *ratchet.BlockReason `json:"block_reason,omitempty"`
}

// server wires the MCP tool handlers to one Ratchet.
type server struct{ ratchet *ratchet.Ratchet }

func (s *server) replay(ctx context.Context, _ *mcp.CallToolRequest, in replayInput) (*mcp.CallToolResult, replayOutput, error) {
	res, err := s.ratchet.Check(ctx, in.Ref+":replay", in.Ref)
	if err != nil {
		return nil, replayOutput{}, err
	}
	return nil, replayOutput{RunID: res.RunID, Results: res.Runs, Verdict: res.Verdict}, nil
}

func (s *server) check(ctx context.Context, _ *mcp.CallToolRequest, in checkInput) (*mcp.CallToolResult, checkOutput, error) {
	runID := in.RunID
	if runID == "" {
		runID = in.Ref + ":check"
	}
	res, err := s.ratchet.Check(ctx, runID, in.Ref)
	if err != nil {
		return nil, checkOutput{}, err
	}
	return nil, checkOutput{
		RunID: res.RunID, Verdict: res.Verdict, Regressed: res.Regressed, BlockReason: res.BlockReason,
	}, nil
}

func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-mirror-runner", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "mirror_replay", Description: "Replay every living mirror; return per-mirror verdicts (append-only) + summary."}, s.replay)
	mcp.AddTool(srv, &mcp.Tool{Name: "ratchet_check", Description: "Replay + compare to the recorded baseline; return the merge verdict (ALLOWED/REJECTED) + the regressed set + a RED_REGRESSION BlockReason on rejection."}, s.check)
	return srv
}

func main() {
	dsn := os.Getenv("AIDOS_ARCHIVE_DSN")
	if dsn == "" {
		log.Fatal("mirror-runner: AIDOS_ARCHIVE_DSN is required")
	}
	ctx := context.Background()

	source, err := ratchet.NewPgMirrorSource(ctx, dsn)
	if err != nil {
		log.Fatalf("mirror-runner: open mirror source: %v", err)
	}
	defer source.Close()
	runlog, err := ratchet.NewPgRunLog(ctx, dsn)
	if err != nil {
		log.Fatalf("mirror-runner: open run-log: %v", err)
	}
	defer runlog.Close()

	r := &ratchet.Ratchet{
		Source:   source,
		Replayer: ratchet.BaselineReplayer{Log: runlog}, // S05 seam; tightened at S06+
		Log:      runlog,
	}
	srv := newMCPServer(&server{ratchet: r})
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("mirror-runner: run: %v", err)
	}
}

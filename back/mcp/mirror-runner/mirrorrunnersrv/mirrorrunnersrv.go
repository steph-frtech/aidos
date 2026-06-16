// Package mirrorrunnersrv is the AIDOS Mirror cliquet MCP server, exposed as a LIBRARY (S59
// dispatcher reuse). It is the single capability door (ADR 0009: every backend op is an MCP
// tool) over the cliquet: replay the living mirror set, and check a candidate against the
// recorded baseline. It READS the mirror set from the `mirrors` schema and WRITES only its own
// run-log (runtime.mirror_runs) — the wall holds (CLAUDE.md §2).
//
// Tools (one per backend op):
//
//	mirror_replay  — replay every living mirror; return per-mirror verdicts + summary
//	ratchet_check  — replay + compare to the recorded baseline; return the merge verdict
//
// DISPATCH NOTE (S59). At S05 the Replayer is the pure BaselineReplayer (it reports a mirror's
// last RECORDED status — a comparison reader, NOT a real Godog/rapid run), so BOTH tools are
// CHEAP READS over runtime.mirror_runs + the `mirrors` schema (no test subprocess spawned).
// The gateway dispatches them synchronously over the in-memory transport. When S06+ tightens
// the Replayer seam to dispatch a real test runner by test_kind, replaying becomes a heavy
// process and the synchronous dispatch of mirror_replay/ratchet_check must be revisited (the
// runner stays exposed; the front would stop dispatching it synchronously) — documented here
// as the seam, per the §6 forward-dependency rule.
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process: it builds the *mcp.Server via NewServer over a Ratchet (built from the
// archive DSN by NewRatchet) and dispatches a routed below-the-line mirror_replay/ratchet_check
// to it over an in-memory transport. Extracting the handlers here (rather than the old
// package-main) lets BOTH the standalone stdio binary (back/mcp/mirror-runner/main) and the
// dispatcher construct identical behaviour — no twin (reuse, don't reinvent — CLAUDE.md §0).
package mirrorrunnersrv

import (
	"context"
	"fmt"

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

// server wires the MCP tool handlers to one Ratchet. It is unexported: callers construct the
// configured *mcp.Server via NewServer and never touch the handlers directly.
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

// NewServer builds the configured cliquet *mcp.Server over a single Ratchet. It registers the
// two capability-door tools (mirror_replay/ratchet_check) — identical behaviour whether driven
// by the standalone stdio binary or the S59 gateway dispatcher over an in-memory transport.
func NewServer(r *ratchet.Ratchet) *mcp.Server {
	s := &server{ratchet: r}
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-mirror-runner", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "mirror_replay", Description: "Replay every living mirror; return per-mirror verdicts (append-only) + summary."}, s.replay)
	mcp.AddTool(srv, &mcp.Tool{Name: "ratchet_check", Description: "Replay + compare to the recorded baseline; return the merge verdict (ALLOWED/REJECTED) + the regressed set + a RED_REGRESSION BlockReason on rejection."}, s.check)
	return srv
}

// NewRatchet builds the production Ratchet from the archive DSN: a read-only `mirrors`-schema
// source, the append-only runtime.mirror_runs run-log, and the S05 BaselineReplayer seam
// (verdicts come from the last recorded run — tightened to a real per-test_kind runner at
// S06+). It is the SAME wiring the standalone binary uses; the gateway builder calls it so the
// dispatched server and the stdio binary behave identically. The opened pools live for the
// caller's lifetime (the standalone main defers Close; the gateway opens them lazily once and
// keeps them for the front-door's lifetime — the existing DSN-backed-builder pattern).
func NewRatchet(ctx context.Context, dsn string) (*ratchet.Ratchet, error) {
	source, err := ratchet.NewPgMirrorSource(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("mirror-runner: open mirror source: %w", err)
	}
	runlog, err := ratchet.NewPgRunLog(ctx, dsn)
	if err != nil {
		source.Close()
		return nil, fmt.Errorf("mirror-runner: open run-log: %w", err)
	}
	return &ratchet.Ratchet{
		Source:   source,
		Replayer: ratchet.BaselineReplayer{Log: runlog}, // S05 seam; tightened at S06+
		Log:      runlog,
	}, nil
}

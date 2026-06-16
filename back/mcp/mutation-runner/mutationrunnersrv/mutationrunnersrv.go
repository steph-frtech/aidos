// Package mutationrunnersrv is the reusable library form of the AIDOS Mirror
// mutation-testing MCP server (S40) — the same handlers the standalone binary runs, exported
// so the S58 gateway can host them in-process (S59 dispatch) without a second implementation
// (ADR 0007 reuse). The two tools:
//
//	run_mutation    — invoke the frozen runner (gremlins/Stryker) over a scope, gate the parsed
//	                  report against the DECLARED threshold, append the run to
//	                  runtime.mutation_runs, return the verdict. HEAVY (subprocess) — async/CI by
//	                  design; the Workbench never dispatches it synchronously through the gateway.
//	read_threshold  — read the declared mutation-score bar SELECT-only from `fitness`. CHEAP — the
//	                  status read the gateway dispatches so the /mutation-score panel goes live.
//
// THE WALL (CLAUDE.md §2/§8): the threshold is SELECT-only from `fitness` (above the waterline);
// this server writes NOTHING above the line — it appends only to runtime.mutation_runs (below
// the waterline). DETERMINISM-FIRST: no LLM enters; the gate is the pure mutation.RunAndGate.
package mutationrunnersrv

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/sensors/mutation"
)

// ── Tool I/O types (JSON-serialisable) ──

type runInput struct {
	Scope         string `json:"scope" jsonschema:"what to mutate — go (gremlins) | front (stryker)"`
	RunID         string `json:"run_id" jsonschema:"groups the run with its surviving-mutant children"`
	CommitOrPhase string `json:"commit_or_phase_hash" jsonschema:"content address of the cut the densimètre grades"`
	RawReport     string `json:"raw_report" jsonschema:"optional: the runner's raw JSON report to parse instead of shelling out"`
}

type survivorOut struct {
	File     string `json:"file"`
	Line     int    `json:"line"`
	Operator string `json:"operator"`
	Gap      string `json:"gap,omitempty"`
}

type runOutput struct {
	Verdict          string        `json:"verdict"`
	Score            float64       `json:"score"`
	Threshold        float64       `json:"threshold"`
	BlockCode        string        `json:"block_code,omitempty"`
	SurvivingMutants []survivorOut `json:"surviving_mutants,omitempty"`
}

type thresholdInput struct {
	Scope string `json:"scope" jsonschema:"the scope whose declared bar to read — go | front"`
}

type thresholdOutput struct {
	Scope     string  `json:"scope"`
	Threshold float64 `json:"threshold"`
	Declared  bool    `json:"declared" jsonschema:"false ⇒ no bar declared in fitness (the gate blocks with MISSING_THRESHOLD)"`
}

// server wires the MCP tool handlers to the mutation ports.
type server struct {
	thresholds mutation.ThresholdReader
	recorder   mutation.RunRecorder
	now        mutation.Clock
}

func (s *server) runMutation(ctx context.Context, _ *mcp.CallToolRequest, in runInput) (*mcp.CallToolResult, runOutput, error) {
	scope := mutation.Scope(in.Scope)

	var runner mutation.Runner
	if in.RawReport != "" {
		var rep mutation.MutationReport
		var err error
		if scope == mutation.ScopeFront {
			rep, err = mutation.StrykerRunner{}.Parse([]byte(in.RawReport))
		} else {
			rep, err = mutation.GremlinsRunner{}.Parse([]byte(in.RawReport))
		}
		if err != nil {
			runner = mutation.MockRunner{ScopeV: scope, Err: err}
		} else {
			runner = mutation.MockRunner{ScopeV: scope, Report: rep}
		}
	} else {
		runner = mutation.MockRunner{ScopeV: scope, Err: errNoRunnerWired}
	}

	gated, err := mutation.RunAndGate(ctx, in.RunID, in.CommitOrPhase, runner, s.thresholds, s.recorder, s.now)
	out := runOutput{
		Verdict:   string(gated.Verdict),
		Score:     gated.Score,
		Threshold: gated.Threshold,
	}
	if gated.BlockReason != nil {
		out.BlockCode = string(gated.BlockReason.Code)
	}
	for _, sm := range gated.SurvivingMutants {
		out.SurvivingMutants = append(out.SurvivingMutants, survivorOut{File: sm.File, Line: sm.Line, Operator: sm.Operator, Gap: sm.Gap})
	}
	if err == errNoRunnerWired {
		err = nil
	}
	return nil, out, err
}

func (s *server) readThreshold(ctx context.Context, _ *mcp.CallToolRequest, in thresholdInput) (*mcp.CallToolResult, thresholdOutput, error) {
	scope := mutation.Scope(in.Scope)
	bar, ok, err := s.thresholds.ReadThreshold(ctx, scope)
	if err != nil {
		return nil, thresholdOutput{}, err
	}
	return nil, thresholdOutput{Scope: in.Scope, Threshold: bar, Declared: ok}, nil
}

// errNoRunnerWired marks "no raw report and no installed subprocess" — run_mutation then
// reports a BLOCK (UNPARSABLE_REPORT), never a pass.
var errNoRunnerWired = errNoRunner{}

type errNoRunner struct{}

func (errNoRunner) Error() string {
	return "mutation-runner: no raw report supplied and no subprocess runner wired in this deployment"
}

func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-mutation-runner", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "run_mutation", Description: "Invoke the frozen mutation runner over a scope, gate the report against the declared threshold, append the run; returns the verdict + surviving mutants."}, s.runMutation)
	mcp.AddTool(srv, &mcp.Tool{Name: "read_threshold", Description: "Read the declared mutation-score threshold SELECT-only from fitness (the agent is graded by it, never authors it)."}, s.readThreshold)
	return srv
}

// NewServer builds the MCP server from explicit deps (the standalone main + the test seam).
func NewServer(thresholds mutation.ThresholdReader, recorder mutation.RunRecorder, now mutation.Clock) *mcp.Server {
	return newMCPServer(&server{thresholds: thresholds, recorder: recorder, now: now})
}

// NewFromDSN builds the pgx-backed MCP server (the S59 gateway dispatch path; dsn must be
// non-empty). read_threshold reads fitness SELECT-only via PgxThresholdReader; runs append to
// runtime.mutation_runs via PgxRunRecorder. The pool lives for the server's lifetime
// (gateway-lifetime), mirroring mirror-runner's NewRatchet — the dispatcher keeps one session
// per server, so no per-call open/close.
func NewFromDSN(ctx context.Context, dsn string) (*mcp.Server, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	return NewServer(mutation.NewPgxThresholdReader(pool), mutation.NewPgxRunRecorder(pool), time.Now), nil
}

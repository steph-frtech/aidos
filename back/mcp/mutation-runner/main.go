// Command mutation-runner is the AIDOS Mirror mutation-testing MCP server (S40).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool)
// over the mutation-testing sensor — the *densimètre* of kernel tightness (KRD
// §19/§43/§59.8). Mutation testing is the PIPELINE, post-integration drawer (KRD
// §19): expensive, run PERIODICALLY (serrage), NOT at each diff — so it is an
// on-demand callable op here, never a per-diff hook.
//
// Tools (one per backend op):
//
//	run_mutation    — invoke the frozen runner (gremlins/Stryker) over a scope,
//	                  gate the parsed report against the DECLARED threshold, append
//	                  the run to runtime.mutation_runs, return the verdict.
//	read_threshold  — read the declared mutation-score bar SELECT-only from the
//	                  `fitness` schema (the agent is graded by it, never authors it).
//
// THE WALL (CLAUDE.md §2/§8): the threshold is read SELECT-only from `fitness`
// (above the waterline). This server writes NOTHING above the line — it appends
// only to runtime.mutation_runs (below the waterline; the agent role holds
// INSERT+SELECT there). It adds no fitness row and no fitness write GRANT.
//
// INJECTION SEAM: when AIDOS_RUNTIME_DSN is set the server reads the threshold
// from fitness via PgxThresholdReader and records to runtime via PgxRunRecorder.
// When empty it runs a deterministic mock (the example bars passed in by config)
// so the Workbench can demonstrate the seam without a database. The mock NEVER
// authors a real bar — it surfaces an EXAMPLE configuration.
//
// Transport: stdio.
package main

import (
	"context"
	"log"
	"os"
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
	// RawReport, when present, is the runner's own JSON report (gremlins/Stryker)
	// to PARSE instead of shelling out — used by the Workbench mock and tests so
	// the gate can be exercised without the tool installed. Empty ⇒ invoke the
	// real subprocess (only available where the runner is installed).
	RawReport string `json:"raw_report" jsonschema:"optional: the runner's raw JSON report to parse instead of shelling out"`
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

	// Build the runner. With a raw report we PARSE it (no subprocess); otherwise we
	// would shell out to the installed tool (wired where gremlins/Stryker exist).
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
			// Unparsable report ⇒ the gate blocks (UNPARSABLE_REPORT); surface it.
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
	// A runner/parse failure is reported as a BLOCK verdict (out), not as an MCP
	// error — the caller sees an explicit block, never a silent pass. We swallow
	// the wiring-error so the verdict carries the meaning.
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

// errNoRunnerWired marks "no raw report and no installed subprocess" — the
// run_mutation tool then reports a BLOCK (UNPARSABLE_REPORT), never a pass.
var errNoRunnerWired = errNoRunner{}

type errNoRunner struct{}

func (errNoRunner) Error() string {
	return "mutation-runner: no raw report supplied and no subprocess runner wired in this deployment"
}

// newMCPServer builds the MCP server and registers the two mutation tools.
func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-mutation-runner", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "run_mutation", Description: "Invoke the frozen mutation runner over a scope, gate the report against the declared threshold, append the run; returns the verdict + surviving mutants."}, s.runMutation)
	mcp.AddTool(srv, &mcp.Tool{Name: "read_threshold", Description: "Read the declared mutation-score threshold SELECT-only from fitness (the agent is graded by it, never authors it)."}, s.readThreshold)
	return srv
}

// newServer builds the configured backend: pgx over the runtime/fitness schemas
// when AIDOS_RUNTIME_DSN is set, otherwise a deterministic mock (proving the seam
// without a database). The mock bars are an EXAMPLE config, not an authored truth.
func newServer(ctx context.Context) (*server, func(), error) {
	dsn := os.Getenv("AIDOS_RUNTIME_DSN")
	if dsn == "" {
		return &server{
			thresholds: mutation.MockThresholdReader{Bars: map[mutation.Scope]float64{mutation.ScopeGo: 0.80, mutation.ScopeFront: 0.70}},
			recorder:   &mutation.MockRunRecorder{},
			now:        time.Now,
		}, func() {}, nil
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, nil, err
	}
	return &server{
		thresholds: mutation.NewPgxThresholdReader(pool),
		recorder:   mutation.NewPgxRunRecorder(pool),
		now:        time.Now,
	}, pool.Close, nil
}

func main() {
	ctx := context.Background()
	s, closeFn, err := newServer(ctx)
	if err != nil {
		log.Fatalf("mutation-runner: open: %v", err)
	}
	defer closeFn()

	srv := newMCPServer(s)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("mutation-runner: run: %v", err)
	}
}

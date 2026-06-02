// Command backtester is the AIDOS Runtime out-of-sample evaluation MCP server (S42,
// KRD §62 ② out_of_sample, §87).
//
// It is the out-of-sample / walk-forward evaluation capability door (ADR 0009: every
// backend op is an MCP tool). KRD §87 — the brutal truth: an in-sample Sharpe ≈ no
// predictive power; the market is adversarial / non-stationary; out-of-sample /
// walk-forward is the ONLY honest signal. This server returns the green/red evidence
// the EvolutionSandbox promotion gate (Promote) consumes — it is a READ/EVALUATE
// capability: it returns a fitness READING, it does NOT define or edit the fitness
// (the metre-stick is held above the line, never by the loop — CLAUDE.md §8).
//
// Tools (one per backend op):
//
//	backtest_out_of_sample — evaluate a variant on OUT-OF-SAMPLE data ONLY (never the
//	                         in-sample) — returns green/red, the honest signal.
//	backtest_get           — read a recorded evaluation by id.
//
// THE WALL (CLAUDE.md §2/§8): this server reads/evaluates only — it writes NOTHING
// above the line and holds NO grant on kernel/mirrors/authority/fitness. It never
// defines the fitness; it reports a reading the gate consumes.
//
// INJECTION SEAM: a deterministic evaluator backs the tool so the Workbench can
// exercise the gate without a real market/data feed. The real out-of-sample backtest
// (real data, walk-forward) lives behind this seam; the verdict shape is the contract.
//
// Transport: stdio.
package main

import (
	"context"
	"log"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// OutOfSampleVerdict is the honest signal (KRD §87): green ⇒ the variant held up out
// of sample; red ⇒ it did not. Mirrors evolve.OutOfSampleStatus's vocabulary.
type OutOfSampleVerdict string

const (
	VerdictGreen OutOfSampleVerdict = "green"
	VerdictRed   OutOfSampleVerdict = "red"
)

// ── Tool I/O types ──

type backtestInput struct {
	VariantID string `json:"variant_id" jsonschema:"the variant to evaluate — traces to a real /branches/evolution branch"`
	// InSample is REJECTED: the backtester evaluates out-of-sample ONLY (§87). The
	// field exists so a caller cannot smuggle in-sample data unnoticed; a true value
	// is refused with a reason.
	InSample bool `json:"in_sample" jsonschema:"must be false — the backtester evaluates OUT-OF-SAMPLE only (§87)"`
	// Score is the injected out-of-sample reading [0,1] the deterministic evaluator
	// uses (the real evaluator would compute it from walk-forward over held-out data).
	Score float64 `json:"score" jsonschema:"the out-of-sample reading [0,1]; >= bar ⇒ green"`
}

type backtestOutput struct {
	VariantID string  `json:"variant_id"`
	Verdict   string  `json:"verdict"`
	Score     float64 `json:"score"`
	Bar       float64 `json:"bar"`
	Reason    string  `json:"reason,omitempty"`
}

type getInput struct {
	VariantID string `json:"variant_id"`
}

// the declared out-of-sample bar (above the line; the agent is graded by it, never
// authors it). Declared, not learned (CLAUDE.md §8).
const outOfSampleBar = 0.5

type evaluation struct {
	verdict OutOfSampleVerdict
	score   float64
}

type server struct {
	mu    sync.Mutex
	evals map[string]evaluation
}

func newServer() *server { return &server{evals: map[string]evaluation{}} }

func (s *server) backtestOutOfSample(_ context.Context, _ *mcp.CallToolRequest, in backtestInput) (*mcp.CallToolResult, backtestOutput, error) {
	out := backtestOutput{VariantID: in.VariantID, Score: in.Score, Bar: outOfSampleBar}
	if in.InSample {
		// In-sample is refused — out-of-sample is the only honest signal (§87).
		out.Verdict = string(VerdictRed)
		out.Reason = "refus : le backtester évalue OUT-OF-SAMPLE uniquement — in-sample ≈ pouvoir prédictif nul (KRD §87)."
		s.put(in.VariantID, evaluation{verdict: VerdictRed, score: in.Score})
		return nil, out, nil
	}
	v := VerdictRed
	if in.Score >= outOfSampleBar {
		v = VerdictGreen
	}
	out.Verdict = string(v)
	s.put(in.VariantID, evaluation{verdict: v, score: in.Score})
	return nil, out, nil
}

func (s *server) backtestGet(_ context.Context, _ *mcp.CallToolRequest, in getInput) (*mcp.CallToolResult, backtestOutput, error) {
	s.mu.Lock()
	e, ok := s.evals[in.VariantID]
	s.mu.Unlock()
	if !ok {
		return nil, backtestOutput{VariantID: in.VariantID}, nil
	}
	return nil, backtestOutput{VariantID: in.VariantID, Verdict: string(e.verdict), Score: e.score, Bar: outOfSampleBar}, nil
}

func (s *server) put(id string, e evaluation) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.evals[id] = e
}

func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-backtester", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "backtest_out_of_sample", Description: "Evaluate a variant on OUT-OF-SAMPLE data only (§87) — returns the green/red honest signal the promotion gate consumes. It does not define or edit the fitness."}, s.backtestOutOfSample)
	mcp.AddTool(srv, &mcp.Tool{Name: "backtest_get", Description: "Read a recorded out-of-sample evaluation by variant id."}, s.backtestGet)
	return srv
}

func main() {
	srv := newMCPServer(newServer())
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("backtester: run: %v", err)
	}
}

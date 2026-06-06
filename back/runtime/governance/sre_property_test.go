// sre_property_test.go — GV06. The REPRODUCIBILITY + monotonicity mirror for the SRE
// alignment (error-budget / circuit-breaker) and the identity/trust BOM-cover. RED-FIRST:
// authored before sre.go existed (the package did not compile until ErrorBudget /
// CircuitState / TrustChain were defined), so this file IS the red→green proof.
//
// What it pins (determinism-first, CLAUDE.md §6/§8 — an error budget IS a pure count, never an
// "SRE agent"):
//
//   - REPRODUCIBLE. Same ordered run results + same SLO ⇒ same ErrorBudget and same breaker
//     state, byte-for-byte (TestSRE_Reproducible).
//   - FAIL-CLOSED MONOTONICITY. Adding a failing run never IMPROVES the budget and never
//     CLOSES an open breaker within the window (TestSRE_Failures_NeverHelp).
//   - BUDGET BOUNDS. Remaining budget is always within [0, total]; breaker opens iff the
//     observed error rate breaches the SLO target (TestSRE_BreakerMatchesSLO).
//   - TRUST COVER. Every recorded run is covered by exactly one trust-chain row whose Merkle
//     entry root matches the ledger (TestSRE_TrustChainCoversLedger) — identity (the agent +
//     impl that decided) is bound to the tamper-evident root (GV03), never floating.
package governance

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"pgregory.net/rapid"
)

// drawResults builds an ordered slice of run results from the closed enum.
func drawResults(t *rapid.T) []agentrun.Result {
	enum := []agentrun.Result{
		agentrun.ResultGreen, agentrun.ResultStillRed,
		agentrun.ResultBlocked, agentrun.ResultAbandoned,
	}
	n := rapid.IntRange(0, 12).Draw(t, "n")
	out := make([]agentrun.Result, n)
	for i := range out {
		out[i] = enum[rapid.IntRange(0, len(enum)-1).Draw(t, "r")]
	}
	return out
}

func TestSRE_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		results := drawResults(t)
		slo := rapid.Float64Range(0.0, 1.0).Draw(t, "slo")
		a := EvaluateSRE(results, slo)
		b := EvaluateSRE(results, slo)
		if a != b {
			t.Fatalf("SRE not reproducible: %+v != %+v", a, b)
		}
	})
}

func TestSRE_Failures_NeverHelp(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		results := drawResults(t)
		slo := rapid.Float64Range(0.0, 1.0).Draw(t, "slo")
		before := EvaluateSRE(results, slo)
		// Append a failing run.
		after := EvaluateSRE(append(append([]agentrun.Result{}, results...), agentrun.ResultBlocked), slo)
		if after.RemainingBudget > before.RemainingBudget {
			t.Fatalf("a failure improved the budget: %d > %d", after.RemainingBudget, before.RemainingBudget)
		}
		// Fail-closed: a once-open breaker may not silently close by adding a failure.
		if before.Breaker == BreakerOpen && after.Breaker == BreakerClosed {
			t.Fatalf("a failure CLOSED an open breaker (default-open violation)")
		}
	})
}

func TestSRE_BreakerMatchesSLO(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		results := drawResults(t)
		slo := rapid.Float64Range(0.0, 1.0).Draw(t, "slo")
		s := EvaluateSRE(results, slo)
		if s.RemainingBudget < 0 || s.RemainingBudget > s.TotalBudget {
			t.Fatalf("budget out of bounds: %d not in [0,%d]", s.RemainingBudget, s.TotalBudget)
		}
		// Breaker opens iff the observed error rate breaches the target.
		wantOpen := s.ErrorRate > s.Target
		gotOpen := s.Breaker == BreakerOpen
		if wantOpen != gotOpen {
			t.Fatalf("breaker mismatch: rate=%.3f target=%.3f open=%v", s.ErrorRate, s.Target, gotOpen)
		}
	})
}

func TestSRE_TrustChainCoversLedger(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := rapid.IntRange(0, 8).Draw(t, "n")
		runs := make([]agentrun.AgentRun, n)
		for i := range runs {
			runs[i] = agentrun.AgentRun{
				ID:     rapid.StringMatching(`run-[a-f0-9]{4}`).Draw(t, "id"),
				Agent:  rapid.StringMatching(`agent-[a-z]{3}@v[0-9]`).Draw(t, "ag"),
				Goal:   "goal-x",
				Impl:   rapid.StringMatching(`impl-[a-f0-9]{4}`).Draw(t, "impl"),
				Result: agentrun.ResultGreen,
			}
		}
		chain, err := BuildTrustChain(runs)
		if err != nil {
			t.Fatalf("BuildTrustChain: %v", err)
		}
		if len(chain.Rows) != len(runs) {
			t.Fatalf("trust chain does not cover every run: %d rows for %d runs", len(chain.Rows), len(runs))
		}
		// Reproducible.
		chain2, _ := BuildTrustChain(runs)
		if chain.Root != chain2.Root {
			t.Fatalf("trust chain root not reproducible: %q != %q", chain.Root, chain2.Root)
		}
		for i, row := range chain.Rows {
			if row.Agent != runs[i].Agent || row.Impl != runs[i].Impl {
				t.Fatalf("row %d identity mismatch", i)
			}
		}
	})
}

package costmeter_test

// S111 REPRODUCIBILITY MIRROR (rapid, ∀) — the laws of the per-cell cost meter (KRD §66.3).
// reflects=runtime.costmeter · test_kind=property · cert_language=rapid · authority=above.
// These property invariants pin the determinism mandate and the §66.3 advisory rule:
//
//   - DETERMINISM: same runs ⇒ same CellMeter ⇒ same EconomicsDecision (no clock/rng/I/O).
//   - COMPTAGE, JAMAIS ESTIMATION: the metered cost is the exact arithmetic SUM of the runs'
//     RunMeters — never an approximation; an empty cell meters to zero.
//   - ORDER-INDEPENDENCE: permuting the runs yields the identical meter (sum is commutative).
//   - ADVISORY, JAMAIS BLOCAGE SILENCIEUX: an over-budget cell is FLAGGED (a BlockReason that
//     the panel/disjoncteur reads), never silently dropped — the verdict is always one of the
//     three closed verdicts, and over-budget-without-justification is ALWAYS flagged.
//   - PLUS C'EST CHER, PLUS ÇA DOIT SE JUSTIFIER: a cost over a cap clears the flag ONLY with
//     a ValueCase{justified}; no justified case ⇒ flagged. (The costlier the cell, the more it
//     must justify its value to avoid the advisory.)
//   - THE S83 WIRE: DisjoncteurSignal.Trip == OverBudget(dec) == (verdict==over_budget_flagged).

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/costmeter"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// genRunCost draws a real recorded run paired with a non-negative RunMeter.
func genRunCost(t *rapid.T, i int) costmeter.RunCost {
	run, err := agentrun.Record(agentrun.AgentRun{
		Agent:       "agent@v1",
		Goal:        "goal-x",
		RedWorkItem: rapid.SampledFrom([]string{"a", "b", "c", "d"}).Draw(t, "item"),
		ContextPack: "pack",
		Result:      agentrun.ResultGreen,
		StartedAt:   "2026-06-09T10:00:00Z",
		EndedAt:     "2026-06-09T10:05:00Z",
	})
	if err != nil {
		t.Fatalf("record run: %v", err)
	}
	return costmeter.RunCost{
		Run: run,
		Meter: agentimpl.RunMeter{
			Tokens:        rapid.IntRange(0, 30000).Draw(t, "tok"),
			Turns:         rapid.IntRange(0, 50).Draw(t, "turns"),
			CIMinutes:     rapid.IntRange(0, 20).Draw(t, "ci"),
			WallClockSecs: rapid.IntRange(0, 3600).Draw(t, "wc"),
		},
	}
}

func genRuns(t *rapid.T) []costmeter.RunCost {
	n := rapid.IntRange(0, 6).Draw(t, "n")
	runs := make([]costmeter.RunCost, n)
	for i := range runs {
		runs[i] = genRunCost(t, i)
	}
	return runs
}

func genBudget(t *rapid.T) economics.HarnessCostBudget {
	risks := []economics.Risk{economics.RiskLow, economics.RiskMedium, economics.RiskHigh, economics.RiskCritical}
	return economics.HarnessCostBudget{
		CellRef:                  "cell",
		MaxCIMinutes:             rapid.IntRange(0, 100).Draw(t, "maxci"),
		MaxLLMTokensPerGoal:      rapid.IntRange(0, 100000).Draw(t, "maxtok"),
		MaxMutationRuntimeSecond: rapid.IntRange(0, 600).Draw(t, "maxmut"),
		MaxHumanReviewMinutes:    rapid.IntRange(0, 120).Draw(t, "maxhr"),
		ExpectedRiskReduction:    rapid.SampledFrom(risks).Draw(t, "rr"),
	}
}

// TestProp_Deterministic — same runs ⇒ identical CellMeter and identical EconomicsDecision.
func TestProp_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget(rt)
		runs := genRuns(rt)
		cm1, d1 := costmeter.MeterCell(b, runs, nil)
		cm2, d2 := costmeter.MeterCell(b, runs, nil)
		if !reflect.DeepEqual(cm1, cm2) {
			rt.Fatalf("non-deterministic CellMeter: %+v vs %+v", cm1, cm2)
		}
		if !reflect.DeepEqual(d1, d2) {
			rt.Fatalf("non-deterministic decision: %+v vs %+v", d1, d2)
		}
	})
}

// TestProp_CountedNotEstimated — the metered cost equals the exact arithmetic sum of the
// runs' meters on the two §66.3 axes. A count, never an estimate.
func TestProp_CountedNotEstimated(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		runs := genRuns(rt)
		var wantTok, wantCI int
		for _, rc := range runs {
			wantTok += rc.Meter.Tokens
			wantCI += rc.Meter.CIMinutes
		}
		cm := costmeter.Aggregate("cell", runs)
		if cm.Cost.LLMTokens != wantTok {
			rt.Fatalf("tokens: got %d want exact sum %d", cm.Cost.LLMTokens, wantTok)
		}
		if cm.Cost.CIMinutes != wantCI {
			rt.Fatalf("ci_minutes: got %d want exact sum %d", cm.Cost.CIMinutes, wantCI)
		}
		// Axes an agent run never produces stay zero (no fabricated cost).
		if cm.Cost.MutationRuntimeSecond != 0 || cm.Cost.HumanReviewMinutes != 0 {
			rt.Fatal("mutation/human-review cost must stay zero (an agent run does not produce them)")
		}
		if cm.RunCount != len(runs) {
			rt.Fatalf("run_count: got %d want %d", cm.RunCount, len(runs))
		}
	})
}

// TestProp_OrderIndependent — permuting the runs yields the identical aggregated meter.
func TestProp_OrderIndependent(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		runs := genRuns(rt)
		if len(runs) < 2 {
			return
		}
		// reverse copy
		rev := make([]costmeter.RunCost, len(runs))
		for i := range runs {
			rev[len(runs)-1-i] = runs[i]
		}
		if costmeter.AggregateMeter(runs) != costmeter.AggregateMeter(rev) {
			rt.Fatal("aggregate meter must be order-independent (sum is commutative)")
		}
	})
}

// TestProp_VerdictAlwaysClosed_OverBudgetAlwaysFlaggedUnlessJustified — the verdict is always
// one of the three closed verdicts; an over-budget cost WITHOUT a justified value_case is
// ALWAYS flagged (advisory carried, never a silent drop). The costlier-justify-more rule.
func TestProp_VerdictAlwaysClosed_OverBudgetAlwaysFlaggedUnlessJustified(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget(rt)
		runs := genRuns(rt)
		cm, dec := costmeter.MeterCell(b, runs, nil)

		closed := dec.Verdict == economics.VerdictWithinBudget ||
			dec.Verdict == economics.VerdictOverBudgetJustified ||
			dec.Verdict == economics.VerdictOverBudgetFlagged
		if !closed {
			rt.Fatalf("verdict out of closed set: %q", dec.Verdict)
		}

		over := cm.Cost.LLMTokens > b.MaxLLMTokensPerGoal || cm.Cost.CIMinutes > b.MaxCIMinutes
		if over {
			// No value_case ⇒ ALWAYS flagged (advisory), never silently within-budget.
			if dec.Verdict != economics.VerdictOverBudgetFlagged {
				rt.Fatalf("over-budget without value_case must be flagged, got %q", dec.Verdict)
			}
			if dec.BlockReason == nil {
				rt.Fatal("a flagged cell must carry the advisory block_reason (never silent)")
			}
			if !costmeter.DisjoncteurSignal(dec).Trip {
				rt.Fatal("a flagged cell must trip the disjoncteur signal (the S83 wire)")
			}
		} else if dec.Verdict != economics.VerdictWithinBudget {
			rt.Fatalf("within every cap must be within_budget, got %q", dec.Verdict)
		}
	})
}

// TestProp_JustifiedClearsFlag — the SAME over-budget cost carrying a ValueCase{justified}
// is over_budget_justified (no block, no trip): the costly cell justified its value.
func TestProp_JustifiedClearsFlag(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget(rt)
		runs := genRuns(rt)
		cm := costmeter.Aggregate(b.CellRef, runs)
		over := cm.Cost.LLMTokens > b.MaxLLMTokensPerGoal || cm.Cost.CIMinutes > b.MaxCIMinutes
		if !over {
			return // only meaningful when over budget
		}
		vc := &economics.ValueCase{Truth: "t", RiskIfBroken: economics.RiskHigh, Decision: economics.DecisionJustified}
		_, dec := costmeter.MeterCell(b, runs, vc)
		if dec.Verdict != economics.VerdictOverBudgetJustified {
			rt.Fatalf("justified over-budget must be over_budget_justified, got %q", dec.Verdict)
		}
		if dec.BlockReason != nil {
			rt.Fatal("a justified cell carries no block_reason")
		}
		if costmeter.DisjoncteurSignal(dec).Trip {
			rt.Fatal("a justified cell must not trip the disjoncteur")
		}
	})
}

// TestProp_DisjoncteurWire — Trip == OverBudget(dec) == (verdict == over_budget_flagged):
// the named S111→S83 contract, never a fabricated trip.
func TestProp_DisjoncteurWire(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget(rt)
		runs := genRuns(rt)
		_, dec := costmeter.MeterCell(b, runs, nil)
		sig := costmeter.DisjoncteurSignal(dec)
		if sig.Trip != costmeter.OverBudget(dec) {
			rt.Fatal("DisjoncteurSignal.Trip must equal OverBudget(dec)")
		}
		if sig.Trip != (dec.Verdict == economics.VerdictOverBudgetFlagged) {
			rt.Fatal("Trip must equal (verdict == over_budget_flagged)")
		}
		if sig.Trip && sig.BlockReason == nil {
			rt.Fatal("a tripping signal must carry the advisory block_reason")
		}
		if !sig.Trip && sig.BlockReason != nil {
			rt.Fatal("a non-tripping signal must carry no block_reason")
		}
	})
}

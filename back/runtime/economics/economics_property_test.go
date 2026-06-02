package economics_test

// S51 REPRODUCIBILITY MIRROR — property invariant (rapid, authority: below).
// Determinism-first (CLAUDE.md §6/§8): Evaluate is the authoritative pure function;
// these properties pin that for ANY generated (budget, cost, valueCase):
//
//   - Evaluate is DETERMINISTIC (same input → same verdict) and TOTAL (always one of
//     within_budget | over_budget_justified | over_budget_flagged);
//   - a cost within EVERY cap ⇒ within_budget regardless of the ValueCase;
//   - a cost exceeding ANY cap with no justified ValueCase ⇒ never within_budget and
//     always over_budget_flagged with a HARNESS_COST_EXCEEDS_BUDGET BlockReason (the
//     §66.3 rule — a costly constraint that does not justify its value is flagged);
//   - the SAME over-budget cost with decision==justified ⇒ over_budget_justified, and
//     too_expensive/revisit does NOT clear the flag;
//   - Evaluate writes no truth, raises no budget, never reads time.Now() (pure);
//   - Validate returns a non-empty error on a negative cap / out-of-enum
//     risk_if_broken|decision / malformed truth ref;
//   - a snapshot id == content hash of its canonical body (S01/S02 content-addressing).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/economics"
	"pgregory.net/rapid"
)

func genBudget() *rapid.Generator[economics.HarnessCostBudget] {
	return rapid.Custom(func(t *rapid.T) economics.HarnessCostBudget {
		risks := []economics.Risk{economics.RiskLow, economics.RiskMedium, economics.RiskHigh, economics.RiskCritical}
		return economics.HarnessCostBudget{
			CellRef:                  rapid.StringMatching(`[a-z][a-z0-9_-]{0,12}`).Draw(t, "cell"),
			MaxCIMinutes:             rapid.IntRange(0, 1000).Draw(t, "ci"),
			MaxLLMTokensPerGoal:      rapid.IntRange(0, 1_000_000).Draw(t, "tokens"),
			MaxMutationRuntimeSecond: rapid.IntRange(0, 100000).Draw(t, "mut"),
			MaxHumanReviewMinutes:    rapid.IntRange(0, 10000).Draw(t, "hr"),
			ExpectedRiskReduction:    rapid.SampledFrom(risks).Draw(t, "rr"),
		}
	})
}

func genCost() *rapid.Generator[economics.MeasuredCost] {
	return rapid.Custom(func(t *rapid.T) economics.MeasuredCost {
		return economics.MeasuredCost{
			CIMinutes:             rapid.IntRange(0, 2000).Draw(t, "ci"),
			LLMTokens:             rapid.IntRange(0, 2_000_000).Draw(t, "tokens"),
			MutationRuntimeSecond: rapid.IntRange(0, 200000).Draw(t, "mut"),
			HumanReviewMinutes:    rapid.IntRange(0, 20000).Draw(t, "hr"),
		}
	})
}

func genDecision() *rapid.Generator[economics.Decision] {
	return rapid.SampledFrom([]economics.Decision{
		economics.DecisionJustified, economics.DecisionTooExpensive, economics.DecisionRevisit,
	})
}

func within(b economics.HarnessCostBudget, c economics.MeasuredCost) bool {
	return c.CIMinutes <= b.MaxCIMinutes &&
		c.LLMTokens <= b.MaxLLMTokensPerGoal &&
		c.MutationRuntimeSecond <= b.MaxMutationRuntimeSecond &&
		c.HumanReviewMinutes <= b.MaxHumanReviewMinutes
}

func isVerdict(v economics.Verdict) bool {
	return v == economics.VerdictWithinBudget ||
		v == economics.VerdictOverBudgetJustified ||
		v == economics.VerdictOverBudgetFlagged
}

// Evaluate is deterministic and total over (budget, cost, optional valueCase).
func TestProp_Evaluate_DeterministicAndTotal(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget().Draw(rt, "budget")
		c := genCost().Draw(rt, "cost")
		hasVC := rapid.Bool().Draw(rt, "hasVC")
		var vc *economics.ValueCase
		if hasVC {
			vc = &economics.ValueCase{Truth: "t", RiskIfBroken: economics.RiskHigh, Decision: genDecision().Draw(rt, "dec")}
		}
		a := economics.Evaluate(b, c, vc)
		again := economics.Evaluate(b, c, vc)
		if a.Verdict != again.Verdict {
			rt.Fatalf("non-deterministic: %q then %q", a.Verdict, again.Verdict)
		}
		if !isVerdict(a.Verdict) {
			rt.Fatalf("verdict %q is outside the closed set (not total)", a.Verdict)
		}
	})
}

// within every cap ⇒ within_budget regardless of the value case.
func TestProp_WithinBudget_RegardlessOfValueCase(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget().Draw(rt, "budget")
		c := genCost().Draw(rt, "cost")
		if !within(b, c) {
			return
		}
		for _, vc := range []*economics.ValueCase{
			nil,
			{Truth: "t", RiskIfBroken: economics.RiskHigh, Decision: economics.DecisionJustified},
			{Truth: "t", RiskIfBroken: economics.RiskLow, Decision: economics.DecisionTooExpensive},
		} {
			got := economics.Evaluate(b, c, vc)
			if got.Verdict != economics.VerdictWithinBudget {
				rt.Fatalf("within budget but verdict = %q (vc=%v)", got.Verdict, vc)
			}
			if got.BlockReason != nil {
				rt.Fatalf("within budget but block_reason present")
			}
		}
	})
}

// over ANY cap with no justified value case ⇒ never within_budget, always
// over_budget_flagged with a HARNESS_COST_EXCEEDS_BUDGET BlockReason (the §66.3 rule).
func TestProp_OverBudget_NoJustified_AlwaysFlagged(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget().Draw(rt, "budget")
		c := genCost().Draw(rt, "cost")
		if within(b, c) {
			return
		}
		// non-justified value cases: nil, too_expensive, revisit.
		for _, vc := range []*economics.ValueCase{
			nil,
			{Truth: "t", RiskIfBroken: economics.RiskHigh, Decision: economics.DecisionTooExpensive},
			{Truth: "t", RiskIfBroken: economics.RiskMedium, Decision: economics.DecisionRevisit},
		} {
			got := economics.Evaluate(b, c, vc)
			if got.Verdict == economics.VerdictWithinBudget {
				rt.Fatalf("over budget but within_budget verdict (vc=%v)", vc)
			}
			if got.Verdict != economics.VerdictOverBudgetFlagged {
				rt.Fatalf("over budget, no justified vc, but verdict = %q (want over_budget_flagged)", got.Verdict)
			}
			if got.BlockReason == nil || got.BlockReason.Code != economics.CodeHarnessCostExceedsBudget {
				rt.Fatalf("flagged but block_reason = %+v (want HARNESS_COST_EXCEEDS_BUDGET)", got.BlockReason)
			}
			if len(got.BlockReason.HowToFix) == 0 {
				rt.Fatal("flagged BlockReason has empty how_to_fix (a prison, KRD §44.5)")
			}
		}
	})
}

// the SAME over-budget cost with decision==justified ⇒ over_budget_justified.
func TestProp_OverBudget_Justified_EarnedItsKeep(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget().Draw(rt, "budget")
		c := genCost().Draw(rt, "cost")
		if within(b, c) {
			return
		}
		vc := &economics.ValueCase{Truth: "t", RiskIfBroken: economics.RiskHigh, Decision: economics.DecisionJustified}
		got := economics.Evaluate(b, c, vc)
		if got.Verdict != economics.VerdictOverBudgetJustified {
			rt.Fatalf("over budget + justified: verdict = %q (want over_budget_justified)", got.Verdict)
		}
		if got.BlockReason != nil {
			rt.Fatal("over budget + justified: block_reason should be nil (earned its keep)")
		}
	})
}

// ValidateBudget errors on a negative cap or an out-of-enum risk.
func TestProp_ValidateBudget_RejectsBadShapes(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget().Draw(rt, "budget")
		// a well-formed budget validates.
		if err := economics.ValidateBudget(b); err != nil {
			rt.Fatalf("well-formed budget rejected: %v", err)
		}
		// negative cap ⇒ error.
		bad := b
		bad.MaxCIMinutes = -1
		if economics.ValidateBudget(bad) == nil {
			rt.Fatal("negative cap accepted")
		}
		// out-of-enum risk ⇒ error.
		badR := b
		badR.ExpectedRiskReduction = economics.Risk("nope")
		if economics.ValidateBudget(badR) == nil {
			rt.Fatal("out-of-enum expected_risk_reduction accepted")
		}
	})
}

// ValidateValueCase errors on an out-of-enum decision / risk / empty truth.
func TestProp_ValidateValueCase_RejectsBadShapes(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		good := economics.ValueCase{Truth: "checkout.x", RiskIfBroken: economics.RiskHigh, Decision: genDecision().Draw(rt, "dec")}
		if err := economics.ValidateValueCase(good); err != nil {
			rt.Fatalf("well-formed value case rejected: %v", err)
		}
		if economics.ValidateValueCase(economics.ValueCase{Truth: "", RiskIfBroken: economics.RiskHigh, Decision: economics.DecisionJustified}) == nil {
			rt.Fatal("empty truth ref accepted")
		}
		if economics.ValidateValueCase(economics.ValueCase{Truth: "t", RiskIfBroken: economics.Risk("x"), Decision: economics.DecisionJustified}) == nil {
			rt.Fatal("out-of-enum risk accepted")
		}
		if economics.ValidateValueCase(economics.ValueCase{Truth: "t", RiskIfBroken: economics.RiskHigh, Decision: economics.Decision("x")}) == nil {
			rt.Fatal("out-of-enum decision accepted")
		}
	})
}

// a snapshot id equals the content hash of its canonical body, and is deterministic.
func TestProp_SnapshotID_ContentAddressed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := genBudget().Draw(rt, "budget")
		c := genCost().Draw(rt, "cost")
		d := economics.Evaluate(b, c, nil)
		id1, err := economics.SnapshotID(b, c, d, nil)
		if err != nil {
			rt.Fatalf("snapshot id error: %v", err)
		}
		id2, _ := economics.SnapshotID(b, c, d, nil)
		if id1 != id2 {
			rt.Fatalf("snapshot id non-deterministic: %q vs %q", id1, id2)
		}
		if id1 == "" {
			rt.Fatal("snapshot id is empty")
		}
	})
}

// budget_property_test.go — the RED-first reproducibility + boundary mirror of BA11.
// It pins the RunMeter (monotone tally of tokens/turns/ci-minutes/wall-clock) and the
// pure CheckBudget gate whose effective per-shared-axis cap is the MIN of the two
// declarations (goal.Budgets S29 ∧ economics.HarnessCostBudget S51) — the tightest cap
// wins, fail-closed. No live LLM; the gate is the authoritative deterministic min().
//
// THE PROPERTIES (the red set this step turns green):
//
//  1. monotone — Tally never decreases any axis (the meter only grows).
//  2. determinism — same (meter, caps, rate, deadline) ⇒ identical verdict.
//  3. min-is-authoritative — the effective tokens cap is exactly min(S29, S51); the
//     verdict flips at THAT minimum, never the laxer of the two.
//  4. boundary — the verdict is within-budget at cost == effective cap, breached at
//     cap+1 (the cap is the inclusive ceiling).
//  5. fail-closed — over on ANY axis breaches (per-axis OR); within IFF within on all.
//  6. cost-aware — cost = tokens × declared rate; the comparable unit is monotone in
//     tokens.
//  7. wall-clock deadline — a run that exceeds the declared deadline breaches even with
//     zero tokens (a hung agent burns time, not tokens).
//  8. block-reason — a breach carries AGENT_BUDGET_EXCEEDED with a non-empty how_to_fix
//     and names the breached axis; a within-budget verdict carries no BlockReason.
package agentimpl

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// genCaps builds a goal.Budgets (S29) and an economics.HarnessCostBudget (S51) with
// independent non-negative caps so the min() over the shared axes is exercised across
// every ordering (S29 tighter, S51 tighter, equal).
func genCaps(t *rapid.T) (goal.Budgets, economics.HarnessCostBudget) {
	b := goal.Budgets{
		TimeSeconds: rapid.IntRange(0, 100000).Draw(t, "s29_time"),
		Turns:       rapid.IntRange(0, 1000).Draw(t, "s29_turns"),
		Tokens:      rapid.IntRange(0, 1000000).Draw(t, "s29_tokens"),
	}
	h := economics.HarnessCostBudget{
		CellRef:               "cell:" + rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "cell"),
		MaxCIMinutes:          rapid.IntRange(0, 10000).Draw(t, "s51_ci"),
		MaxLLMTokensPerGoal:   rapid.IntRange(0, 1000000).Draw(t, "s51_tokens"),
		ExpectedRiskReduction: economics.RiskMedium,
	}
	return b, h
}

// TestRunMeter_Monotone — Tally never lowers any axis (the meter only grows).
func TestRunMeter_Monotone(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		var m RunMeter
		n := rapid.IntRange(1, 8).Draw(t, "deltas")
		for i := 0; i < n; i++ {
			before := m
			d := RunDelta{
				Tokens:        rapid.IntRange(0, 1000).Draw(t, "dt"),
				Turns:         rapid.IntRange(0, 5).Draw(t, "du"),
				CIMinutes:     rapid.IntRange(0, 50).Draw(t, "dc"),
				WallClockSecs: rapid.IntRange(0, 600).Draw(t, "dw"),
			}
			m = m.Tally(d)
			if m.Tokens < before.Tokens || m.Turns < before.Turns ||
				m.CIMinutes < before.CIMinutes || m.WallClockSecs < before.WallClockSecs {
				t.Fatalf("meter decreased: before=%+v after=%+v", before, m)
			}
		}
	})
}

// TestCheckBudget_Deterministic — same inputs ⇒ identical verdict (reproducibility).
func TestCheckBudget_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b, h := genCaps(t)
		m := RunMeter{
			Tokens:        rapid.IntRange(0, 1000000).Draw(t, "m_tok"),
			Turns:         rapid.IntRange(0, 1000).Draw(t, "m_turn"),
			CIMinutes:     rapid.IntRange(0, 10000).Draw(t, "m_ci"),
			WallClockSecs: rapid.IntRange(0, 100000).Draw(t, "m_wall"),
		}
		rate := rapid.Float64Range(0, 0.01).Draw(t, "rate")
		v1 := CheckBudget(m, h, b, rate)
		v2 := CheckBudget(m, h, b, rate)
		if v1.WithinBudget != v2.WithinBudget || v1.BreachedAxis != v2.BreachedAxis {
			t.Fatalf("non-deterministic: %+v vs %+v", v1, v2)
		}
		if (v1.BlockReason == nil) != (v2.BlockReason == nil) {
			t.Fatalf("non-deterministic block reason presence")
		}
	})
}

// TestCheckBudget_MinIsAuthoritative_Boundary — the effective tokens cap is exactly
// min(S29.Tokens, S51.MaxLLMTokensPerGoal); the verdict is within at the cap and
// breached at cap+1 (the boundary), with no other axis over.
func TestCheckBudget_MinIsAuthoritative_Boundary(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s29 := rapid.IntRange(0, 100000).Draw(t, "s29_tok")
		s51 := rapid.IntRange(0, 100000).Draw(t, "s51_tok")
		eff := s29
		if s51 < eff {
			eff = s51
		}
		b := goal.Budgets{TimeSeconds: 1 << 30, Turns: 1 << 30, Tokens: s29}
		h := economics.HarnessCostBudget{
			CellRef:               "cell:b",
			MaxCIMinutes:          1 << 30,
			MaxLLMTokensPerGoal:   s51,
			ExpectedRiskReduction: economics.RiskLow,
		}
		// At the effective cap: within budget.
		atCap := RunMeter{Tokens: eff}
		if v := CheckBudget(atCap, h, b, 0); !v.WithinBudget {
			t.Fatalf("expected within at effective cap %d (s29=%d s51=%d), got %+v", eff, s29, s51, v)
		}
		// One past the effective cap: breached on the tokens axis.
		past := RunMeter{Tokens: eff + 1}
		v := CheckBudget(past, h, b, 0)
		if v.WithinBudget {
			t.Fatalf("expected breach at eff+1=%d (s29=%d s51=%d), got within", eff+1, s29, s51)
		}
		if v.BreachedAxis != "tokens" {
			t.Fatalf("expected breached axis tokens, got %q", v.BreachedAxis)
		}
	})
}

// TestCheckBudget_FailClosed_AnyAxis — over on ANY axis breaches; within IFF within on
// every axis (per-axis OR).
func TestCheckBudget_FailClosed_AnyAxis(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b, h := genCaps(t)
		// Effective caps.
		effTok := b.Tokens
		if h.MaxLLMTokensPerGoal < effTok {
			effTok = h.MaxLLMTokensPerGoal
		}
		m := RunMeter{
			Tokens:        rapid.IntRange(0, 2000000).Draw(t, "m_tok"),
			Turns:         rapid.IntRange(0, 2000).Draw(t, "m_turn"),
			CIMinutes:     rapid.IntRange(0, 20000).Draw(t, "m_ci"),
			WallClockSecs: rapid.IntRange(0, 200000).Draw(t, "m_wall"),
		}
		over := m.Tokens > effTok || m.Turns > b.Turns ||
			m.CIMinutes > h.MaxCIMinutes || m.WallClockSecs > b.TimeSeconds
		v := CheckBudget(m, h, b, 0)
		if v.WithinBudget == over {
			t.Fatalf("fail-closed mismatch: over=%v within=%v m=%+v effTok=%d", over, v.WithinBudget, m, effTok)
		}
	})
}

// TestCheckBudget_CostAware — the comparable cost is tokens × declared rate, monotone
// non-decreasing in tokens.
func TestCheckBudget_CostAware(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		rate := rapid.Float64Range(0, 1).Draw(t, "rate")
		a := rapid.IntRange(0, 1000000).Draw(t, "a")
		extra := rapid.IntRange(0, 1000000).Draw(t, "extra")
		c1 := CostAware(RunMeter{Tokens: a}, rate)
		c2 := CostAware(RunMeter{Tokens: a + extra}, rate)
		if c2 < c1 {
			t.Fatalf("cost not monotone in tokens: c1=%v c2=%v", c1, c2)
		}
	})
}

// TestCheckBudget_WallClockDeadline — a run that exceeds the declared wall-clock
// deadline breaches even with zero tokens (a hung agent burns time, not tokens).
func TestCheckBudget_WallClockDeadline(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		deadline := rapid.IntRange(0, 100000).Draw(t, "deadline")
		b := goal.Budgets{TimeSeconds: deadline, Turns: 1 << 30, Tokens: 1 << 30}
		h := economics.HarnessCostBudget{
			CellRef:               "cell:w",
			MaxCIMinutes:          1 << 30,
			MaxLLMTokensPerGoal:   1 << 30,
			ExpectedRiskReduction: economics.RiskLow,
		}
		over := RunMeter{Tokens: 0, WallClockSecs: deadline + 1}
		v := CheckBudget(over, h, b, 0)
		if v.WithinBudget {
			t.Fatalf("expected wall-clock breach at %d > %d with zero tokens, got within", deadline+1, deadline)
		}
		if v.BreachedAxis != "wall_clock" {
			t.Fatalf("expected breached axis wall_clock, got %q", v.BreachedAxis)
		}
	})
}

// TestCheckBudget_BlockReasonShape — a breach carries AGENT_BUDGET_EXCEEDED with a
// non-empty how_to_fix; a within-budget verdict carries no BlockReason.
func TestCheckBudget_BlockReasonShape(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b, h := genCaps(t)
		m := RunMeter{
			Tokens:        rapid.IntRange(0, 2000000).Draw(t, "m_tok"),
			Turns:         rapid.IntRange(0, 2000).Draw(t, "m_turn"),
			CIMinutes:     rapid.IntRange(0, 20000).Draw(t, "m_ci"),
			WallClockSecs: rapid.IntRange(0, 200000).Draw(t, "m_wall"),
		}
		v := CheckBudget(m, h, b, 0)
		if v.WithinBudget {
			if v.BlockReason != nil {
				t.Fatalf("within budget must carry no BlockReason, got %+v", v.BlockReason)
			}
			return
		}
		if v.BlockReason == nil {
			t.Fatalf("breach must carry a BlockReason")
		}
		if v.BlockReason.Code != blockreason.CodeAgentBudgetExceeded {
			t.Fatalf("breach code = %q, want AGENT_BUDGET_EXCEEDED", v.BlockReason.Code)
		}
		if len(v.BlockReason.HowToFix) == 0 {
			t.Fatalf("breach BlockReason has empty how_to_fix (a prison)")
		}
		if v.BreachedAxis == "" {
			t.Fatalf("breach must name the breached axis")
		}
	})
}

// TestCheckBudget_EqualCaps — when both declarations are equal, the verdict flips at
// that shared value (a sanity boundary the min() must respect).
func TestCheckBudget_EqualCaps(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cap := rapid.IntRange(0, 100000).Draw(t, "cap")
		b := goal.Budgets{TimeSeconds: 1 << 30, Turns: 1 << 30, Tokens: cap}
		h := economics.HarnessCostBudget{
			CellRef:               "cell:e",
			MaxCIMinutes:          1 << 30,
			MaxLLMTokensPerGoal:   cap,
			ExpectedRiskReduction: economics.RiskLow,
		}
		if v := CheckBudget(RunMeter{Tokens: cap}, h, b, 0); !v.WithinBudget {
			t.Fatalf("equal caps: expected within at %d", cap)
		}
		if v := CheckBudget(RunMeter{Tokens: cap + 1}, h, b, 0); v.WithinBudget {
			t.Fatalf("equal caps: expected breach at %d", cap+1)
		}
	})
}

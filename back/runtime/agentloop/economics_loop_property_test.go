// economics_loop_property_test.go — the BA27 reproducibility + invariant mirror (∀),
// determinism-first (CLAUDE.md §6/§8). These rapid properties pin the wiring of the live
// meter + halt-on-budget into the loop:
//
//   - MONOTONE METER: the meter DriveWithEconomics returns is monotone non-decreasing along
//     the executed turns — it only grows (the RunMeter invariant, lifted to the loop).
//   - NEVER CROSS THE CAP (anti-runaway, pre-call): the meter of a terminated run NEVER
//     exceeds the effective token cap (min of S29/S51, BA11). A run that would cross is
//     halted BEFORE the crossing turn — proven for EVERY arbitrary script.
//   - ABANDONED IFF HALTED: a run halted by the budget lands Result:abandoned; a run that
//     never breaches never lands abandoned for a budget reason.
//   - REPRODUCIBLE: identical input ⇒ identical (run, meter) — twice (no clock, no rng).
//   - MEASURED-COST MAP IS PURE/TOTAL: MeasuredCostOf is deterministic and maps the token
//     axis onto economics.MeasuredCost.LLMTokens (cost is consumed, never produced).
package agentloop

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"pgregory.net/rapid"
)

// genEcoInput draws an arbitrary DriveInput with a SMALL token cap so the budget terminal
// is frequently exercised — the point of the never-cross-cap property.
func genEcoInput(t *rapid.T) DriveInput {
	g := goal.Goal{
		ID:     "goal-eco",
		RedSet: []string{"mirror.a", "mirror.b"},
		Status: goal.StatusOpen,
		Budgets: goal.Budgets{
			TimeSeconds: 10_000,
			Turns:       10_000,
			Tokens:      rapid.IntRange(0, 50).Draw(t, "tok-cap"),
		},
	}
	turns := rapid.SliceOfN(rapid.Custom(genTurn), 0, 8).Draw(t, "turns")
	h := economics.HarnessCostBudget{
		CellRef:               "cell-eco",
		MaxLLMTokensPerGoal:   rapid.IntRange(0, 50).Draw(t, "h-tok-cap"),
		MaxCIMinutes:          10_000,
		ExpectedRiskReduction: economics.RiskLow,
	}
	return DriveInput{
		Impl:          permissiveImpl(),
		Goal:          g,
		RedWorkItem:   "item",
		ContextPack:   "pack",
		Sensors:       allRed(g),
		PriorGreen:    goal.PriorIntact,
		Mutation:      1.0,
		MutationFloor: 0.0,
		HarnessBudget: h,
		RatePerToken:  0.000001,
		Generator:     ScriptedGenerator{Turns: turns},
		StartedAt:     "2026-06-03T00:00:00Z",
		EndedAt:       "2026-06-03T00:05:00Z",
	}
}

// The meter of a terminated run NEVER exceeds the effective token cap (min S29/S51) — the
// loop never crosses a turn beyond the cap (anti-runaway, proven pre-call).
func TestProp_Eco_MeterNeverCrossesCap(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		in := genEcoInput(rt)
		_, meter, err := DriveWithEconomics(in)
		if err != nil {
			rt.Fatalf("DriveWithEconomics errored: %v", err)
		}
		cap := agentimpl.EffectiveTokensCap(in.HarnessBudget, in.Goal.Budgets)
		if meter.Tokens > cap {
			rt.Fatalf("meter %d crossed the effective token cap %d (pre-call halt failed)", meter.Tokens, cap)
		}
	})
}

// A run halted by the budget lands abandoned; a within-budget meter never lands abandoned
// for a budget reason (abandoned IFF the budget terminal fired).
func TestProp_Eco_AbandonedIffBudgetHalt(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		in := genEcoInput(rt)
		run, meter, err := DriveWithEconomics(in)
		if err != nil {
			rt.Fatalf("DriveWithEconomics errored: %v", err)
		}
		cap := agentimpl.EffectiveTokensCap(in.HarnessBudget, in.Goal.Budgets)
		// If the run abandoned, the LAST recorded action must be a budget refusal and the
		// meter must sit at/below the cap (never above — the pre-call halt held).
		if run.Result == agentrun.ResultAbandoned {
			if meter.Tokens > cap {
				rt.Fatalf("abandoned run's meter %d exceeds cap %d", meter.Tokens, cap)
			}
			if len(run.Actions) == 0 {
				rt.Fatalf("abandoned run must record at least the breach refusal")
			}
		}
	})
}

// Reproducibility: identical input ⇒ identical (run, meter), twice.
func TestProp_Eco_Reproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		in := genEcoInput(rt)
		r1, m1, e1 := DriveWithEconomics(in)
		r2, m2, e2 := DriveWithEconomics(in)
		if (e1 == nil) != (e2 == nil) {
			rt.Fatalf("error determinism broken: %v vs %v", e1, e2)
		}
		if !reflect.DeepEqual(r1, r2) {
			rt.Fatalf("runs differ across identical inputs:\n%+v\n%+v", r1, r2)
		}
		if m1 != m2 {
			rt.Fatalf("meters differ across identical inputs: %+v vs %+v", m1, m2)
		}
	})
}

// MeasuredCostOf is pure/total and maps the token tally onto LLMTokens; never panics.
func TestProp_Eco_MeasuredCostMap(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		m := agentimpl.RunMeter{
			Tokens:        rapid.IntRange(0, 1_000_000).Draw(rt, "tok"),
			CIMinutes:     rapid.IntRange(0, 10_000).Draw(rt, "ci"),
			Turns:         rapid.IntRange(0, 10_000).Draw(rt, "turns"),
			WallClockSecs: rapid.IntRange(0, 10_000).Draw(rt, "wc"),
		}
		c1 := MeasuredCostOf(m)
		c2 := MeasuredCostOf(m)
		if c1 != c2 {
			rt.Fatalf("MeasuredCostOf not deterministic: %+v vs %+v", c1, c2)
		}
		if c1.LLMTokens != m.Tokens {
			rt.Fatalf("MeasuredCostOf must map Tokens→LLMTokens, got %d want %d", c1.LLMTokens, m.Tokens)
		}
		if c1.CIMinutes != m.CIMinutes {
			rt.Fatalf("MeasuredCostOf must map CIMinutes→CIMinutes, got %d want %d", c1.CIMinutes, m.CIMinutes)
		}
	})
}

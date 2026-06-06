package compound_test

// CE05 reproducibility mirror (determinism-first, CLAUDE.md §6/§8). The reuse ROUTER is a PURE
// function: the SAME (corpus, next goal) ⇒ the SAME plan — identical routing, identical token
// deltas. There is no LLM, no clock, no rng; routing is a NAME MATCH against the declared corpus.
// The properties re-assert, across the whole input space, the load-bearing CE05 invariants:
//   - DETERMINISM: same input ⇒ byte-identical plan;
//   - THE WALL: no plan EVER writes kernel truth (WroteKernel false);
//   - THE PAYOFF: reusing ≥1 unit ⇒ EffortAfter < EffortBefore (monotone — reuse never costs more);
//   - THE FRONTIER: reusing 0 units ⇒ EffortAfter == EffortBefore (no fabricated reuse);
//   - CONSERVATION: reused + fresh == |required| (every unit routed exactly once).

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/compound"
)

func capturedGen() *rapid.Generator[[]compound.CapturedUnit] {
	return rapid.Custom(func(t *rapid.T) []compound.CapturedUnit {
		names := rapid.SliceOfNDistinct(
			rapid.StringMatching(`[a-z_]{3,16}`), 0, 6, func(s string) string { return s },
		).Draw(t, "names")
		out := make([]compound.CapturedUnit, len(names))
		for i, n := range names {
			out[i] = compound.CapturedUnit{Name: n, Channel: compound.ChannelProceduralMemory}
		}
		return out
	})
}

func corpusGen() *rapid.Generator[compound.Corpus] {
	return rapid.Custom(func(t *rapid.T) compound.Corpus {
		return compound.Corpus{
			Procedural: capturedGen().Draw(t, "procedural"),
			Behavior:   capturedGen().Draw(t, "behavior"),
			SourceGoal: rapid.StringMatching(`goal-[a-z]{3,10}`).Draw(t, "source"),
		}
	})
}

func nextGen() *rapid.Generator[compound.NextGoal] {
	return rapid.Custom(func(t *rapid.T) compound.NextGoal {
		return compound.NextGoal{
			GoalID:   rapid.StringMatching(`goal-[a-z]{3,10}`).Draw(t, "goalID"),
			Required: rapid.SliceOfN(rapid.StringMatching(`[a-z_]{3,16}`), 1, 10).Draw(t, "required"),
		}
	})
}

// Same input ⇒ same plan (byte-identical via reflect.DeepEqual).
func TestReuse_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := corpusGen().Draw(t, "corpus")
		n := nextGen().Draw(t, "next")
		a, err := compound.Reuse(c, n)
		if err != nil {
			t.Fatalf("run A error: %v", err)
		}
		b, err := compound.Reuse(c, n)
		if err != nil {
			t.Fatalf("run B error: %v", err)
		}
		if !reflect.DeepEqual(a, b) {
			t.Fatal("non-deterministic reuse plan")
		}
	})
}

// The WALL holds across the whole input space, and the payoff/frontier/conservation invariants.
func TestReuse_Invariants(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		c := corpusGen().Draw(t, "corpus")
		n := nextGen().Draw(t, "next")
		plan, err := compound.Reuse(c, n)
		if err != nil {
			t.Fatalf("error: %v", err)
		}

		// THE WALL.
		if plan.WroteKernel {
			t.Fatal("WALL VIOLATION: reuse wrote kernel truth")
		}

		// CONSERVATION: every required unit routed exactly once.
		reused := plan.ReusedProcedural + plan.ReusedBehavior
		if reused+plan.DerivedFresh != len(n.Required) {
			t.Fatalf("conservation broken: reused=%d fresh=%d != required=%d", reused, plan.DerivedFresh, len(n.Required))
		}
		if len(plan.Routes) != len(n.Required) {
			t.Fatalf("routes=%d != required=%d", len(plan.Routes), len(n.Required))
		}

		// PAYOFF / FRONTIER.
		if reused > 0 && plan.EffortAfter >= plan.EffortBefore {
			t.Fatalf("reuse>0 must LOWER effort: after=%d before=%d", plan.EffortAfter, plan.EffortBefore)
		}
		if reused == 0 && plan.EffortAfter != plan.EffortBefore {
			t.Fatalf("reuse=0 must leave effort unchanged: after=%d before=%d", plan.EffortAfter, plan.EffortBefore)
		}

		// SavedTokens consistency + non-negativity.
		if plan.SavedTokens != plan.EffortBefore-plan.EffortAfter {
			t.Fatal("SavedTokens inconsistent with effort delta")
		}
		if plan.SavedTokens < 0 {
			t.Fatal("SavedTokens must never be negative (reuse never costs more)")
		}

		// Behavior reuse ⇒ ViaWall; procedural recall ⇒ below the line.
		for _, r := range plan.Routes {
			if r.Origin == compound.OriginReusedBehavior && !r.ViaWall {
				t.Fatal("behavior reuse must be ViaWall")
			}
			if r.Origin == compound.OriginReusedProcedural && r.ViaWall {
				t.Fatal("procedural recall is below the line, not a wall door")
			}
		}
	})
}

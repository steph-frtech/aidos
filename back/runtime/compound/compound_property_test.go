package compound_test

// CE03 reproducibility mirror (determinism-first, CLAUDE.md §6/§8). The /compound gesture is a
// PURE function: the SAME GoalClose ⇒ the SAME events — identical procedural write-input bodies
// and identical content-addressed behavior-candidate ids. There is no LLM, no clock, no rng in the
// capture loop; WHAT to capitalise is the declared CE02 table, not a judgment. The property also
// re-asserts the WALL across the whole input space: no generated green goal EVER writes kernel
// truth.

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/compound"
)

func unitsGen() *rapid.Generator[[]string] {
	return rapid.SliceOfN(rapid.StringMatching(`[a-z_]{3,20}`), 0, 6)
}

func goalCloseGen() *rapid.Generator[compound.GoalClose] {
	return rapid.Custom(func(t *rapid.T) compound.GoalClose {
		return compound.GoalClose{
			GoalID:         rapid.StringMatching(`goal-[a-z]{3,12}`).Draw(t, "goalID"),
			Branch:         rapid.SampledFrom([]string{"main", "feat-x", "exp-1"}).Draw(t, "branch"),
			Green:          rapid.Bool().Draw(t, "green"),
			GesturePattern: unitsGen().Draw(t, "gesture"),
			SpecPattern:    unitsGen().Draw(t, "spec"),
		}
	})
}

// Same input ⇒ same events (procedural bodies + idea ids identical across two runs).
func TestCompound_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := goalCloseGen().Draw(t, "goal")

		a, err := compound.Compound(g)
		if err != nil {
			t.Fatalf("run A error: %v", err)
		}
		b, err := compound.Compound(g)
		if err != nil {
			t.Fatalf("run B error: %v", err)
		}

		if len(a.ProceduralWrites) != len(b.ProceduralWrites) {
			t.Fatalf("non-deterministic procedural count: %d vs %d", len(a.ProceduralWrites), len(b.ProceduralWrites))
		}
		for i := range a.ProceduralWrites {
			if a.ProceduralWrites[i].Content != b.ProceduralWrites[i].Content {
				t.Fatalf("non-deterministic procedural content at %d", i)
			}
		}
		if len(a.BehaviorCandidates) != len(b.BehaviorCandidates) {
			t.Fatalf("non-deterministic candidate count: %d vs %d", len(a.BehaviorCandidates), len(b.BehaviorCandidates))
		}
		for i := range a.BehaviorCandidates {
			if a.BehaviorCandidates[i].Idea.ID != b.BehaviorCandidates[i].Idea.ID {
				t.Fatalf("non-deterministic candidate id at %d", i)
			}
		}
	})
}

// The WALL holds across the whole input space: no green goal writes kernel truth, and every
// candidate carries WroteKernel=false.
func TestCompound_NeverWritesKernel(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := goalCloseGen().Draw(t, "goal")
		out, err := compound.Compound(g)
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if out.WroteKernel() {
			t.Fatal("WALL VIOLATION: /compound wrote kernel truth")
		}
		for _, c := range out.BehaviorCandidates {
			if c.WroteKernel {
				t.Fatal("WALL VIOLATION: a candidate reported WroteKernel=true")
			}
		}
	})
}

// A non-green goal capitalises nothing (the close-gate), whatever its patterns.
func TestCompound_NonGreenIsNoOp(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := goalCloseGen().Draw(t, "goal")
		g.Green = false
		out, err := compound.Compound(g)
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if len(out.ProceduralWrites) != 0 || len(out.BehaviorCandidates) != 0 {
			t.Fatal("a non-green goal must capitalise nothing")
		}
	})
}

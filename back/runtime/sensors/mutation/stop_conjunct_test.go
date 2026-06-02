package mutation_test

// mirrors · reflects: runtime.sensors.mutation × runtime.goal.IsClosed (the wired
// Stop conjunct) · test_kind: fixture · cert_language: fixture · authority: below
//
// THE GATE OF THE STABLE PHASE (S40 done criterion #4): the `mutation ≥ seuil`
// conjunct of the non-gameable Stop (KRD §57/§8) is ALREADY wired into the Stop
// predicate at S29 (runtime/goal.IsClosed condition (3): `if Mutation <
// MutationFloor { return false }`). S40 does NOT add a new conjunct or a second
// Stop hook — it FEEDS that conjunct the live mutation score the densimètre
// computes. This fixture CONSUMES the prior goal contract READ-ONLY (importing it,
// never editing it) and proves: when the gate's score is below the declared bar,
// the Stop predicate is NOT satisfied; raising the score to the bar makes it
// satisfiable (the other conjuncts holding).
//
// (No ChangeSet on the Stop hook is required for S40 — the conjunct exists; the
// "wire it in" branch of the plan resolves to "already pinned at S29". See the
// step report's ChangeSet status.)

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/goal"
	"github.com/steph-frtech/aidos/back/runtime/sensors/mutation"
)

func TestFixture_WiredStopConjunctBlocksWhenMutationBelowFloor(t *testing.T) {
	const floor = 0.80

	// state: red-set green, prior green intact, all mirrors live, no monster —
	// every OTHER conjunct holds, so only the mutation conjunct can decide.
	g := goal.Goal{Status: goal.StatusOpen, RedSet: []string{"runtime.sensors.mutation.Gate"}}
	allOtherConjunctsHold := goal.StopInput{
		Sensors:       map[string]goal.SensorState{"runtime.sensors.mutation.Gate": goal.SensorGreen},
		PriorGreen:    goal.PriorIntact,
		MutationFloor: floor,
		Monsters:      nil,
	}

	// The densimètre measures a 0.40 score (40 killed / 100, below the 0.80 bar).
	lowReport := mutation.MutationReport{Killed: 40, Survived: 60, Total: 100}
	bar := floor
	lowGate := mutation.Gate(lowReport, &bar)
	if lowGate.Verdict != mutation.VerdictBlock {
		t.Fatalf("precondition: a 0.40 score must BLOCK at 0.80; got %q", lowGate.Verdict)
	}

	// Feed that live score into the Stop predicate: the Stop is NOT satisfied.
	belowFloor := allOtherConjunctsHold
	belowFloor.Mutation = lowGate.Score // 0.40
	if goal.IsClosed(g, belowFloor) {
		t.Fatal("the Stop must NOT be satisfied while mutation (0.40) < floor (0.80)")
	}
	if br := goal.CloseBlockReason(g, belowFloor); br == nil {
		t.Fatal("a blocked Stop must surface a BlockReason")
	}

	// Raise the score to the bar (80 killed / 100 = 0.80): the gate passes AND the
	// Stop becomes satisfiable (the other conjuncts holding).
	highReport := mutation.MutationReport{Killed: 80, Survived: 20, Total: 100}
	highGate := mutation.Gate(highReport, &bar)
	if highGate.Verdict != mutation.VerdictPass {
		t.Fatalf("precondition: a 0.80 score must PASS at 0.80; got %q", highGate.Verdict)
	}
	atFloor := allOtherConjunctsHold
	atFloor.Mutation = highGate.Score // 0.80
	if !goal.IsClosed(g, atFloor) {
		t.Fatal("raising mutation to the floor (0.80) must make the Stop satisfiable")
	}
}

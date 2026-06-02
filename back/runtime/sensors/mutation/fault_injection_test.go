package mutation_test

// FAULT-INJECTION (CLAUDE.md §5 hook-honesty, KRD §1123 "un détecteur qui ne fire
// pas est mort"): the densimètre must actually READ the hole, not just compare ≥.
//
// We feed the gremlins PARSER two REAL report shapes for the same mutant:
//   - GREEN workspace: a mirror kills the boundary mutant → status KILLED → the
//     score clears the bar → the gate PASSES.
//   - WEAKENED mirror: we break the mirror so the same boundary mutant now LIVES
//     → status LIVED → the score drops below the bar → the gate BLOCKS and the
//     surviving mutant is LISTED (file · line · operator).
//   - RESTORED: back to KILLED → the score recovers → the gate PASSES again.
//
// This proves the sensor measures tightness through the runner's own report, not
// a hard-coded number.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/sensors/mutation"
)

// gremlinsJSON builds a gremlins --output report where every mutant is KILLED
// except the boundary mutant in target.go, whose status is `boundaryStatus`.
func gremlinsJSON(boundaryStatus string) []byte {
	return []byte(`{
      "files": [
        {"filename":"back/kernel/eval.go","mutations":[
          {"mutator":"ARITHMETIC_BASE","status":"KILLED","line":3},
          {"mutator":"INVERT_NEGATIVES","status":"KILLED","line":7},
          {"mutator":"CONDITIONALS_BOUNDARY","status":"KILLED","line":9},
          {"mutator":"CONDITIONALS_BOUNDARY","status":"` + boundaryStatus + `","line":12}
        ]}
      ]
    }`)
}

func TestFaultInjection_WeakenedMirrorDropsScoreAndBlocks(t *testing.T) {
	bar := 0.80
	g := mutation.GremlinsRunner{}

	// GREEN: all four mutants killed → score 4/4 = 1.0 ≥ 0.80 → PASS.
	green, err := g.Parse(gremlinsJSON("KILLED"))
	if err != nil {
		t.Fatalf("parse green: %v", err)
	}
	if s, ok := green.Score(); !ok || s != 1.0 {
		t.Fatalf("green score must be 1.0; got %v (ok=%v)", s, ok)
	}
	if v := mutation.Gate(green, &bar).Verdict; v != mutation.VerdictPass {
		t.Fatalf("green workspace must PASS; got %q", v)
	}

	// WEAKEN one mirror: the boundary mutant now LIVES → score 3/4 = 0.75 < 0.80.
	weak, err := g.Parse(gremlinsJSON("LIVED"))
	if err != nil {
		t.Fatalf("parse weakened: %v", err)
	}
	s, ok := weak.Score()
	if !ok || s != 0.75 {
		t.Fatalf("weakened score must drop to 0.75; got %v (ok=%v)", s, ok)
	}
	weakGate := mutation.Gate(weak, &bar)
	if weakGate.Verdict != mutation.VerdictBlock {
		t.Fatalf("a weakened mirror (surviving mutant) must BLOCK; got %q", weakGate.Verdict)
	}
	// the surviving mutant must be LISTED (the hole to plug).
	if len(weakGate.SurvivingMutants) != 1 {
		t.Fatalf("the surviving mutant must be listed; got %d", len(weakGate.SurvivingMutants))
	}
	sm := weakGate.SurvivingMutants[0]
	if sm.File != "back/kernel/eval.go" || sm.Line != 12 || sm.Operator != "CONDITIONALS_BOUNDARY" {
		t.Fatalf("surviving mutant must carry file·line·operator; got %+v", sm)
	}

	// RESTORE the mirror: the mutant is killed again → score recovers → PASS.
	restored, _ := g.Parse(gremlinsJSON("KILLED"))
	if v := mutation.Gate(restored, &bar).Verdict; v != mutation.VerdictPass {
		t.Fatalf("restoring the mirror must recover PASS; got %q", v)
	}
}

func TestFaultInjection_StrykerWeakenedMirrorBlocks(t *testing.T) {
	bar := 0.80
	s := mutation.StrykerRunner{}
	strykerJSON := func(boundary string) []byte {
		return []byte(`{"files":{"front/web/lib/x.ts":{"mutants":[
          {"mutatorName":"EqualityOperator","status":"Killed","location":{"start":{"line":3}}},
          {"mutatorName":"BooleanLiteral","status":"Killed","location":{"start":{"line":5}}},
          {"mutatorName":"ConditionalExpression","status":"Killed","location":{"start":{"line":7}}},
          {"mutatorName":"ConditionalExpression","status":"` + boundary + `","location":{"start":{"line":9}}}
        ]}}}`)
	}
	green, _ := s.Parse(strykerJSON("Killed"))
	if v := mutation.Gate(green, &bar).Verdict; v != mutation.VerdictPass {
		t.Fatalf("green front must PASS; got %q", v)
	}
	weak, _ := s.Parse(strykerJSON("Survived"))
	wg := mutation.Gate(weak, &bar)
	if wg.Verdict != mutation.VerdictBlock || len(wg.SurvivingMutants) != 1 {
		t.Fatalf("weakened front mirror must BLOCK + list the survivor; got %+v", wg)
	}
}

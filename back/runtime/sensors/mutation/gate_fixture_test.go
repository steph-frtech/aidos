package mutation_test

// mirrors · reflects: runtime.sensors.mutation.Gate
// test_kind: fixture · cert_language: fixture · authority: below · liveness: live
//
// THE DONE CRITERION (S40): against the DECLARED bar 0.80 read from fitness, a
// 0.40 report BLOCKs the stable phase and an 0.80 report PASSes — "40% blocks,
// 80% passes". The threshold is an INPUT (the example bar), never a value this
// step authors (§8 anti-Goodhart, the circularity). These fixtures are means-
// tests toward the human red, not a new truth the agent grades itself against.

import (
	"context"
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/runtime/sensors/mutation"
)

func f64(v float64) *float64 { return &v }

// recorder is an in-memory RunRecorder for the fixtures (the real one writes
// runtime.mutation_runs; the fixture asserts the recorded row's shape).
type recorder struct{ runs []mutation.MutationRun }

func (r *recorder) Record(_ context.Context, run mutation.MutationRun) error {
	r.runs = append(r.runs, run)
	return nil
}

func TestFixture_ScoreBelowThresholdBlocksThePhase(t *testing.T) {
	// state (threshold from fitness): 0.80 ; report: killed 40 / total 100 → 0.40
	threshold := f64(0.80)
	report := mutation.MutationReport{
		Scope: "go", Runner: "gremlins",
		Killed: 40, Survived: 60, Total: 100, NotCovered: 0,
		SurvivingMutants: []mutation.SurvivingMutant{
			{File: "back/kernel/x.go", Line: 12, Operator: "CONDITIONALS_BOUNDARY", Gap: "no invariant on the boundary"},
		},
	}

	// command: Gate(report, threshold)
	gated := mutation.Gate(report, threshold)

	if gated.Verdict != mutation.VerdictBlock {
		t.Fatalf("40%% < 80%% must BLOCK; got verdict %q", gated.Verdict)
	}
	if gated.Score != 0.40 {
		t.Fatalf("score = killed/(total-not_covered) = 40/100 = 0.40; got %v", gated.Score)
	}
	if len(gated.SurvivingMutants) != 1 {
		t.Fatalf("the surviving mutants must be carried into the result; got %d", len(gated.SurvivingMutants))
	}

	// -> a mutation_runs row is recorded { score 0.40, threshold_used 0.80, verdict block }
	rec := &recorder{}
	start := time.Unix(1000, 0).UTC()
	row := mutation.ToRun("run-1", "phaseHashA", mutation.ScopeGo, "gremlins", report, gated, start, start.Add(time.Minute))
	if err := rec.Record(context.Background(), row); err != nil {
		t.Fatalf("record: %v", err)
	}
	got := rec.runs[0]
	if got.Score != 0.40 || got.ThresholdUsed != 0.80 || got.Verdict != mutation.VerdictBlock {
		t.Fatalf("recorded row must be {0.40, 0.80, block}; got {%v, %v, %v}", got.Score, got.ThresholdUsed, got.Verdict)
	}
	if len(got.SurvivingMutants) != 1 {
		t.Fatalf("recorded row must carry the surviving mutants; got %d", len(got.SurvivingMutants))
	}
}

func TestFixture_ScoreAtThresholdPasses(t *testing.T) {
	threshold := f64(0.80)
	report := mutation.MutationReport{
		Scope: "go", Runner: "gremlins",
		Killed: 80, Survived: 20, Total: 100, NotCovered: 0,
	}

	gated := mutation.Gate(report, threshold)

	if gated.Verdict != mutation.VerdictPass {
		t.Fatalf("80%% >= 80%% must PASS; got verdict %q", gated.Verdict)
	}
	if gated.Score != 0.80 {
		t.Fatalf("score 80/100 = 0.80; got %v", gated.Score)
	}

	rec := &recorder{}
	start := time.Unix(2000, 0).UTC()
	row := mutation.ToRun("run-2", "phaseHashB", mutation.ScopeGo, "gremlins", report, gated, start, start.Add(time.Minute))
	_ = rec.Record(context.Background(), row)
	got := rec.runs[0]
	if got.Score != 0.80 || got.ThresholdUsed != 0.80 || got.Verdict != mutation.VerdictPass {
		t.Fatalf("recorded row must be {0.80, 0.80, pass}; got {%v, %v, %v}", got.Score, got.ThresholdUsed, got.Verdict)
	}
}

func TestFixture_NoThresholdBlocksWithMissingThreshold(t *testing.T) {
	// §8 anti-Goodhart: a Gate called with NO threshold never defaults to a self-
	// chosen bar — it BLOCKs with MISSING_THRESHOLD.
	report := mutation.MutationReport{Killed: 99, Total: 100}

	gated := mutation.Gate(report, nil)

	if gated.Verdict != mutation.VerdictBlock {
		t.Fatalf("a missing threshold must BLOCK; got %q", gated.Verdict)
	}
	if gated.BlockReason == nil || gated.BlockReason.Code != mutation.CodeMissingThreshold {
		t.Fatalf("block_reason.code must be MISSING_THRESHOLD; got %+v", gated.BlockReason)
	}
	if len(gated.BlockReason.HowToFix) == 0 {
		t.Fatal("a BlockReason with no how_to_fix is a prison (KRD §44.5)")
	}
}

func TestFixture_EmptyReportBlocksRatherThanSilentPass(t *testing.T) {
	// No coverable mutant (total == not_covered): a score cannot be computed ⇒
	// BLOCK + UNPARSABLE_REPORT, never a silent 1.0 (KRD §82/§1831).
	threshold := f64(0.80)
	report := mutation.MutationReport{Total: 5, NotCovered: 5}

	gated := mutation.Gate(report, threshold)

	if gated.Verdict != mutation.VerdictBlock {
		t.Fatalf("a no-coverable-mutant report must BLOCK, never silently pass; got %q", gated.Verdict)
	}
	if gated.BlockReason == nil || gated.BlockReason.Code != mutation.CodeUnparsableReport {
		t.Fatalf("block_reason.code must be UNPARSABLE_REPORT; got %+v", gated.BlockReason)
	}
}

package mutation_test

// reflects: runtime.sensors.mutation.Gate
// test_kind: property · cert_language: rapid · authority: below · liveness: live
//
// The reproducibility mirror of the gate law (CLAUDE.md §6/§8 determinism-first):
// ∀ report, ∀ threshold the gate is deterministic, total, monotone, and never
// invents a bar or a silent 1.0.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/sensors/mutation"
	"pgregory.net/rapid"
)

// genReport draws an arbitrary, internally-consistent MutationReport.
func genReport(t *rapid.T) mutation.MutationReport {
	killed := rapid.IntRange(0, 200).Draw(t, "killed")
	survived := rapid.IntRange(0, 200).Draw(t, "survived")
	timedOut := rapid.IntRange(0, 50).Draw(t, "timed_out")
	notCovered := rapid.IntRange(0, 50).Draw(t, "not_covered")
	total := killed + survived + timedOut + notCovered
	return mutation.MutationReport{
		Scope: "go", Runner: "gremlins",
		Killed: killed, Survived: survived, TimedOut: timedOut, NotCovered: notCovered, Total: total,
	}
}

func TestProp_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		report := genReport(t)
		bar := rapid.Float64Range(0, 1).Draw(t, "bar")
		a := mutation.Gate(report, &bar)
		b := mutation.Gate(report, &bar)
		if a.Verdict != b.Verdict || a.Score != b.Score {
			t.Fatalf("Gate must be deterministic: %+v vs %+v", a, b)
		}
	})
}

func TestProp_PassIffScoreGEThreshold(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		report := genReport(t)
		bar := rapid.Float64Range(0, 1).Draw(t, "bar")
		gated := mutation.Gate(report, &bar)
		score, ok := report.Score()
		if !ok {
			// No coverable mutant ⇒ BLOCK (UNPARSABLE_REPORT), never a third verdict.
			if gated.Verdict != mutation.VerdictBlock {
				t.Fatalf("no-coverable-mutant report must BLOCK; got %q", gated.Verdict)
			}
			return
		}
		want := mutation.VerdictBlock
		if score >= bar {
			want = mutation.VerdictPass
		}
		if gated.Verdict != want {
			t.Fatalf("pass ⇔ score>=threshold: score=%v bar=%v want=%q got=%q", score, bar, want, gated.Verdict)
		}
		// no third verdict
		if gated.Verdict != mutation.VerdictPass && gated.Verdict != mutation.VerdictBlock {
			t.Fatalf("there is no third verdict; got %q", gated.Verdict)
		}
	})
}

func TestProp_MonotoneInScore(t *testing.T) {
	// Killing more mutants (moving a survivor to a kill) never turns pass → block.
	rapid.Check(t, func(t *rapid.T) {
		report := genReport(t)
		bar := rapid.Float64Range(0, 1).Draw(t, "bar")
		before := mutation.Gate(report, &bar)
		if report.Survived == 0 {
			return
		}
		// Promote one survivor to a kill: score can only rise.
		stronger := report
		stronger.Survived--
		stronger.Killed++
		after := mutation.Gate(stronger, &bar)
		if before.Verdict == mutation.VerdictPass && after.Verdict == mutation.VerdictBlock {
			t.Fatalf("monotone: killing more must never turn pass→block (before %v, after %v)", before, after)
		}
	})
}

func TestProp_ScoreInUnitInterval(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		report := genReport(t)
		score, ok := report.Score()
		if ok && (score < 0 || score > 1) {
			t.Fatalf("score must be in [0,1]; got %v", score)
		}
	})
}

func TestProp_MissingThresholdAlwaysBlocks(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		report := genReport(t)
		gated := mutation.Gate(report, nil)
		if gated.Verdict != mutation.VerdictBlock {
			t.Fatalf("a missing threshold must always BLOCK; got %q", gated.Verdict)
		}
		if gated.BlockReason == nil || gated.BlockReason.Code != mutation.CodeMissingThreshold {
			t.Fatalf("missing threshold ⇒ MISSING_THRESHOLD; got %+v", gated.BlockReason)
		}
	})
}

func TestProp_ParsersNeverPanic(t *testing.T) {
	// ∀ runner report bytes: parsing never panics; garbage ⇒ error, never an
	// assumed score.
	rapid.Check(t, func(t *rapid.T) {
		raw := rapid.SliceOfN(rapid.Byte(), 0, 64).Draw(t, "raw")
		_, _ = mutation.GremlinsRunner{}.Parse(raw) // must not panic
		_, _ = mutation.StrykerRunner{}.Parse(raw)  // must not panic
	})
}

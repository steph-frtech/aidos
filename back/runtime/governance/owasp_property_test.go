// owasp_property_test.go — GV01 reproducibility mirror. The cross-check is a DECLARED
// table; this mirror is the deterministic JUDGE that the report is total, well-formed,
// and reproducible — same table ⇒ same report (CLAUDE.md §6/§8 determinism-first). It
// also pins the two contract invariants the audit RESTS on: the matrix maps EXACTLY the
// ten OWASP risks, and the adoption verdict NEVER abandons the wall (it only augments).
//
// RED-FIRST. Written before owasp.go/adoption.go existed; the first run failed to
// compile (no governance package) — that compile-red IS the goal. Green follows the
// table being declared. There is no LLM in this mirror: a property test, never a
// "judge agent".
package governance

import (
	"testing"

	"pgregory.net/rapid"
)

// the canonical, declared count: ten OWASP Agentic risks, five AGT pillars.
const (
	wantRisks   = 10
	wantPillars = 5
)

// TestRisks_TenAndStable pins the closed risk set: exactly ten, in a stable order, no
// duplicates. The report can never silently drop or invent a risk.
func TestRisks_TenAndStable(t *testing.T) {
	rs := Risks()
	if len(rs) != wantRisks {
		t.Fatalf("want %d OWASP risks, got %d", wantRisks, len(rs))
	}
	seen := map[Risk]bool{}
	for _, r := range rs {
		if seen[r] {
			t.Fatalf("duplicate risk %q", r)
		}
		seen[r] = true
	}
	// stability: a second call returns the identical order.
	for i, r := range Risks() {
		if r != rs[i] {
			t.Fatalf("Risks() not stable at %d: %q != %q", i, r, rs[i])
		}
	}
}

// TestMatrix_TotalAndWellFormed pins that EVERY risk has a coverage row with a KNOWN
// status, a non-empty CoveredBy, and — crucially for honesty — a residual+augmenting-step
// EXACTLY when the status is not "covered" (a partial/uncovered row that hides its gap,
// or a covered row that invents one, fails). This is the anti-Goodhart check: the report
// cannot claim full coverage without naming what is missing.
func TestMatrix_TotalAndWellFormed(t *testing.T) {
	for _, r := range Risks() {
		c, ok := CoverageFor(r)
		if !ok {
			t.Fatalf("risk %q has no coverage row (monster: a risk with no audit)", r)
		}
		switch c.Status {
		case StatusCovered, StatusPartial, StatusUncovered:
		default:
			t.Fatalf("risk %q has unknown status %q", r, c.Status)
		}
		if len(c.CoveredBy) == 0 {
			t.Fatalf("risk %q has empty CoveredBy (no enforcer named)", r)
		}
		if c.Title == "" {
			t.Fatalf("risk %q has empty Title", r)
		}
		if c.Status == StatusCovered {
			if c.Residual != "" || c.AugmentedBy != "" {
				t.Fatalf("risk %q is COVERED but invents a residual/step (%q / %q)", r, c.Residual, c.AugmentedBy)
			}
		} else {
			if c.Residual == "" {
				t.Fatalf("risk %q is %q but hides its residual gap (honesty breach)", r, c.Status)
			}
			if c.AugmentedBy == "" {
				t.Fatalf("risk %q is %q but names no augmenting GV step", r, c.Status)
			}
		}
	}
}

// TestCount_MatchesMatrix pins the tally is a faithful roll-up: the three buckets sum to
// the total, and the total is the ten risks.
func TestCount_MatchesMatrix(t *testing.T) {
	tl := Count()
	if tl.Total != wantRisks {
		t.Fatalf("tally total %d != %d risks", tl.Total, wantRisks)
	}
	if tl.Covered+tl.Partial+tl.Uncovered != tl.Total {
		t.Fatalf("tally buckets %d+%d+%d != total %d", tl.Covered, tl.Partial, tl.Uncovered, tl.Total)
	}
	if len(Residuals()) != tl.Partial+tl.Uncovered {
		t.Fatalf("Residuals() count %d != partial+uncovered %d", len(Residuals()), tl.Partial+tl.Uncovered)
	}
}

// TestVerdict_NeverAbandonsTheWall pins the load-bearing audit invariant: NO AGT pillar
// is adopted as a REPLACEMENT of the structural wall. Every pillar decision is one of
// the three closed values, and the verdict's Stop is computed (never declared): Stop iff
// nothing to adopt AND no residual risk. The wall stays authoritative either way.
func TestVerdict_NeverAbandonsTheWall(t *testing.T) {
	pvs := PillarVerdicts()
	if len(pvs) != wantPillars {
		t.Fatalf("want %d AGT pillars, got %d", wantPillars, len(pvs))
	}
	adopt, covered, rejected := 0, 0, 0
	for _, p := range pvs {
		switch p.Decision {
		case DecisionAdoptAugment:
			adopt++
			if p.Step == "" {
				t.Fatalf("pillar %q adopted but names no GV step", p.Pillar)
			}
		case DecisionAlreadyCovered:
			covered++
		case DecisionReject:
			rejected++
		default:
			t.Fatalf("pillar %q has unknown decision %q", p.Pillar, p.Decision)
		}
		if p.Rationale == "" {
			t.Fatalf("pillar %q has empty rationale", p.Pillar)
		}
	}
	v := Verdict()
	if v.ToAdopt != adopt || v.AlreadyCovered != covered || v.Rejected != rejected {
		t.Fatalf("verdict tallies (%d/%d/%d) disagree with table (%d/%d/%d)",
			v.ToAdopt, v.AlreadyCovered, v.Rejected, adopt, covered, rejected)
	}
	wantStop := v.ToAdopt == 0 && v.ResidualRisks == 0
	if v.Stop != wantStop {
		t.Fatalf("Stop=%v but ToAdopt=%d ResidualRisks=%d", v.Stop, v.ToAdopt, v.ResidualRisks)
	}
	// the real audit finding: there IS a residual, so the GV roadmap is justified (not a stop).
	if v.Stop {
		t.Fatalf("verdict says STOP, but the cross-check found AAI09/AAI10 residual gaps — the roadmap GV03..GV06 is justified")
	}
}

// TestReport_Reproducible is the determinism-first reproducibility mirror: the report is
// a pure derivation of a declared table, so calling it twice yields the IDENTICAL
// coverages, tally and verdict — no clock, no rng, no I/O could make it drift. rapid
// drives many independent reads to assert byte-stable output.
func TestReport_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		_ = rapid.IntRange(0, 8).Draw(t, "n") // arbitrary draw to vary the run; output must not change
		a, b := Coverages(), Coverages()
		if len(a) != len(b) {
			t.Fatalf("coverage length drift %d != %d", len(a), len(b))
		}
		for i := range a {
			if a[i].Risk != b[i].Risk || a[i].Status != b[i].Status || a[i].AugmentedBy != b[i].AugmentedBy {
				t.Fatalf("coverage row %d drifted between calls", i)
			}
		}
		if Count() != Count() {
			t.Fatalf("tally drifted between calls")
		}
		if Verdict() != Verdict() {
			t.Fatalf("verdict drifted between calls")
		}
	})
}

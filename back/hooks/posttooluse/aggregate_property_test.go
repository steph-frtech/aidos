package main

import (
	"sort"
	"testing"

	"pgregory.net/rapid"
)

// Reproducibility / invariant mirror (rapid, N1) for the sensor verdict aggregator.
// reflects=runtime.sensors, test_kind=invariant, cert_language=rapid, liveness=live,
// authority=below.
//
// The single invariant of on_fail:block (CLAUDE.md §6/§8, KRD §74/§82): for ANY
// set of sensor results, Aggregate(results) ⇒ block IFF at least one check failed,
// else allow. There is no third verdict. block ⇒ the BlockReason code is always
// SENSOR_FAILED and the recorded failing[] is EXACTLY the failing subset (no silent
// drop). An errored/unknown check (Errored=true) is itself a FAILURE, never ignored
// (KRD §82 .passthrough() anti-pattern).
//
// Determinism-first: Aggregate is a pure total function of its results slice — no
// clock, no rng, no I/O — so the same results always yield the same decision.

// genResults builds a slice of CheckResults over the canonical sensor names, each
// independently pass / fail / errored, so the generator covers every subset.
func genResults(rt *rapid.T) []CheckResult {
	names := []string{"gofmt", "vet", "lint", "archtest", "affected"}
	n := rapid.IntRange(0, len(names)).Draw(rt, "n")
	out := make([]CheckResult, 0, n)
	for i := 0; i < n; i++ {
		// 0 = pass, 1 = fail, 2 = errored (errored is a failure made explicit).
		state := rapid.IntRange(0, 2).Draw(rt, "state")
		out = append(out, CheckResult{
			Name:    names[i],
			Pass:    state == 0,
			Errored: state == 2,
		})
	}
	return out
}

// failedNames is the expected failing subset: a result is failing iff !Pass (an
// errored result must have Pass=false, so it is counted as failing).
func failedNames(results []CheckResult) []string {
	var f []string
	for _, r := range results {
		if !r.Pass {
			f = append(f, r.Name)
		}
	}
	sort.Strings(f)
	return f
}

func TestAggregateDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		results := genResults(rt)
		a := Aggregate(results)
		b := Aggregate(results)
		if a.Verdict != b.Verdict {
			rt.Fatalf("Aggregate not deterministic: %q != %q", a.Verdict, b.Verdict)
		}
	})
}

func TestAggregateBlockIffAnyFailed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		results := genResults(rt)
		want := failedNames(results)
		d := Aggregate(results)

		// No third verdict.
		if d.Verdict != VerdictBlock && d.Verdict != VerdictAllow {
			rt.Fatalf("third verdict %q", d.Verdict)
		}

		anyFailed := len(want) > 0
		if anyFailed && d.Verdict != VerdictBlock {
			rt.Fatalf("had failures %v but verdict %q (want block)", want, d.Verdict)
		}
		if !anyFailed && d.Verdict != VerdictAllow {
			rt.Fatalf("no failures but verdict %q (want allow)", d.Verdict)
		}

		if d.Verdict == VerdictBlock {
			if d.BlockReason == nil {
				rt.Fatalf("block without a BlockReason")
			}
			if d.BlockReason.Code != CodeSensorFailed {
				rt.Fatalf("block code %q != %q", d.BlockReason.Code, CodeSensorFailed)
			}
			if len(d.BlockReason.HowToFix) == 0 {
				rt.Fatalf("block with empty how_to_fix")
			}
			// failing[] is EXACTLY the failing subset (sorted, no drop, no extra).
			got := append([]string(nil), d.Failing...)
			sort.Strings(got)
			if len(got) != len(want) {
				rt.Fatalf("failing %v != want %v", got, want)
			}
			for i := range want {
				if got[i] != want[i] {
					rt.Fatalf("failing %v != want %v", got, want)
				}
			}
		}

		// allow ⇒ no BlockReason, no failing.
		if d.Verdict == VerdictAllow {
			if d.BlockReason != nil {
				rt.Fatalf("allow carried a BlockReason")
			}
			if len(d.Failing) != 0 {
				rt.Fatalf("allow carried failing %v", d.Failing)
			}
		}
	})
}

// An errored check is a failure made explicit — never silently dropped.
func TestErroredCheckIsAFailure(t *testing.T) {
	results := []CheckResult{
		{Name: "gofmt", Pass: true},
		{Name: "lint", Pass: false, Errored: true, Output: "linter crashed"},
	}
	d := Aggregate(results)
	if d.Verdict != VerdictBlock {
		t.Fatalf("errored check should block, got %q", d.Verdict)
	}
	if len(d.Failing) != 1 || d.Failing[0] != "lint" {
		t.Fatalf("errored check must appear in failing[], got %v", d.Failing)
	}
}

// The empty result set (nothing to check) allows — vacuously clean.
func TestAggregateEmptyAllows(t *testing.T) {
	d := Aggregate(nil)
	if d.Verdict != VerdictAllow {
		t.Fatalf("empty results should allow, got %q", d.Verdict)
	}
}

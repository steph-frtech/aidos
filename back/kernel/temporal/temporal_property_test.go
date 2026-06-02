package temporal_test

// Property mirror (∀) for the TemporalInvariant (KRD §49.3). reflects=kernel.truth
// (temporal) · test_kind=property · cert_language=rapid · liveness=live · authority=below
// (the invariants are computational properties of the pure Evaluate / Validate; the §49.3
// RULE itself is the human's, above the line, pinned by the statechart fixture). Run via
// `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are KRD §49.3:
//
//  1. Evaluate TOTAL + DETERMINISTIC. For any invariant + any observation, Evaluate never
//     panics and the same input always yields the same verdict (held | violated) — the
//     reproducibility mirror (same input ⇒ same output). Evaluate reads NO wall clock:
//     calling it twice with the same (invariant, observation) yields the identical verdict.
//  2. TOLERANCE BAND APPLIED EXACTLY ONCE, ONE-SIDED. For a correctly-ordered observation
//     (antecedent before consequent, both present), elapsed ≤ bound + tolerance ⇒ held;
//     elapsed > bound + tolerance ⇒ violated. The band is never silently widened.
//  3. CLOCK-REQUIRED RULE on Validate. Validate ERRORS for a temporal truth with no/zero
//     clock (the §49.3 load-bearing rule), an out-of-enum clock, an unparseable/negative
//     tolerance or bound, an empty property/antecedent/consequent, an unknown relation, or
//     a mirror outside {statechart, tla+, uppaal}.

import (
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/kernel/temporal"
	"pgregory.net/rapid"
)

func baseInvariant() temporal.TemporalInvariant {
	return temporal.TemporalInvariant{
		Property:   "payment_captured implies order_confirmed within 5 minutes",
		Antecedent: "payment_captured",
		Consequent: "order_confirmed",
		Relation:   temporal.RelationWithin,
		Bound:      "5m",
		Clock:      temporal.ClockSystem,
		Tolerance:  "10s",
		Mirror:     temporal.MirrorStatechart,
	}
}

// drawObservation draws a random in-order observation (antecedent before consequent) with
// an elapsed time spanning well inside and well outside the band.
func drawObservation(rt *rapid.T) temporal.Observation {
	// elapsed in [0, 10m] — straddles the 5m bound + 10s tolerance.
	ms := rapid.Int64Range(0, int64(10*time.Minute/time.Millisecond)).Draw(rt, "elapsed_ms")
	return temporal.Observation{
		EventOrder: []temporal.EventName{"payment_captured", "order_confirmed"},
		Elapsed:    time.Duration(ms) * time.Millisecond,
	}
}

// TestProp_EvaluateTotalDeterministic — Evaluate never panics and is deterministic (the
// reproducibility mirror: same (invariant, observation) ⇒ same verdict, no wall clock).
func TestProp_EvaluateTotalDeterministic(t *testing.T) {
	inv := baseInvariant()
	rapid.Check(t, func(rt *rapid.T) {
		obs := drawObservation(rt)
		out1 := temporal.Evaluate(inv, obs)
		out2 := temporal.Evaluate(inv, obs)
		if out1.Verdict != out2.Verdict {
			rt.Fatalf("Evaluate not deterministic: %q vs %q on %v", out1.Verdict, out2.Verdict, obs)
		}
		if out1.Verdict != temporal.VerdictHeld && out1.Verdict != temporal.VerdictViolated {
			rt.Fatalf("Evaluate not total: %q on %v", out1.Verdict, obs)
		}
	})
}

// TestProp_ToleranceBandAppliedExactlyOnce — for an in-order observation, held IFF
// elapsed ≤ bound + tolerance; violated otherwise. The band is applied exactly once,
// one-sided (a deadline is violated only by being late).
func TestProp_ToleranceBandAppliedExactlyOnce(t *testing.T) {
	inv := baseInvariant()
	bound := 5 * time.Minute
	tol := 10 * time.Second
	rapid.Check(t, func(rt *rapid.T) {
		obs := drawObservation(rt)
		out := temporal.Evaluate(inv, obs)

		wantHeld := obs.Elapsed <= bound+tol
		if wantHeld && out.Verdict != temporal.VerdictHeld {
			rt.Fatalf("elapsed %v ≤ bound+tol (%v) must be held, got %q", obs.Elapsed, bound+tol, out.Verdict)
		}
		if !wantHeld {
			if out.Verdict != temporal.VerdictViolated {
				rt.Fatalf("elapsed %v > bound+tol (%v) must be violated, got %q", obs.Elapsed, bound+tol, out.Verdict)
			}
			if out.BlockReason == nil || out.BlockReason.Code != temporal.CodeTemporalInvariantViolated {
				rt.Fatalf("a violated verdict must carry TEMPORAL_INVARIANT_VIOLATED, got %+v", out.BlockReason)
			}
		}
	})
}

// TestProp_ExactBoundHeld — elapsed EXACTLY on the bound (and exactly on bound+tolerance)
// is held (the band is inclusive). Pinned explicitly so the boundary never drifts.
func TestProp_ExactBoundHeld(t *testing.T) {
	inv := baseInvariant()
	for _, elapsed := range []time.Duration{5 * time.Minute, 5*time.Minute + 10*time.Second} {
		obs := temporal.Observation{
			EventOrder: []temporal.EventName{"payment_captured", "order_confirmed"},
			Elapsed:    elapsed,
		}
		out := temporal.Evaluate(inv, obs)
		if out.Verdict != temporal.VerdictHeld {
			t.Fatalf("elapsed %v (on the inclusive band edge) must be held, got %q", elapsed, out.Verdict)
		}
	}
	// One nanosecond past the band is violated.
	obs := temporal.Observation{
		EventOrder: []temporal.EventName{"payment_captured", "order_confirmed"},
		Elapsed:    5*time.Minute + 10*time.Second + time.Nanosecond,
	}
	if out := temporal.Evaluate(inv, obs); out.Verdict != temporal.VerdictViolated {
		t.Fatalf("one ns past the band must be violated, got %q", out.Verdict)
	}
}

// TestProp_ValidateGuards — Validate enforces the §49.3 clock-required rule and the enum /
// duration guards; the valid clocks and mirror forms are accepted.
func TestProp_ValidateGuards(t *testing.T) {
	// the canonical invariant validates.
	if err := temporal.Validate(baseInvariant()); err != nil {
		t.Fatalf("the canonical invariant must validate, got %v", err)
	}
	// missing clock rejected (the load-bearing §49.3 rule).
	inv := baseInvariant()
	inv.Clock = ""
	if temporal.Validate(inv) == nil {
		t.Fatalf("a missing clock must be rejected (KRD §49.3)")
	}
	// out-of-enum clock rejected.
	inv = baseInvariant()
	inv.Clock = temporal.Clock("ntp")
	if temporal.Validate(inv) == nil {
		t.Fatalf("an out-of-enum clock must be rejected")
	}
	// empty property rejected.
	inv = baseInvariant()
	inv.Property = ""
	if temporal.Validate(inv) == nil {
		t.Fatalf("an empty property must be rejected")
	}
	// unparseable tolerance rejected.
	inv = baseInvariant()
	inv.Tolerance = "soon"
	if temporal.Validate(inv) == nil {
		t.Fatalf("an unparseable tolerance must be rejected")
	}
	// negative tolerance rejected.
	inv = baseInvariant()
	inv.Tolerance = "-5s"
	if temporal.Validate(inv) == nil {
		t.Fatalf("a negative tolerance must be rejected")
	}
	// unparseable bound rejected.
	inv = baseInvariant()
	inv.Bound = "later"
	if temporal.Validate(inv) == nil {
		t.Fatalf("an unparseable bound must be rejected")
	}
	// mirror outside {statechart, tla+, uppaal} rejected.
	inv = baseInvariant()
	inv.Mirror = temporal.MirrorForm("graphviz")
	if temporal.Validate(inv) == nil {
		t.Fatalf("a mirror outside the §49.3 three-set must be rejected")
	}
	// unknown relation rejected.
	inv = baseInvariant()
	inv.Relation = temporal.Relation("eventually")
	if temporal.Validate(inv) == nil {
		t.Fatalf("an unrecognised relation must be rejected (this step lands `within` only)")
	}
	// a logical clock with a wall-clock tolerance is a contradiction.
	inv = baseInvariant()
	inv.Clock = temporal.ClockLogical
	inv.Tolerance = "10s"
	if temporal.Validate(inv) == nil {
		t.Fatalf("a logical clock with a wall-clock tolerance must be rejected (OQ-S50-logical-tolerance)")
	}
	// the three valid clocks (with a zero tolerance for logical) and the three mirror forms accepted.
	for _, c := range temporal.Clocks() {
		inv = baseInvariant()
		inv.Clock = c
		if c == temporal.ClockLogical {
			inv.Tolerance = "0s" // a logical clock counts steps; a zero wall tolerance is consistent.
		}
		if err := temporal.Validate(inv); err != nil {
			t.Fatalf("clock %q must be accepted, got %v", c, err)
		}
	}
	for _, m := range temporal.MirrorForms() {
		inv = baseInvariant()
		inv.Mirror = m
		if err := temporal.Validate(inv); err != nil {
			t.Fatalf("mirror form %q must be accepted, got %v", m, err)
		}
	}
}

package temporal_test

// TemporalInvariant statechart fixture (state {invariant, observation} → verdict),
// interpreted in Go. reflects=kernel.truth "checkout-confirm-within-5m" ·
// test_kind=fixture · cert_language=statechart · liveness=live · authority=above (the
// time-dependent invariant RULE — "payment_captured implies order_confirmed within 5
// minutes", and "toute vérité temporelle doit déclarer son horloge" — is the human's,
// KRD §49.3).
//
// Materialized source: tests/kernel/checkout-confirm-within-5m_temporal_invariant.fixture.md
// (the human-readable fixture, conceptually stored in the `mirrors` schema; persisted to
// Postgres at the mirror-store step — bootstrap exception). It is the LIEN PORTEUR: this
// test loads the checkout-confirm-within-5m invariant + the four rows; if the fixture
// intention disappears the test breaks (no silent rot into a monster).
//
// The invariant is the KRD §49.3 canonical example, VERBATIM — the agent invents no clock,
// mirror form, tolerance semantics, or property branch beyond the frozen §49.3 vocabulary.

import (
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/kernel/temporal"
)

// checkoutConfirmWithin5m is the KRD §49.3 temporal invariant, verbatim: the property,
// the system clock, the 10s tolerance, the statechart mirror form.
func checkoutConfirmWithin5m() temporal.TemporalInvariant {
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

// TestTemporalInvariantValidates — the verbatim §49.3 invariant is well-formed.
func TestTemporalInvariantValidates(t *testing.T) {
	if err := temporal.Validate(checkoutConfirmWithin5m()); err != nil {
		t.Fatalf("the §49.3 checkout-confirm-within-5m invariant must validate, got %v", err)
	}
}

// TestEvaluate_InsideBoundHeld — a confirmation comfortably inside the bound ⇒ held.
func TestEvaluate_InsideBoundHeld(t *testing.T) {
	obs := temporal.Observation{
		EventOrder: []temporal.EventName{"payment_captured", "order_confirmed"},
		Elapsed:    4*time.Minute + 58*time.Second,
	}
	out := temporal.Evaluate(checkoutConfirmWithin5m(), obs)
	if out.Verdict != temporal.VerdictHeld {
		t.Fatalf("4m58s must be held (inside the 5m bound), got %q (%+v)", out.Verdict, out.BlockReason)
	}
}

// TestEvaluate_InsideToleranceHeldNotAFlake — 5m04s is OVER the 5m bound but INSIDE the
// 10s tolerance (5m + 4s ≤ 5m + 10s) ⇒ held. THE no-flake case: the declared tolerance
// keeps a slightly-late confirmation green instead of flaking the proof.
func TestEvaluate_InsideToleranceHeldNotAFlake(t *testing.T) {
	obs := temporal.Observation{
		EventOrder: []temporal.EventName{"payment_captured", "order_confirmed"},
		Elapsed:    5*time.Minute + 4*time.Second,
	}
	out := temporal.Evaluate(checkoutConfirmWithin5m(), obs)
	if out.Verdict != temporal.VerdictHeld {
		t.Fatalf("5m04s must be held (inside tolerance 5m+10s — NOT a flake), got %q (%+v)", out.Verdict, out.BlockReason)
	}
}

// TestEvaluate_OverToleranceViolated — THE done case. 5m20s is OUTSIDE the bound + tolerance
// (5m + 20s > 5m + 10s) ⇒ violated / TEMPORAL_INVARIANT_VIOLATED, how_to_fix names
// confirming within the deadline or compensating. The property reddens on a real violation.
func TestEvaluate_OverToleranceViolated(t *testing.T) {
	obs := temporal.Observation{
		EventOrder: []temporal.EventName{"payment_captured", "order_confirmed"},
		Elapsed:    5*time.Minute + 20*time.Second,
	}
	out := temporal.Evaluate(checkoutConfirmWithin5m(), obs)

	if out.Verdict != temporal.VerdictViolated {
		t.Fatalf("5m20s must be violated (outside tolerance 5m+10s), got %q", out.Verdict)
	}
	if out.BlockReason == nil {
		t.Fatalf("a violated verdict must carry a BlockReason")
	}
	if out.BlockReason.Code != temporal.CodeTemporalInvariantViolated {
		t.Fatalf("block_reason.code must be TEMPORAL_INVARIANT_VIOLATED, got %q", out.BlockReason.Code)
	}
	found := false
	for _, f := range out.BlockReason.HowToFix {
		if containsToken(f, "confirm_within_5m_or_compensate") {
			found = true
		}
	}
	if !found {
		t.Fatalf("how_to_fix must contain confirm_within_5m_or_compensate, got %v", out.BlockReason.HowToFix)
	}
}

// TestEvaluate_OutOfOrderViolated — confirmation BEFORE capture violates the implication
// regardless of elapsed (§49.3 "ordre des événements") ⇒ violated.
func TestEvaluate_OutOfOrderViolated(t *testing.T) {
	obs := temporal.Observation{
		EventOrder: []temporal.EventName{"order_confirmed", "payment_captured"},
		Elapsed:    1 * time.Minute,
	}
	out := temporal.Evaluate(checkoutConfirmWithin5m(), obs)
	if out.Verdict != temporal.VerdictViolated {
		t.Fatalf("order_confirmed before payment_captured must be violated, got %q", out.Verdict)
	}
	if out.BlockReason == nil || out.BlockReason.Code != temporal.CodeTemporalInvariantViolated {
		t.Fatalf("an out-of-order verdict must carry TEMPORAL_INVARIANT_VIOLATED, got %+v", out.BlockReason)
	}
}

// TestValidate_MissingClockRejected — the LOAD-BEARING §49.3 rule: a temporal truth with
// NO declared clock is rejected ("toute vérité temporelle doit déclarer son horloge").
func TestValidate_MissingClockRejected(t *testing.T) {
	inv := checkoutConfirmWithin5m()
	inv.Clock = ""
	if err := temporal.Validate(inv); err == nil {
		t.Fatalf("a temporal invariant with no clock must be rejected (KRD §49.3)")
	}
}

// containsToken reports whether s starts with token (the how_to_fix tokens are prefixed
// "token : explanation").
func containsToken(s, token string) bool {
	return len(s) >= len(token) && s[:len(token)] == token
}

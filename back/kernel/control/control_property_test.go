package control_test

// Property mirror (∀) for the control-spec. reflects=kernel.control, test_kind=property,
// cert_language=rapid, liveness=live, authority=below (a means-test over EvalState /
// Validate, not a new truth — CLAUDE.md §8). Run via `go test` (rapid is the frozen
// invariant slot, ADR 0003).
//
// Two invariants the human red pins (KRD §24.1 + the S11 spec):
//   1. EvalState is DETERMINISTIC — same (control, given) ⇒ same {visible, enabled},
//      and it never panics (a dangling ref / type mismatch is a typed error, never a
//      crash, inherited from the Expr interpreter's no-panic guarantee).
//   2. NO ORPHAN TRIGGER — a control whose `triggers` does not resolve to a known
//      action ref ⇒ Validate returns a non-empty error (no orphan trigger = no
//      monster, the completeness law).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/control"
	"pgregory.net/rapid"
)

// TestEvalStateDeterministic — ∀ given, two evaluations of the same control over the
// same given yield the same {visible, enabled}; EvalState never panics.
func TestEvalStateDeterministic(t *testing.T) {
	c := control.CheckoutButton()
	rapid.Check(t, func(rt *rapid.T) {
		given := drawGiven(rt)
		a, errA := control.EvalState(c, given)
		b, errB := control.EvalState(c, given)
		if (errA == nil) != (errB == nil) {
			rt.Fatalf("error-ness diverged: %v vs %v (given %v)", errA, errB, given)
		}
		if errA != nil {
			return // a typed error is fine; both must agree, which they do here
		}
		if a.Visible != b.Visible || a.Enabled != b.Enabled {
			rt.Fatalf("non-deterministic: %+v vs %+v (given %v)", a, b, given)
		}
		// enabled ⇒ visible: enabled_when is consulted only when visible_when holds,
		// so an enabled-but-hidden button can never be produced.
		if a.Enabled && !a.Visible {
			rt.Fatalf("enabled but not visible (given %v)", given)
		}
	})
}

// drawGiven builds a varied $-rooted situation: a cart with 0..n items, an optional
// form.valid, an optional submitting flag.
func drawGiven(rt *rapid.T) map[string]any {
	n := rapid.IntRange(0, 5).Draw(rt, "items")
	items := make([]any, n)
	for i := range items {
		items[i] = map[string]any{"id": rapid.StringN(1, 4, 4).Draw(rt, "id")}
	}
	given := map[string]any{"cart": map[string]any{"items": items}}
	if rapid.Bool().Draw(rt, "hasForm") {
		given["form"] = map[string]any{"valid": rapid.Bool().Draw(rt, "valid")}
	}
	if rapid.Bool().Draw(rt, "hasSubmitting") {
		given["submitting"] = rapid.Bool().Draw(rt, "submitting")
	}
	return given
}

// TestOrphanTriggerRejected — ∀ a control whose triggers names an action NOT in the
// known set, Validate returns a non-empty error (no orphan trigger = no monster).
func TestOrphanTriggerRejected(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		trigger := rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "trigger")
		known := rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "known")
		c := control.CheckoutButton()
		c.Triggers = trigger
		err := control.Validate(c, control.KnownActions(known))
		if trigger == known {
			if err != nil {
				rt.Fatalf("triggers resolves (%q==%q) but Validate errored: %v", trigger, known, err)
			}
			return
		}
		// trigger != known ⇒ orphan ⇒ must error.
		if err == nil {
			rt.Fatalf("orphan triggers %q (known=%q) but Validate returned nil", trigger, known)
		}
	})
}

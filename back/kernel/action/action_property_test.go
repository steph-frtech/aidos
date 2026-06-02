package action_test

// Property mirror (∀) for the action-spec. reflects=kernel.action, test_kind=property,
// cert_language=rapid, liveness=live, authority=below (a means-test over Validate / Plan,
// not a new truth — CLAUDE.md §8).
//
// Invariant the human red pins: NO ORPHAN BIND — an action whose `binds` (invoke)
// operation ref does not resolve to a known operation, OR whose `on` control ref does
// not resolve to a known control, ⇒ Validate returns a non-empty error (no orphan
// bind = no monster, the completeness law). Plan is deterministic.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"pgregory.net/rapid"
)

// TestOrphanBindRejected — ∀ an action whose invoke names an operation NOT in the
// known set, Validate errors (the control ref held resolved).
func TestOrphanBindRejected(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		invoke := rapid.StringMatching(`[a-zA-Z]{1,8}`).Draw(rt, "invoke")
		knownOp := rapid.StringMatching(`[a-zA-Z]{1,8}`).Draw(rt, "knownOp")
		a := action.CheckoutSubmit()
		a.Invoke = invoke
		err := action.Validate(a,
			action.KnownControls(a.On.Control), // control ref always resolves here
			action.KnownOperations(knownOp),
		)
		if invoke == knownOp {
			if err != nil {
				rt.Fatalf("invoke resolves (%q==%q) but Validate errored: %v", invoke, knownOp, err)
			}
			return
		}
		if err == nil {
			rt.Fatalf("orphan invoke %q (knownOp=%q) but Validate returned nil", invoke, knownOp)
		}
	})
}

// TestOrphanOnControlRejected — ∀ an action whose `on` control ref is NOT a known
// control, Validate errors (the invoke ref held resolved).
func TestOrphanOnControlRejected(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		onCtrl := rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "onCtrl")
		knownCtrl := rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "knownCtrl")
		a := action.CheckoutSubmit()
		a.On.Control = onCtrl
		err := action.Validate(a,
			action.KnownControls(knownCtrl),
			action.KnownOperations(a.Invoke), // invoke always resolves here
		)
		if onCtrl == knownCtrl {
			if err != nil {
				rt.Fatalf("on control resolves (%q==%q) but Validate errored: %v", onCtrl, knownCtrl, err)
			}
			return
		}
		if err == nil {
			rt.Fatalf("orphan on-control %q (known=%q) but Validate returned nil", onCtrl, knownCtrl)
		}
	})
}

// TestPlanDeterministic — ∀ the canonical click event, two Plan calls agree.
func TestPlanDeterministic(t *testing.T) {
	a := action.CheckoutSubmit()
	rapid.Check(t, func(rt *rapid.T) {
		// vary nothing material — Plan is a pure resolution of a fixed action; this
		// pins that repeated resolution is stable (no map-iteration nondeterminism).
		p1, e1 := action.Plan(a, action.Click("checkout-button"))
		p2, e2 := action.Plan(a, action.Click("checkout-button"))
		if (e1 == nil) != (e2 == nil) {
			rt.Fatalf("error-ness diverged: %v vs %v", e1, e2)
		}
		if e1 != nil {
			return
		}
		if p1.Invoke != p2.Invoke || len(p1.OnSuccess) != len(p2.OnSuccess) || len(p1.OnError) != len(p2.OnError) {
			rt.Fatalf("non-deterministic plan: %+v vs %+v", p1, p2)
		}
	})
}

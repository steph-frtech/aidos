// emittedtarget_property_test.go — EL00 reproducibility mirror (determinism-first, CLAUDE.md
// §6/§8). The declared EL00 target is a PURE value: EmittedTargetEL00() takes no input and
// must return the SAME record on every call (no clock/rng/IO, no module-level mutable state).
// This is the "same input → same output" property the determinism mandate requires for every
// deterministic-able capability — here the engraving of the emitted-app target.
package agentloop

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// TestEmittedTargetEL00_Reproducible — N independent calls return byte-equal records.
func TestEmittedTargetEL00_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Draw a call-count to vary the schedule; the value must never depend on it.
		n := rapid.IntRange(1, 8).Draw(t, "calls")
		first := EmittedTargetEL00()
		for i := 0; i < n; i++ {
			got := EmittedTargetEL00()
			if !reflect.DeepEqual(got, first) {
				t.Fatalf("EmittedTargetEL00 not reproducible at call %d:\n  %#v\n!=\n  %#v", i, got, first)
			}
		}
	})
}

// TestEmittedTargetEL00_TracksFN04Invariants — the target's FN02 invariant list always equals
// EmittedInvariantCodes() (the FN04 source). If FN04 ever changes the set, EL00's declared
// target tracks it deterministically — there is one list, never two (anti-fork).
func TestEmittedTargetEL00_TracksFN04Invariants(t *testing.T) {
	declared := EmittedInvariantCodes()
	got := EmittedTargetEL00().FunctionalInvariants
	if len(got) != len(declared) {
		t.Fatalf("target invariants len %d != FN04 %d", len(got), len(declared))
	}
	for i := range declared {
		if got[i] != string(declared[i]) {
			t.Fatalf("invariant %d: %q != %q", i, got[i], declared[i])
		}
	}
}

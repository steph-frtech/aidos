package truthlevel_test

// Property mirror (∀) for FK01 — the truth-level transition + parity.
// reflects=kernel.truthlevel, test_kind=property, cert_language=rapid, liveness=live,
// authority=below (a means-test over Compute/CheckParity, not a new truth — CLAUDE.md §8).
// Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are the human red of KRD FKE-5, NOT invented to be satisfied:
//
//  1. TOTAL & DETERMINISTIC (the reproducibility mirror, CLAUDE.md §6/§8). For EVERY
//     Signals value — including arbitrary bit-patterns — Compute returns one of the
//     eight levels, never panics, and same input ⇒ same output (a pure function).
//  2. PARITY (FKE-5: stored_level == computed_level). CheckParity is GREEN iff the
//     stored level equals Compute(signals); any other stored level is RED with a
//     non-nil ErrParityDivergence — a cache proven by the computation.
//  3. MONOTONE LADDER. Compute reads the TOPMOST satisfied door: raising a higher door
//     can only keep or raise the rung, never lower it (the ladder never inverts).
//  4. FLOOR. The all-false zero value maps to LevelUnknown (nothing happened yet); a
//     lone raw signal maps to exactly LevelRaw.

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/truthlevel"
	"pgregory.net/rapid"
)

// drawSignals draws an arbitrary Signals value (every door independently boolean), so
// the property covers over-filled and partially-filled signals, not only the monotone
// "honoured" ones.
func drawSignals(rt *rapid.T) truthlevel.Signals {
	b := func(label string) bool { return rapid.Bool().Draw(rt, label) }
	return truthlevel.Signals{
		HasRawSignal:   b("raw"),
		HasIdea:        b("idea"),
		HasProposal:    b("proposal"),
		IsAccepted:     b("accepted"),
		HasProjection:  b("projection"),
		HasObservation: b("observation"),
		IsReconciled:   b("reconciled"),
	}
}

// TestCompute_TotalDeterministic — invariant 1: Compute is total (never panics, always a
// real-or-unknown level) and deterministic (same input ⇒ same output).
func TestCompute_TotalDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := drawSignals(rt)
		got := truthlevel.Compute(s)
		// Determinism: a second call yields byte-identical output.
		if again := truthlevel.Compute(s); again != got {
			rt.Fatalf("Compute not deterministic: %s then %s for %+v", got, again, s)
		}
		// Total: the result is one of the eight enum values (Unknown..Reconciled).
		if got < truthlevel.LevelUnknown || got > truthlevel.LevelReconciled {
			rt.Fatalf("Compute returned out-of-enum level %d for %+v", int(got), s)
		}
		// Any non-Unknown result is a real level.
		if got != truthlevel.LevelUnknown && !got.IsReal() {
			rt.Fatalf("Compute returned non-real level %s for %+v", got, s)
		}
	})
}

// TestParity — invariant 2: CheckParity is GREEN exactly at the computed level and RED
// at every other stored level (the divergence is the red of the parity mirror).
func TestParity(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := drawSignals(rt)
		computed := truthlevel.Compute(s)

		// Stored == computed ⇒ aligned, no error.
		res, err := truthlevel.CheckParity(computed, s)
		if err != nil {
			rt.Fatalf("CheckParity(computed,…) errored: %v", err)
		}
		if !res.Aligned || res.Stored != computed || res.Computed != computed {
			rt.Fatalf("parity not aligned at computed level: %+v", res)
		}

		// Any OTHER stored level ⇒ divergence (RED).
		other := truthlevel.Level(rapid.IntRange(0, 7).Draw(rt, "storedLevel"))
		res2, err2 := truthlevel.CheckParity(other, s)
		if other == computed {
			if err2 != nil || !res2.Aligned {
				rt.Fatalf("equal stored level must align: %v %+v", err2, res2)
			}
		} else {
			if err2 == nil || !errors.Is(err2, truthlevel.ErrParityDivergence) {
				rt.Fatalf("divergent stored level %s vs computed %s must be RED, got err=%v", other, computed, err2)
			}
			if res2.Aligned {
				rt.Fatalf("divergent parity reported aligned: %+v", res2)
			}
		}
	})
}

// TestMonotoneLadder — invariant 3: raising a higher door never lowers the rung.
func TestMonotoneLadder(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := drawSignals(rt)
		base := truthlevel.Compute(s)
		// Raise the single highest door: the rung can only stay or rise.
		raised := s
		raised.IsReconciled = true
		if truthlevel.Compute(raised) < base {
			rt.Fatalf("raising reconciled lowered the rung: %s -> %s", base, truthlevel.Compute(raised))
		}
	})
}

// TestFloor — invariant 4: the zero value is Unknown; a lone raw signal is exactly Raw.
func TestFloor(t *testing.T) {
	if got := truthlevel.Compute(truthlevel.Signals{}); got != truthlevel.LevelUnknown {
		t.Fatalf("empty signals = %s, want unknown", got)
	}
	if got := truthlevel.Compute(truthlevel.Signals{HasRawSignal: true}); got != truthlevel.LevelRaw {
		t.Fatalf("lone raw signal = %s, want raw", got)
	}
}

package truthtyping_test

// Property mirror (∀) for the truth-typing classifier. reflects=kernel.truthtyping,
// test_kind=property, cert_language=rapid, liveness=live, authority=below (a
// means-test over Classify, not a new truth — CLAUDE.md §8). Run via `go test`
// (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are the human red of KRD §13.5, NOT invented to be satisfied:
//   1. ADMISSION-GATE invariant (KRD §13.5: "si le signal n'est pas vérifiable, KRD
//      ne certifie pas"). No truth whose allowed_mode excludes kernel is EVER admitted
//      to the kernel: Classify admits a (known kind, known level) truth iff that
//      level's allowed_mode == kernel, and only `deterministic` carries that mode.
//   2. DETERMINISM (CLAUDE.md §6/§8). Same Truth ⇒ same Routing, same error-ness;
//      Classify never panics on any string input.
//   3. NO SILENT ADMISSION. A rejected truth (Zone == rejected) is never Admitted and
//      always carries a non-empty BlockReason code (it names the door, never a prison).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"pgregory.net/rapid"
)

// drawKind draws a TruthKind: usually a known one, sometimes the empty (absent) case,
// sometimes an arbitrary out-of-enum string (the boundary).
func drawKind(rt *rapid.T) truthtyping.TruthKind {
	choice := rapid.IntRange(0, 2).Draw(rt, "kindChoice")
	switch choice {
	case 0:
		known := truthtyping.Kinds()
		i := rapid.IntRange(0, len(known)-1).Draw(rt, "knownKind")
		return known[i]
	case 1:
		return "" // absent
	default:
		return truthtyping.TruthKind(rapid.String().Draw(rt, "arbitraryKind"))
	}
}

// drawLevel draws a VerifiabilityLevel: usually a known one, sometimes empty, sometimes
// an arbitrary out-of-enum string.
func drawLevel(rt *rapid.T) truthtyping.VerifiabilityLevel {
	choice := rapid.IntRange(0, 2).Draw(rt, "levelChoice")
	switch choice {
	case 0:
		known := truthtyping.Levels()
		i := rapid.IntRange(0, len(known)-1).Draw(rt, "knownLevel")
		return known[i]
	case 1:
		return ""
	default:
		return truthtyping.VerifiabilityLevel(rapid.String().Draw(rt, "arbitraryLevel"))
	}
}

// TestAdmissionGate — the central KRD §13.5 invariant: a truth is admitted to the
// kernel IFF its level's allowed_mode == kernel; never otherwise. Equivalently: only
// a deterministic level can be admitted.
func TestAdmissionGate(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		truth := truthtyping.Truth{TruthKind: drawKind(rt), VerifiabilityLevel: drawLevel(rt)}
		routing, _ := truthtyping.Classify(truth)

		if routing.Admitted {
			// Admitted ⇒ zone is kernel, gate is kernel, kind is known, level is deterministic.
			if routing.Zone != truthtyping.ZoneKernel {
				rt.Fatalf("admitted but zone %q (truth %+v)", routing.Zone, truth)
			}
			if routing.AllowedMode != truthtyping.ModeKernel {
				rt.Fatalf("admitted but allowed_mode %q (truth %+v)", routing.AllowedMode, truth)
			}
			if !truthtyping.IsKnownKind(truth.TruthKind) {
				rt.Fatalf("admitted with unknown kind %q", truth.TruthKind)
			}
			mode, ok := truthtyping.AllowedModeOf(truth.VerifiabilityLevel)
			if !ok || mode != truthtyping.ModeKernel {
				rt.Fatalf("admitted but level %q has mode %q (ok=%v)", truth.VerifiabilityLevel, mode, ok)
			}
		}

		// Contrapositive: a known truth whose level's mode excludes kernel is never admitted.
		if truthtyping.IsKnownKind(truth.TruthKind) {
			if mode, ok := truthtyping.AllowedModeOf(truth.VerifiabilityLevel); ok && mode != truthtyping.ModeKernel && routing.Admitted {
				rt.Fatalf("level %q (mode %q) excludes kernel yet admitted", truth.VerifiabilityLevel, mode)
			}
		}
	})
}

// TestClassifyDeterministic — same Truth ⇒ same Routing and same error-ness; never panics.
func TestClassifyDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		truth := truthtyping.Truth{TruthKind: drawKind(rt), VerifiabilityLevel: drawLevel(rt)}
		a, errA := truthtyping.Classify(truth)
		b, errB := truthtyping.Classify(truth)
		if (errA == nil) != (errB == nil) {
			rt.Fatalf("error-ness diverged: %v vs %v (truth %+v)", errA, errB, truth)
		}
		if a != b {
			rt.Fatalf("non-deterministic: %+v vs %+v (truth %+v)", a, b, truth)
		}
	})
}

// TestRejectionNeverPrison — a rejected truth is never admitted and always names a door.
func TestRejectionNeverPrison(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		truth := truthtyping.Truth{TruthKind: drawKind(rt), VerifiabilityLevel: drawLevel(rt)}
		routing, err := truthtyping.Classify(truth)
		if routing.Zone == truthtyping.ZoneRejected {
			if routing.Admitted {
				rt.Fatalf("rejected yet admitted (truth %+v)", truth)
			}
			if routing.Code == "" {
				rt.Fatalf("rejected with empty BlockReason code — a prison (truth %+v)", truth)
			}
			if err == nil {
				rt.Fatalf("rejected with nil error (truth %+v)", truth)
			}
		}
	})
}

// TestExactEnumCardinality — the enums are EXACTLY the KRD §13.4 seven and §13.5 five,
// never more/fewer (CLAUDE.md honesty: do not invent members). A change to the enum
// trips this mirror.
func TestExactEnumCardinality(t *testing.T) {
	if got := len(truthtyping.Kinds()); got != 7 {
		t.Fatalf("TruthKind cardinality = %d, want 7 (KRD §13.4)", got)
	}
	if got := len(truthtyping.Levels()); got != 5 {
		t.Fatalf("VerifiabilityLevel cardinality = %d, want 5 (KRD §13.5)", got)
	}
	// Every known level maps to a known allowed_mode (no dangling level).
	for _, l := range truthtyping.Levels() {
		if _, ok := truthtyping.AllowedModeOf(l); !ok {
			t.Fatalf("level %q has no allowed_mode", l)
		}
	}
}

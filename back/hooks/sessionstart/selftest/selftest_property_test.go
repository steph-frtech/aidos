package selftest

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// Reproducibility / invariant mirror for the meta-meta self-test (KRD §70 / §60).
// reflects=hooks.sessionstart.Run, test_kind=property, cert_language=rapid,
// liveness=live, authority=below. The seven ∀ invariants of the fixture mirror.

// genHarness draws a deterministic random harness: a non-empty sensor subset, an
// optional muted sensor, an optional breached schema, and fitness rows that either
// match the baseline or are mutated.
func genHarness(t *rapid.T) *fakeHarness {
	all := []string{"gofmt", "vet", "lint", "archtest", "affected"}
	n := rapid.IntRange(1, len(all)).Draw(t, "n")
	sensors := append([]string(nil), all[:n]...)

	muted := map[string]bool{}
	if rapid.Bool().Draw(t, "anyMuted") {
		muted[sensors[rapid.IntRange(0, len(sensors)-1).Draw(t, "mutedIdx")]] = true
	}

	breached := map[string]bool{}
	if rapid.Bool().Draw(t, "anyBreached") {
		schemas := []string{SchemaKernel, SchemaMirrors, SchemaFitness}
		breached[schemas[rapid.IntRange(0, 2).Draw(t, "breachIdx")]] = true
	}

	rows := baselineFitness
	if rapid.Bool().Draw(t, "fitnessMutated") {
		rows = []byte(`{"definition_of_passed":"mutated","n":` + rapid.StringMatching(`[0-9]`).Draw(t, "salt") + `}`)
	}

	return &fakeHarness{
		sensors:      sensors,
		mutedSensor:  muted,
		breached:     breached,
		fitnessRows:  rows,
		baselineHash: baselineHashOf(baselineFitness),
	}
}

// ∀ h, t: Run(h,t) == Run(h,t) — determinism (no clock/RNG/map-order leak).
func TestPropDeterminism(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genHarness(t)
		r1, b1 := Run(h, at)
		r2, b2 := Run(h, at)
		if !reflect.DeepEqual(r1, r2) {
			t.Fatalf("non-deterministic report:\n%+v\n%+v", r1, r2)
		}
		if !reflect.DeepEqual(b1, b2) {
			t.Fatalf("non-deterministic BlockReason:\n%+v\n%+v", b1, b2)
		}
	})
}

// ∀ all-green ∧ wall refusing ∧ fitness==baseline: verdict green.
func TestPropAllGreenIsGreen(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genHarness(t)
		// Force the all-green precondition.
		h.mutedSensor = map[string]bool{}
		h.breached = map[string]bool{}
		h.fitnessRows = baselineFitness
		report, br := Run(h, at)
		if report.Verdict != VerdictGreen || br != nil {
			t.Fatalf("all-green harness must be green, got %q / %v", report.Verdict, br)
		}
	})
}

// ∀ ANY muted sensor: red ∧ BlockReason emitted.
func TestPropMutedSensorReddens(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genHarness(t)
		h.mutedSensor[h.sensors[0]] = true // ensure at least one muted
		report, br := Run(h, at)
		if report.Verdict != VerdictRed {
			t.Fatalf("any muted sensor must redden, got %q", report.Verdict)
		}
		if br == nil || len(br.HowToFix) == 0 {
			t.Fatal("a muted sensor must emit a BlockReason with a fix path")
		}
	})
}

// ∀ ANY accepted above-the-line write: red.
func TestPropBreachedWallReddens(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genHarness(t)
		h.mutedSensor = map[string]bool{} // isolate the wall guarantee
		schemas := []string{SchemaKernel, SchemaMirrors, SchemaFitness}
		h.breached[schemas[rapid.IntRange(0, 2).Draw(t, "s")]] = true
		report, br := Run(h, at)
		if report.Verdict != VerdictRed {
			t.Fatalf("any accepted above-the-line write must redden, got %q", report.Verdict)
		}
		if br == nil || br.Code != CodeWallBreached {
			t.Fatalf("a breached wall must emit WALL_BREACHED, got %v", br)
		}
	})
}

// ∀ fitness rows != baseline: unchanged==false ∧ red.
func TestPropMutatedFitnessReddens(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genHarness(t)
		h.mutedSensor = map[string]bool{}
		h.breached = map[string]bool{}
		salt := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "salt")
		h.fitnessRows = []byte(`{"x":"` + salt + `","def":"mutated"}`)
		report, br := Run(h, at)
		if report.FitnessProbe.Unchanged {
			t.Fatal("mutated fitness must report unchanged == false")
		}
		if report.Verdict != VerdictRed || br == nil || br.Code != CodeFitnessMutated {
			t.Fatalf("mutated fitness must redden with FITNESS_MUTATED, got %q / %v", report.Verdict, br)
		}
	})
}

// ∀ h: fitness rows unchanged by Run (read-only on what it checks).
func TestPropReadOnlyOnFitness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genHarness(t)
		before := string(h.FitnessRows())
		_, _ = Run(h, at)
		if string(h.FitnessRows()) != before {
			t.Fatal("Run must not mutate the fitness rows it checks")
		}
	})
}

// ∀ malformed harness (empty inventory): BlockReason, never a panic, never an invented id.
func TestPropMalformedYieldsBlockReason(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genHarness(t)
		h.sensors = nil
		report, br := Run(h, at)
		if br == nil {
			t.Fatal("empty inventory must yield a BlockReason (never a panic)")
		}
		if len(report.SensorsChecked) != 0 {
			t.Fatal("no sensor id may be invented for an empty inventory")
		}
	})
}

package doltgresspike_test

// S88 reproducibility mirror (determinism-first mandate, §8 "the judge is
// deterministic"). reflects=s88-doltgres-spike-verdict · test_kind=property ·
// cert_language=rapid · liveness=live.
//
// Pins the gating invariants of the spike verdict as a PURE function:
//
//   - DETERMINISM: same Measurement + same Thresholds → byte-identical Decision
//     (same ID, same verdict, same opt-in set). The verdict is a measure, not an
//     opinion — re-deciding never drifts.
//   - DEFAULT IS ALWAYS PLAIN-POSTGRES: regardless of the measurement, the
//     emitted-app DEFAULT target is plain-postgres (the escape hatch by
//     construction) and it is always an allowed opt-in.
//   - DOLTGRES OPT-IN IFF GO: doltgres is offered as opt-in exactly when the
//     verdict is Go, and never as the default.
//   - REPRODUCIBLE FAILURE FLIPS, A BLIP DOES NOT: a reproducible instability past
//     the connection ceiling forces no-go; the SAME instability marked
//     non-reproducible does NOT (the done-criteria require a reproducible
//     failure).
//   - PERF CEILING: a perf ratio above the declared ceiling forces no-go; within
//     it (incl. ADR 0006's cited ~5.2×) does not, on its own.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/doltgresspike"
	"pgregory.net/rapid"
)

func genMeasurement(t *rapid.T) doltgresspike.Measurement {
	drivers := []doltgresspike.Driver{doltgresspike.DriverTSPostgres, doltgresspike.DriverPgx}
	conns := rapid.IntRange(1, 256).Draw(t, "conns")
	return doltgresspike.Measurement{
		Driver:       rapid.SampledFrom(drivers).Draw(t, "driver"),
		Conns:        conns,
		FailedConns:  rapid.IntRange(0, conns).Draw(t, "failedConns"),
		PerfRatio:    rapid.Float64Range(0, 20).Draw(t, "perfRatio"),
		Reproducible: rapid.Bool().Draw(t, "reproducible"),
	}
}

func TestVerdictIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMeasurement(t)
		th := doltgresspike.DefaultThresholds

		d1 := doltgresspike.Decide(m, th)
		d2 := doltgresspike.Decide(m, th)

		if d1.ID != d2.ID {
			t.Fatalf("non-deterministic ID: %q != %q", d1.ID, d2.ID)
		}
		if d1.Verdict != d2.Verdict {
			t.Fatalf("non-deterministic verdict: %q != %q", d1.Verdict, d2.Verdict)
		}
		if d1.ID == "" {
			t.Fatal("empty decision ID (not content-addressed)")
		}
	})
}

func TestDefaultIsAlwaysPlainPostgres(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMeasurement(t)
		d := doltgresspike.Decide(m, doltgresspike.DefaultThresholds)

		if d.DefaultTarget != doltgresspike.PlainPostgres {
			t.Fatalf("default target is %q, must always be plain-postgres", d.DefaultTarget)
		}
		if !d.OptInAllowed(doltgresspike.PlainPostgres) {
			t.Fatal("plain-postgres must always be an allowed opt-in")
		}
	})
}

func TestDoltgresOptInIffGo(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMeasurement(t)
		d := doltgresspike.Decide(m, doltgresspike.DefaultThresholds)

		allowed := d.OptInAllowed(doltgresspike.Doltgres)
		switch d.Verdict {
		case doltgresspike.Go:
			if !allowed {
				t.Fatal("Go verdict must offer doltgres as opt-in")
			}
		case doltgresspike.NoGo:
			if allowed {
				t.Fatal("no-go verdict must NOT offer doltgres")
			}
		default:
			t.Fatalf("unexpected verdict %q", d.Verdict)
		}
		// Doltgres is NEVER the default, regardless of verdict.
		if d.DefaultTarget == doltgresspike.Doltgres {
			t.Fatal("doltgres must never be the default")
		}
	})
}

func TestReproducibleFailureFlipsDefault_BlipDoesNot(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		conns := rapid.IntRange(2, 256).Draw(t, "conns")
		// An instability strictly beyond the (zero) connection ceiling, and a perf
		// ratio that is otherwise WITHIN the ceiling (so stability is the only knob).
		base := doltgresspike.Measurement{
			Driver:      doltgresspike.DriverTSPostgres,
			Conns:       conns,
			FailedConns: rapid.IntRange(1, conns).Draw(t, "failedConns"),
			PerfRatio:   rapid.Float64Range(0.5, doltgresspike.DefaultThresholds.MaxPerfRatio).Draw(t, "perfRatio"),
		}

		reproducible := base
		reproducible.Reproducible = true
		if v, _ := doltgresspike.Evaluate(reproducible, doltgresspike.DefaultThresholds); v != doltgresspike.NoGo {
			t.Fatalf("reproducible instability must be no-go, got %q", v)
		}

		blip := base
		blip.Reproducible = false
		if v, _ := doltgresspike.Evaluate(blip, doltgresspike.DefaultThresholds); v != doltgresspike.Go {
			t.Fatalf("non-reproducible blip (with perf OK) must NOT flip default; got %q", v)
		}
	})
}

func TestPerfCeilingForcesNoGo(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		conns := rapid.IntRange(1, 256).Draw(t, "conns")
		// Fully stable, so perf ratio is the only knob.
		m := doltgresspike.Measurement{
			Driver:       doltgresspike.DriverTSPostgres,
			Conns:        conns,
			FailedConns:  0,
			Reproducible: true,
		}
		th := doltgresspike.DefaultThresholds

		over := m
		over.PerfRatio = rapid.Float64Range(th.MaxPerfRatio+0.01, 50).Draw(t, "over")
		if v, _ := doltgresspike.Evaluate(over, th); v != doltgresspike.NoGo {
			t.Fatalf("perf ratio over ceiling must be no-go, got %q", v)
		}

		within := m
		within.PerfRatio = rapid.Float64Range(0.5, th.MaxPerfRatio).Draw(t, "within")
		if v, _ := doltgresspike.Evaluate(within, th); v != doltgresspike.Go {
			t.Fatalf("stable + perf within ceiling must be go, got %q", v)
		}
	})
}

// TestKnownDoltgresSlowdownIsStillGo pins ADR 0006's cited ~5.2× as a GO when the
// app is otherwise stable — confirming the documented slowdown does not, on its
// own, withdraw the opt-in.
func TestKnownDoltgresSlowdownIsStillGo(t *testing.T) {
	m := doltgresspike.Measurement{
		Driver:       doltgresspike.DriverTSPostgres,
		Conns:        64,
		FailedConns:  0,
		PerfRatio:    5.2,
		Reproducible: true,
	}
	d := doltgresspike.Decide(m, doltgresspike.DefaultThresholds)
	if d.Verdict != doltgresspike.Go {
		t.Fatalf("the cited ~5.2× slowdown with full stability must be Go, got %q (reasons=%v)", d.Verdict, d.Reasons)
	}
	if !d.OptInAllowed(doltgresspike.Doltgres) {
		t.Fatal("Go must offer doltgres opt-in")
	}
}

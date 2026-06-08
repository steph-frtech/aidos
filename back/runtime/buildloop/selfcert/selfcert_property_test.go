// selfcert_property_test.go — the S84 REPRODUCIBILITY mirror (property, rapid). It pins the
// determinism-first laws of the self-certification battery (CLAUDE.md §6/§8):
//
//   - ∀ DETERMINISM: Certify / GateGreen / ToStopSensors / Report are PURE functions — same
//     verdicts ⇒ same battery / gate / projection. The judge is the deterministic mirror.
//   - ∀ TOTALITY: none of them panics on any drawn verdict set (including empties, duplicates,
//     unknown kinds).
//   - ∀ GATE-CONJUNCTION: GateGreen is true IFF every one of the seven canonical sensors is
//     present and green (anti-passthrough — a missing or red sensor ⇒ not green).
//   - ∀ RED-IMPLIES-BLOCKREASON: a non-green battery ALWAYS carries the BUILD_LOOP_SENSOR_RED
//     refusal with actionable how_to_fix; a green one carries none.
//   - ∀ FAULT-INJECTION: flipping ANY single sensor to red flips an otherwise-green battery red
//     (no sensor is a no-op).
package selfcert_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/buildloop/selfcert"
	"pgregory.net/rapid"
)

// genState draws a sensor state.
func genState(t *rapid.T) selfcert.SensorState {
	if rapid.Bool().Draw(t, "green") {
		return selfcert.SensorGreen
	}
	return selfcert.SensorRed
}

// genVerdicts draws a verdict for each of the seven canonical kinds (a complete battery input),
// optionally dropping some (to exercise the missing-kind path) and appending an unknown kind.
func genVerdicts(t *rapid.T) []selfcert.SensorVerdict {
	var out []selfcert.SensorVerdict
	for _, k := range selfcert.SensorKinds() {
		if rapid.Bool().Draw(t, "present-"+string(k)) {
			out = append(out, selfcert.SensorVerdict{Kind: k, State: genState(t), Detail: rapid.StringN(0, 8, 8).Draw(t, "detail-"+string(k))})
		}
	}
	if rapid.Bool().Draw(t, "unknown") {
		out = append(out, selfcert.SensorVerdict{Kind: selfcert.SensorKind("UNKNOWN_KIND"), State: genState(t)})
	}
	return out
}

// TestCertifyIsPureFunctionOfVerdicts — same verdicts ⇒ byte-identical battery (green flag,
// sensor order, BlockReason presence/code).
func TestCertifyIsPureFunctionOfVerdicts(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		v := genVerdicts(t)
		a := selfcert.Certify(v)
		b := selfcert.Certify(v)
		if a.Green != b.Green {
			t.Fatalf("Certify not deterministic on Green: %v vs %v", a.Green, b.Green)
		}
		if len(a.Sensors) != len(b.Sensors) {
			t.Fatalf("Certify not deterministic on sensor count")
		}
		for i := range a.Sensors {
			if a.Sensors[i] != b.Sensors[i] {
				t.Fatalf("Certify not deterministic at sensor %d: %+v vs %+v", i, a.Sensors[i], b.Sensors[i])
			}
		}
		if (a.BlockReason == nil) != (b.BlockReason == nil) {
			t.Fatalf("Certify not deterministic on BlockReason presence")
		}
	})
}

// TestGateIsTheSevenSensorConjunction — GateGreen ⇔ every canonical sensor present and green.
func TestGateIsTheSevenSensorConjunction(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		v := genVerdicts(t)
		gate := selfcert.GateGreen(v)

		// Recompute the conjunction independently.
		byKind := map[selfcert.SensorKind]selfcert.SensorState{}
		for _, sv := range v {
			byKind[sv.Kind] = sv.State
		}
		want := true
		for _, k := range selfcert.SensorKinds() {
			if byKind[k] != selfcert.SensorGreen {
				want = false
				break
			}
		}
		if gate != want {
			t.Fatalf("GateGreen %v, conjunction %v for %+v", gate, want, v)
		}
	})
}

// TestRedBatteryAlwaysCarriesActionableBlockReason — a non-green battery has BUILD_LOOP_SENSOR_RED
// with non-empty how_to_fix; a green one has none.
func TestRedBatteryAlwaysCarriesActionableBlockReason(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b := selfcert.Certify(genVerdicts(t))
		if b.Green {
			if b.BlockReason != nil {
				t.Fatalf("green battery must carry no BlockReason")
			}
			return
		}
		if b.BlockReason == nil {
			t.Fatalf("red battery must carry a BlockReason")
		}
		if b.BlockReason.Code != selfcert.CodeBuildLoopSensorRed {
			t.Fatalf("red battery code = %s, want BUILD_LOOP_SENSOR_RED", b.BlockReason.Code)
		}
		if len(b.BlockReason.HowToFix) == 0 {
			t.Fatalf("BlockReason must be actionable (how_to_fix non-empty)")
		}
	})
}

// TestAnySingleRedSensorBlocksAGreenBattery — fault-injection ∀: starting from all-green,
// flipping ANY one sensor red makes the battery red (no sensor is a no-op).
func TestAnySingleRedSensorBlocksAGreenBattery(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		kinds := selfcert.SensorKinds()
		idx := rapid.IntRange(0, len(kinds)-1).Draw(t, "which")
		var v []selfcert.SensorVerdict
		for i, k := range kinds {
			st := selfcert.SensorGreen
			if i == idx {
				st = selfcert.SensorRed
			}
			v = append(v, selfcert.SensorVerdict{Kind: k, State: st})
		}
		b := selfcert.Certify(v)
		if b.Green {
			t.Fatalf("flipping %s red must block the battery", kinds[idx])
		}
		red := selfcert.RedSensors(b.Sensors)
		if len(red) != 1 || red[0] != kinds[idx] {
			t.Fatalf("only %s must be red; got %v", kinds[idx], red)
		}
	})
}

// TestToStopSensorsIsFailClosed — ToStopSensors marks every red-set mirror green ONLY when the
// battery is green; otherwise every one is red (the loop cannot close on a red battery).
func TestToStopSensorsIsFailClosed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b := selfcert.Certify(genVerdicts(t))
		redSet := rapid.SliceOfN(rapid.StringN(1, 6, 6), 0, 5).Draw(t, "redset")
		stop := selfcert.ToStopSensors(redSet, b)
		// The map is keyed by mirror ref, so it covers the DISTINCT red-set entries (a
		// duplicate ref collapses — the same mirror cannot carry two contradictory states).
		distinct := map[string]struct{}{}
		for _, m := range redSet {
			distinct[m] = struct{}{}
		}
		if len(stop) != len(distinct) {
			t.Fatalf("ToStopSensors must cover every distinct red-set mirror: got %d want %d", len(stop), len(distinct))
		}
		for _, m := range redSet {
			want := selfcert.SensorRed
			if b.Green {
				want = selfcert.SensorGreen
			}
			if string(stop[m]) != string(want) {
				t.Fatalf("mirror %s: stop=%s want=%s (battery.green=%v)", m, stop[m], want, b.Green)
			}
		}
	})
}

// TestReportNeverPanics — Report is total over any battery.
func TestReportNeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		_ = selfcert.Report(selfcert.Certify(genVerdicts(t)))
	})
}

// selfcert_fixture_test.go — the S84 DONE-CRITERION mirror (fault-injection). The build loop
// self-certifies EVERY diff on the real computational sensor battery; THIS mirror proves the
// gate's defining property:
//
//	A diff that breaks an ARCH BOUNDARY or a PACT CONTRACT reddens its sensor, and the
//	iteration is BLOCKED before the loop can declare green.
//
// The fixtures inject a FAULT into one sensor of the battery and assert the gate goes red, the
// BlockReason fires (BUILD_LOOP_SENSOR_RED), and — through the S83 build loop wired with the
// CertifiedSensors adapter — the loop's verdict is NOT green (the iteration is blocked before
// green). A clean battery, by contrast, passes the gate. The Runner is scripted so the gate is
// deterministic.
package selfcert_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/buildloop"
	"github.com/steph-frtech/aidos/back/runtime/buildloop/selfcert"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// scriptedRunner is a deterministic Runner stub: it returns a fixed verdict per sensor kind, so
// a test can INJECT a fault into exactly one sensor and replay the gate byte-identically.
type scriptedRunner struct {
	verdicts map[selfcert.SensorKind]selfcert.SensorVerdict
}

func (s scriptedRunner) RunSensor(kind selfcert.SensorKind, _ string, _ goal.Goal) selfcert.SensorVerdict {
	if v, ok := s.verdicts[kind]; ok {
		v.Kind = kind
		return v
	}
	return selfcert.SensorVerdict{Kind: kind, State: selfcert.SensorGreen}
}

// allGreen is the baseline: every sensor passes.
func allGreen() map[selfcert.SensorKind]selfcert.SensorVerdict {
	m := map[selfcert.SensorKind]selfcert.SensorVerdict{}
	for _, k := range selfcert.SensorKinds() {
		m[k] = selfcert.SensorVerdict{Kind: k, State: selfcert.SensorGreen}
	}
	return m
}

// TestCleanBatteryPassesTheGate — a diff that passes every sensor certifies green, with no
// BlockReason. The control case (so a red verdict means a real fault, not a broken gate).
func TestCleanBatteryPassesTheGate(t *testing.T) {
	b := selfcert.RunBattery(scriptedRunner{verdicts: allGreen()}, "/sandbox", goal.Goal{ID: "g1"})
	if !b.Green {
		t.Fatalf("clean battery must be green; report=%v", selfcert.Report(b))
	}
	if b.BlockReason != nil {
		t.Fatalf("a green battery carries no BlockReason; got %s", b.BlockReason.Code)
	}
	if len(b.Sensors) != len(selfcert.SensorKinds()) {
		t.Fatalf("the report must carry the full battery (%d); got %d", len(selfcert.SensorKinds()), len(b.Sensors))
	}
}

// TestArchBoundaryBreakRedensTheSensorAndBlocksBeforeGreen — THE DONE-CRITERION. A diff that
// breaks an arch boundary (the archfit sensor) reddens that sensor, the gate goes red, the
// BUILD_LOOP_SENSOR_RED BlockReason fires, and the iteration is blocked before green.
func TestArchBoundaryBreakRedensTheSensorAndBlocksBeforeGreen(t *testing.T) {
	v := allGreen()
	v[selfcert.SensorArchFit] = selfcert.SensorVerdict{
		Kind:   selfcert.SensorArchFit,
		State:  selfcert.SensorRed,
		Detail: "dependency-cruiser: forbidden edge view→infra in the emitted tree",
	}
	b := selfcert.RunBattery(scriptedRunner{verdicts: v}, "/sandbox", goal.Goal{ID: "g1"})

	if b.Green {
		t.Fatal("a diff that breaks an arch boundary must NOT certify green")
	}
	if b.BlockReason == nil || b.BlockReason.Code != selfcert.CodeBuildLoopSensorRed {
		t.Fatalf("expected BUILD_LOOP_SENSOR_RED; got %+v", b.BlockReason)
	}
	red := selfcert.RedSensors(b.Sensors)
	if len(red) != 1 || red[0] != selfcert.SensorArchFit {
		t.Fatalf("the archfit sensor must be the one red; got %v", red)
	}
	if len(b.BlockReason.HowToFix) == 0 {
		t.Fatal("a BlockReason must carry actionable how_to_fix (never a prison)")
	}
}

// TestPactContractBreakRedensTheSensorAndBlocksBeforeGreen — the contract half of the done-
// criterion. A diff that breaks a Pact contract reddens the pact sensor and blocks the iteration.
func TestPactContractBreakRedensTheSensorAndBlocksBeforeGreen(t *testing.T) {
	v := allGreen()
	v[selfcert.SensorPact] = selfcert.SensorVerdict{
		Kind:   selfcert.SensorPact,
		State:  selfcert.SensorRed,
		Detail: "pact: provider verification failed — response shape diverged from the consumer contract",
	}
	b := selfcert.RunBattery(scriptedRunner{verdicts: v}, "/sandbox", goal.Goal{ID: "g1"})

	if b.Green {
		t.Fatal("a diff that breaks a Pact contract must NOT certify green")
	}
	if b.BlockReason == nil || b.BlockReason.Code != selfcert.CodeBuildLoopSensorRed {
		t.Fatalf("expected BUILD_LOOP_SENSOR_RED; got %+v", b.BlockReason)
	}
	red := selfcert.RedSensors(b.Sensors)
	if len(red) != 1 || red[0] != selfcert.SensorPact {
		t.Fatalf("the pact sensor must be the one red; got %v", red)
	}
}

// TestMissingSensorIsRedAntiPassthrough — a battery missing a sensor verdict cannot go green:
// the missing kind is materialised red. A loop cannot certify green on absent evidence (§82).
func TestMissingSensorIsRedAntiPassthrough(t *testing.T) {
	// Drop the property sensor entirely.
	v := allGreen()
	delete(v, selfcert.SensorProperty)
	// Build a partial verdict slice directly (Certify must materialise the missing one red).
	partial := []selfcert.SensorVerdict{}
	for _, k := range selfcert.SensorKinds() {
		if k == selfcert.SensorProperty {
			continue
		}
		partial = append(partial, v[k])
	}
	b := selfcert.Certify(partial)
	if b.Green {
		t.Fatal("a battery missing a sensor must NOT be green (anti-passthrough)")
	}
	if len(b.Sensors) != len(selfcert.SensorKinds()) {
		t.Fatalf("Certify must materialise the full battery; got %d", len(b.Sensors))
	}
}

// TestEachSensorKindCanBlockTheIteration — every one of the seven sensors, when red, blocks the
// gate. No sensor is a no-op: the full computational battery gates each diff.
func TestEachSensorKindCanBlockTheIteration(t *testing.T) {
	for _, k := range selfcert.SensorKinds() {
		v := allGreen()
		v[k] = selfcert.SensorVerdict{Kind: k, State: selfcert.SensorRed, Detail: "injected fault"}
		b := selfcert.RunBattery(scriptedRunner{verdicts: v}, "/sandbox", goal.Goal{ID: "g1"})
		if b.Green {
			t.Fatalf("a red %s sensor must block the gate", k)
		}
		red := selfcert.RedSensors(b.Sensors)
		if len(red) != 1 || red[0] != k {
			t.Fatalf("only %s must be red; got %v", k, red)
		}
	}
}

// TestLoopCannotDeclareGreenWhenABatterySensorIsRed — the END-TO-END done-criterion through the
// S83 build loop. The loop is wired with the CertifiedSensors adapter; when a battery sensor is
// red, the loop's Drive turn does NOT terminate green — the iteration is blocked before green.
func TestLoopCannotDeclareGreenWhenABatterySensorIsRed(t *testing.T) {
	g := goal.Goal{ID: "g1", RedSet: []string{"Order.acceptance", "Order.invariant"}}

	// Inject an arch-boundary fault: the archfit sensor is red.
	v := allGreen()
	v[selfcert.SensorArchFit] = selfcert.SensorVerdict{Kind: selfcert.SensorArchFit, State: selfcert.SensorRed, Detail: "forbidden edge"}
	sensors := &selfcert.CertifiedSensors{Runner: scriptedRunner{verdicts: v}, SandboxDir: "/sandbox"}

	out, err := buildloop.Drive(buildloop.TurnInput{
		Goal:      g,
		Branch:    "main",
		StartedAt: "2026-06-08T00:00:00Z",
		EndedAt:   "2026-06-08T00:00:01Z",
		Policy:    buildloop.Policy{MaxIterations: 0, StagnationWindow: 0},
	}, fakeCompiler{}, fakeGenerator{}, fakeSandbox{}, sensors)
	if err != nil {
		t.Fatalf("Drive returned error: %v", err)
	}
	if out.Decision.Verdict == buildloop.VerdictGreen {
		t.Fatal("the loop must NOT declare green while a battery sensor is red (blocked before green)")
	}
	if sensors.Last.Green {
		t.Fatal("the self-cert battery the loop ran must be red")
	}
	if sensors.Last.BlockReason == nil || sensors.Last.BlockReason.Code != selfcert.CodeBuildLoopSensorRed {
		t.Fatalf("the per-iteration battery must carry BUILD_LOOP_SENSOR_RED; got %+v", sensors.Last.BlockReason)
	}

	// Contrast: a clean battery lets the loop reach green for the full red set.
	cleanSensors := &selfcert.CertifiedSensors{Runner: scriptedRunner{verdicts: allGreen()}, SandboxDir: "/sandbox"}
	out2, err := buildloop.Drive(buildloop.TurnInput{
		Goal:      g,
		Branch:    "main",
		StartedAt: "2026-06-08T00:00:00Z",
		EndedAt:   "2026-06-08T00:00:01Z",
	}, fakeCompiler{}, fakeGenerator{}, fakeSandbox{}, cleanSensors)
	if err != nil {
		t.Fatalf("Drive(clean) returned error: %v", err)
	}
	if out2.Decision.Verdict != buildloop.VerdictGreen {
		t.Fatalf("a clean battery must let the loop reach green; got %s", out2.Decision.Verdict)
	}
}

// ── fake ports for the end-to-end Drive turn (deterministic) ──────────────────────────

type fakeCompiler struct{}

func (fakeCompiler) Compile(_ goal.Goal, _ string) string { return "pack-ref-1" }

type fakeGenerator struct{}

func (fakeGenerator) Generate(_ string, _ goal.Goal) (string, []byte, string) {
	return "sandbox/order.ts", []byte("// diff"), "diff-hash-1"
}

type fakeSandbox struct{}

func (fakeSandbox) Apply(_ string, _ []byte) []byte { return []byte(`{"applied":true}`) }

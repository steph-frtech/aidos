package main

import (
	"context"
	"fmt"
	"testing"

	"github.com/cucumber/godog"
)

// Acceptance mirror runner (Godog, N0) for S07 — Les sensors. It runs
// tests/runtime/sensors.feature against the PostToolUse hook's RunSensors
// orchestration, using a fault-forcing fake CheckRunner (so the journey can make
// any one named sensor fail deterministically) and an in-memory RunLog (so we can
// assert a sensor_runs row was recorded). The journey is a MEANS-test toward the
// human red, never a new truth.

type sensorsWorld struct {
	ev       Event
	forced   map[string]checkOutcome // name → forced outcome
	log      *memRunLog
	decision Decision
}

type checkOutcome struct {
	fail    bool
	errored bool
}

// fakeRunner forces named outcomes; any sensor not named passes.
type fakeRunner struct{ forced map[string]checkOutcome }

func (f fakeRunner) Run(name string, _ CheckContext) CheckResult {
	if o, ok := f.forced[name]; ok {
		return CheckResult{Name: name, Pass: !o.fail && !o.errored, Errored: o.errored}
	}
	return CheckResult{Name: name, Pass: true}
}

type memRunLog struct{ runs []SensorRun }

func (m *memRunLog) Record(_ context.Context, run SensorRun) error {
	m.runs = append(m.runs, run)
	return nil
}

func (w *sensorsWorld) reset() {
	w.ev = Event{}
	w.forced = map[string]checkOutcome{}
	w.log = &memRunLog{}
	w.decision = Decision{}
}

func (w *sensorsWorld) anEvent(tool string) error {
	w.ev = Event{Tool: tool, Path: "back/gen/order.go"}
	return nil
}

func (w *sensorsWorld) checkFails(check string) error {
	w.forced[check] = checkOutcome{fail: true}
	return nil
}

func (w *sensorsWorld) checkErrors(check string) error {
	w.forced[check] = checkOutcome{errored: true}
	return nil
}

func (w *sensorsWorld) allClean() error { return nil }

func (w *sensorsWorld) runHook() error {
	w.decision = RunSensors(context.Background(), w.ev, fakeRunner{forced: w.forced}, w.log)
	return nil
}

func (w *sensorsWorld) verdictIs(want string) error {
	if string(w.decision.Verdict) != want {
		return fmt.Errorf("verdict = %q, want %q", w.decision.Verdict, want)
	}
	return nil
}

func (w *sensorsWorld) blockCodeIs(want string) error {
	if w.decision.BlockReason == nil {
		return fmt.Errorf("no BlockReason")
	}
	if string(w.decision.BlockReason.Code) != want {
		return fmt.Errorf("code = %q, want %q", w.decision.BlockReason.Code, want)
	}
	return nil
}

func (w *sensorsWorld) blockNamesCheck(check string) error {
	if w.decision.BlockReason == nil {
		return fmt.Errorf("no BlockReason")
	}
	for _, f := range w.decision.Failing {
		if f == check {
			return nil
		}
	}
	return fmt.Errorf("failing %v does not name %q", w.decision.Failing, check)
}

func (w *sensorsWorld) howToFixNonEmpty() error {
	if w.decision.BlockReason == nil || len(w.decision.BlockReason.HowToFix) == 0 {
		return fmt.Errorf("how_to_fix is empty")
	}
	return nil
}

func (w *sensorsWorld) rowRecordedWithVerdict(want string) error {
	if len(w.log.runs) == 0 {
		return fmt.Errorf("no sensor_runs row recorded")
	}
	last := w.log.runs[len(w.log.runs)-1]
	if string(last.Verdict) != want {
		return fmt.Errorf("recorded verdict = %q, want %q", last.Verdict, want)
	}
	return nil
}

func (w *sensorsWorld) failingCheckInRow(check string) error {
	if len(w.log.runs) == 0 {
		return fmt.Errorf("no sensor_runs row recorded")
	}
	last := w.log.runs[len(w.log.runs)-1]
	for _, r := range last.Results {
		if r.Name == check && !r.Pass {
			return nil
		}
	}
	return fmt.Errorf("row results do not show %q failing: %+v", check, last.Results)
}

func TestSensorsFeatures(t *testing.T) {
	w := &sensorsWorld{}
	suite := godog.TestSuite{
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			sc.Before(func(ctx context.Context, _ *godog.Scenario) (context.Context, error) {
				w.reset()
				return ctx, nil
			})
			sc.Step(`^a PostToolUse event for an "([^"]*)" below the waterline$`, w.anEvent)
			sc.Step(`^the changed code makes the "([^"]*)" sensor fail$`, w.checkFails)
			sc.Step(`^the "([^"]*)" sensor errors \(its result is unknown\)$`, w.checkErrors)
			sc.Step(`^the changed code passes gofmt, vet, lint, archtest and all affected tests$`, w.allClean)
			sc.Step(`^the PostToolUse hook runs the computational sensors$`, w.runHook)
			sc.Step(`^the verdict is "([^"]*)"$`, w.verdictIs)
			sc.Step(`^the BlockReason code is "([^"]*)"$`, w.blockCodeIs)
			sc.Step(`^the BlockReason names the failing check "([^"]*)"$`, w.blockNamesCheck)
			sc.Step(`^the failing check in the sensor_runs row is "([^"]*)"$`, w.failingCheckInRow)
			sc.Step(`^the BlockReason carries a non-empty how_to_fix path$`, w.howToFixNonEmpty)
			sc.Step(`^a sensor_runs row is recorded with verdict "([^"]*)"$`, w.rowRecordedWithVerdict)
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/sensors.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("sensors.feature scenarios failed")
	}
}

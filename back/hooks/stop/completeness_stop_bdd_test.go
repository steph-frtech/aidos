package main

import (
	"context"
	"fmt"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/kernel/mirror/completeness"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// Acceptance mirror runner (Godog, N0) for S12 — the Stop hook enforces the
// completeness law and blocks on a monster. It runs
// tests/mirror/completeness_stop.feature against the Stop hook's CheckCompleteness
// orchestration, using a fixed in-memory CutSource (so the journey can stage a
// missing-mirror layer, an orphan mirror, or a complete cut) and an in-memory
// RunLog (so we can assert a completeness_runs row was recorded). The journey is a
// MEANS-test toward the human red, never a new truth.

type stopWorld struct {
	cut      completeness.Cut
	log      *memRunLog
	decision completeness.Decision
}

type memRunLog struct{ runs []CompletenessRun }

func (m *memRunLog) Record(_ context.Context, run CompletenessRun) error {
	m.runs = append(m.runs, run)
	return nil
}

type fixedCut struct{ cut completeness.Cut }

func (f fixedCut) Load(context.Context) (completeness.Cut, error) { return f.cut, nil }

func (w *stopWorld) reset() {
	w.cut = completeness.Cut{}
	w.log = &memRunLog{}
	w.decision = completeness.Decision{}
}

// Background steps — they only declare the staging context.
func (w *stopWorld) mirrorsHoldRecords() error { return nil }
func (w *stopWorld) stopClosesCut() error      { return nil }

// A layer with NO living mirror of any required test_kind → no_truth_without_mirror.
func (w *stopWorld) layerWithoutLivingMirror() error {
	w.cut = completeness.Cut{
		Layers:  []records.Layer{{LayerID: "checkout-button", Version: "v1", Kind: "control"}},
		Mirrors: nil, // no mirror at all → the required fixture is missing.
	}
	return nil
}

// A mirror whose reflects target no longer exists at that version → orphan.
func (w *stopWorld) orphanMirror() error {
	w.cut = completeness.Cut{
		// The layer is at v1; the mirror reflects the vanished v0.
		Layers: []records.Layer{{LayerID: "checkout-button", Version: "v1", Kind: "control"}},
		Mirrors: []records.Mirror{
			// A living mirror so the layer itself is NOT a no_truth monster…
			{MirrorID: "live-1", Reflects: records.LayerRef{LayerID: "checkout-button", Version: "v1"}, TestKind: records.TestKindFixture, CertLanguage: records.CertFixture, Authority: records.AuthorityAbove, Liveness: records.LivenessAlive},
			// …and an orphan reflecting a gone @version.
			{MirrorID: "orphan-1", Reflects: records.LayerRef{LayerID: "checkout-button", Version: "v0"}, TestKind: records.TestKindFixture, CertLanguage: records.CertFixture, Authority: records.AuthorityAbove, Liveness: records.LivenessDead},
		},
	}
	return nil
}

// A complete cut: every layer has a living, executable, correctly-reflecting mirror.
func (w *stopWorld) completeCut() error {
	w.cut = completeness.Cut{
		Layers: []records.Layer{{LayerID: "checkout-button", Version: "v1", Kind: "control"}},
		Mirrors: []records.Mirror{
			{MirrorID: "live-1", Reflects: records.LayerRef{LayerID: "checkout-button", Version: "v1"}, TestKind: records.TestKindFixture, CertLanguage: records.CertFixture, Authority: records.AuthorityAbove, Liveness: records.LivenessAlive},
		},
	}
	return nil
}

func (w *stopWorld) runHook() error {
	w.decision = CheckCompleteness(context.Background(), fixedCut{cut: w.cut}, w.log)
	return nil
}

func (w *stopWorld) verdictIs(want string) error {
	if string(w.decision.Verdict) != want {
		return fmt.Errorf("verdict = %q, want %q", w.decision.Verdict, want)
	}
	return nil
}

func (w *stopWorld) blockCodeIs(want string) error {
	if w.decision.BlockReason == nil {
		return fmt.Errorf("no BlockReason")
	}
	if string(w.decision.BlockReason.Code) != want {
		return fmt.Errorf("code = %q, want %q", w.decision.BlockReason.Code, want)
	}
	return nil
}

func (w *stopWorld) reportsLayerNoTruthWithHowToFix() error {
	if !w.hasReason(records.ReasonNoTruthWithoutMirror) {
		return fmt.Errorf("monster set does not report no_truth_without_mirror: %+v", w.decision.Monsters)
	}
	if w.decision.BlockReason == nil || len(w.decision.BlockReason.HowToFix) == 0 {
		return fmt.Errorf("how_to_fix is empty")
	}
	return nil
}

func (w *stopWorld) reportsMirrorOrphan() error {
	if !w.hasReason(records.ReasonNoOrphanMirror) {
		return fmt.Errorf("monster set does not report no_orphan_mirror: %+v", w.decision.Monsters)
	}
	return nil
}

func (w *stopWorld) monsterSetEmpty() error {
	if len(w.decision.Monsters) != 0 {
		return fmt.Errorf("monster set must be empty, got %+v", w.decision.Monsters)
	}
	return nil
}

func (w *stopWorld) hasReason(r records.MonsterReason) bool {
	for _, m := range w.decision.Monsters {
		if m.Reason == r {
			return true
		}
	}
	return false
}

func (w *stopWorld) rowRecordedWithVerdict(want string) error {
	if len(w.log.runs) == 0 {
		return fmt.Errorf("no completeness_runs row recorded")
	}
	last := w.log.runs[len(w.log.runs)-1]
	if string(last.Verdict) != want {
		return fmt.Errorf("recorded verdict = %q, want %q", last.Verdict, want)
	}
	return nil
}

func TestCompletenessStopFeatures(t *testing.T) {
	w := &stopWorld{}
	suite := godog.TestSuite{
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			sc.Before(func(ctx context.Context, _ *godog.Scenario) (context.Context, error) {
				w.reset()
				return ctx, nil
			})
			sc.Step(`^the mirrors schema holds typed Mirror records reflecting kernel layers at a version$`, w.mirrorsHoldRecords)
			sc.Step(`^a Stop event closes the current cut$`, w.stopClosesCut)
			sc.Step(`^a kernel layer that has no living mirror of any required test_kind$`, w.layerWithoutLivingMirror)
			sc.Step(`^a mirror whose reflects target no longer exists at that version$`, w.orphanMirror)
			sc.Step(`^every kernel layer has at least one living, executable, correctly-reflecting mirror$`, w.completeCut)
			sc.Step(`^the Stop hook runs the completeness check over mirrors joined to kernel$`, w.runHook)
			sc.Step(`^the verdict is "([^"]*)"$`, w.verdictIs)
			sc.Step(`^the BlockReason code is "([^"]*)"$`, w.blockCodeIs)
			sc.Step(`^the monster set reports the layer as no_truth_without_mirror with a how_to_fix$`, w.reportsLayerNoTruthWithHowToFix)
			sc.Step(`^the monster set reports the mirror as no_orphan_mirror$`, w.reportsMirrorOrphan)
			sc.Step(`^the monster set is empty$`, w.monsterSetEmpty)
			sc.Step(`^a completeness_runs row is recorded with verdict "([^"]*)"$`, w.rowRecordedWithVerdict)
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/mirror/completeness_stop.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("completeness_stop.feature scenarios failed")
	}
}

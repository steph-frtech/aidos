package deploy_test

// S96 — PHASE-KEYED DEPLOY INVARIANTS (property, rapid). N1.
// reflects=runtime.deploy · test_kind=property · liveness=live.
//
// Four properties:
//   - REPRODUCIBILITY: same Input → byte-identical DeployPlan (same id/URL/migration).
//   - RE-PROJECTION: the deployed-app hash EQUALS the phase's emitted-app hash (S94) — the
//     deployed artifact is re-projected from the phase, never a stale sandbox artifact; and
//     DeployedMatchesPhase accepts EXACTLY that hash and rejects every other.
//   - STOP-GATE: a non-stable phase (red cut ∨ mutation < threshold ∨ a monster) is ALWAYS
//     refused PHASE_NOT_STABLE and emits NO plan; a stable+passing-gate phase always deploys.
//   - CONTENT-ADDRESS SENSITIVITY: changing the phase, the surface, or the migration change
//     yields a different deploy id (no collision).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"github.com/steph-frtech/aidos/back/runtime/preview"
	"pgregory.net/rapid"
)

// genStableInput draws a deployable Input (a stable phase, a passing gate, a complete
// surface, an optional valid migration) parameterised by the project and a few surface hashes.
func genStableInput(t *rapid.T) deploy.Input {
	in := okInput()
	in.Surface.ServerBundleHash = "srv-" + rapid.StringMatching(`[a-z0-9]{3,8}`).Draw(t, "srv")
	in.Surface.FrontBundleHash = "fnt-" + rapid.StringMatching(`[a-z0-9]{3,8}`).Draw(t, "fnt")
	in.Surface.InfraHash = "inf-" + rapid.StringMatching(`[a-z0-9]{3,8}`).Draw(t, "inf")
	// Optionally carry no schema change.
	if rapid.Bool().Draw(t, "noChange") {
		in.Change = datamigrate.Change{}
	}
	// A passing gate with a random margin above the threshold.
	in.Gate.MutationThreshold = rapid.Float64Range(0.5, 0.9).Draw(t, "thr")
	in.Gate.MutationScore = in.Gate.MutationThreshold + rapid.Float64Range(0, 0.1).Draw(t, "margin")
	in.Gate.MonsterCount = 0
	return in
}

// TestReproducible: same Input → byte-identical DeployPlan.
func TestReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genStableInput(t)
		a, abr := deploy.BuildPlan(in)
		b, bbr := deploy.BuildPlan(in)
		if abr != nil || bbr != nil {
			t.Fatalf("a stable input must deploy: %v / %v", abr, bbr)
		}
		if a.ID != b.ID || a.URL != b.URL || a.EmittedAppHash != b.EmittedAppHash || a.Migration.ID != b.Migration.ID {
			t.Fatalf("deploy plan not reproducible:\n a=%+v\n b=%+v", a, b)
		}
	})
}

// TestReProjection: the deployed-app hash EQUALS the phase's emitted-app hash; the served-hash
// check accepts exactly that hash and rejects any other (no stale sandbox artifact).
func TestReProjection(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genStableInput(t)
		plan, br := deploy.BuildPlan(in)
		if br != nil {
			t.Fatalf("a stable input must deploy: %v", br)
		}
		phaseHash, err := in.Phase.Version()
		if err != nil {
			t.Fatalf("phase version: %v", err)
		}
		want, err := preview.EmittedAppHash(preview.PhaseRef{PhaseHash: phaseHash}, in.Surface)
		if err != nil {
			t.Fatalf("emitted app hash: %v", err)
		}
		if plan.EmittedAppHash != want {
			t.Fatalf("deployed artifact is NOT re-projected from the phase: got %q want %q", plan.EmittedAppHash, want)
		}
		// The served-hash equality accepts exactly the phase's app hash.
		if ok, b := deploy.DeployedMatchesPhase(plan, want); !ok {
			t.Fatalf("the phase's own app hash must match: %v", b)
		}
		// Any other served hash is a stale artifact → refused.
		stale := want + "x"
		if ok, b := deploy.DeployedMatchesPhase(plan, stale); ok || b == nil {
			t.Fatal("a stale served hash must be refused")
		}
	})
}

// TestStopGateAlwaysRefusesNonStable: a red cut, a sub-threshold mutation, or a monster ALWAYS
// refuses PHASE_NOT_STABLE and emits no plan.
func TestStopGateAlwaysRefusesNonStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := okInput()
		kind := rapid.IntRange(0, 2).Draw(t, "defect")
		switch kind {
		case 0:
			// A red sensor in the cut.
			in.Phase = phases.IsStable(
				phases.Cut{"x": "v1"}, nil, nil,
				[]phases.SensorStatus{{ID: "x.fixture", Pass: false}},
			)
		case 1:
			// Mutation strictly below threshold.
			in.Gate.MutationThreshold = 0.8
			in.Gate.MutationScore = rapid.Float64Range(0, 0.79).Draw(t, "below")
		case 2:
			// A present monster.
			in.Gate.MonsterCount = rapid.IntRange(1, 5).Draw(t, "monsters")
		}
		plan, br := deploy.BuildPlan(in)
		if br == nil {
			t.Fatalf("a non-stable phase must be refused, got plan %+v", plan)
		}
		if br.Code != blockreason.CodePhaseNotStable {
			t.Fatalf("expected PHASE_NOT_STABLE, got %s", br.Code)
		}
		if plan.ID != "" {
			t.Fatal("a refused deploy must emit no plan")
		}
	})
}

// TestContentAddressSensitivity: changing the phase, the surface, or the migration change
// yields a different deploy id (no collision).
func TestContentAddressSensitivity(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := okInput()
		basePlan, br := deploy.BuildPlan(base)
		if br != nil {
			t.Fatalf("base must deploy: %v", br)
		}

		// Different phase → different id (and different URL).
		alt := base
		alt.Phase = phases.IsStable(
			phases.Cut{"other": "v2"}, nil, nil,
			[]phases.SensorStatus{{ID: "other.fixture", Pass: true}},
		)
		altPlan, br := deploy.BuildPlan(alt)
		if br != nil {
			t.Fatalf("alt phase must deploy: %v", br)
		}
		if altPlan.ID == basePlan.ID {
			t.Fatal("a different phase must yield a different deploy id")
		}
		if altPlan.URL == basePlan.URL {
			t.Fatal("a different phase must yield a different deploy URL")
		}

		// Different surface → different id.
		surf := base
		surf.Surface.ServerBundleHash = base.Surface.ServerBundleHash + "z"
		surfPlan, br := deploy.BuildPlan(surf)
		if br != nil {
			t.Fatalf("alt surface must deploy: %v", br)
		}
		if surfPlan.ID == basePlan.ID {
			t.Fatal("a different surface must yield a different deploy id")
		}

		// Different migration change → different id.
		mig := base
		mig.Change = cardChange()
		migPlan, br := deploy.BuildPlan(mig)
		if br != nil {
			t.Fatalf("alt migration must deploy: %v", br)
		}
		if migPlan.ID == basePlan.ID {
			t.Fatal("a different migration must yield a different deploy id")
		}
	})
}

// TestForwardOnlyHolds: every deployed migration is forward-only (the property the gate guards).
func TestForwardOnlyHolds(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genStableInput(t)
		plan, br := deploy.BuildPlan(in)
		if br != nil {
			t.Fatalf("a stable input must deploy: %v", br)
		}
		if !deploy.MigrationIsForwardOnly(plan.Migration) {
			t.Fatalf("deployed migration is not forward-only: %+v", plan.Migration.Steps)
		}
	})
}

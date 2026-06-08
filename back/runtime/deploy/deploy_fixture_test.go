package deploy_test

// S96 — PHASE-KEYED DEPLOY WORKFLOW mirror (fixture, state → command → events). N2.
// reflects=runtime.deploy · test_kind=fixture · liveness=live.
//
// The fixture pins the DEPLOY workflows: a STABLE phase deploys (re-projected app + a
// forward-only migration), and the REFUSAL workflows — a NON-STABLE phase (red cut, a
// below-threshold mutation score, a present monster) is refused with PHASE_NOT_STABLE, a
// malformed surface is refused, a breaking-no-backfill migration is refused (delegated to
// S95). The events are the plan (URL, app hash, staged migration steps) + the verdict — a
// deterministic function of the input state.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

// --- builders: a stable phase, a passing gate, a complete surface, a valid migration. ---

func stablePhase() phases.StablePhase {
	// A non-empty cut with all sensors green ⇒ stable (no reasons). IsStable computes it.
	return phases.IsStable(
		phases.Cut{"createOrder": "v1"},
		nil,
		nil,
		[]phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
	)
}

func redPhase() phases.StablePhase {
	// A red sensor ⇒ unstable, with the red sensor named in Reasons.
	return phases.IsStable(
		phases.Cut{"createOrder": "v1"},
		nil,
		nil,
		[]phases.SensorStatus{{ID: "createOrder.fixture", Pass: false}},
	)
}

func passingGate() deploy.Gate {
	return deploy.Gate{MutationScore: 0.9, MutationThreshold: 0.8, MonsterCount: 0}
}

func surface() preview.EmittedSurface {
	return preview.EmittedSurface{
		Project:          "shop",
		ServerBundleHash: "srv-aaa",
		FrontBundleHash:  "fnt-bbb",
		InfraHash:        "inf-ccc",
		DatastoreHash:    "dat-ddd",
	}
}

func program() honoemit.Artifact {
	return honoemit.Artifact{
		Path:  "gen/shop/infra/index.ts",
		Bytes: []byte("// pulumi program"),
	}
}

func validScope() *db.DataTruthScope {
	return &db.DataTruthScope{
		AppliesTo: []db.AppliesTo{db.AppliesExistingRecords},
		Migration: db.Migration{Required: true, Strategy: db.StrategyExpandContract},
		Audit:     db.Audit{PreserveOldTruth: true},
	}
}

func renameChange() datamigrate.Change {
	return datamigrate.Change{
		Project: "shop", Kind: datamigrate.KindRename,
		Rename: &datamigrate.RenameChange{Entity: "order", From: "ref", To: "reference", Type: "text"},
		Scope:  validScope(),
	}
}

func cardChange() datamigrate.Change {
	return datamigrate.Change{
		Project: "shop", Kind: datamigrate.KindCardinality,
		Cardinality: &datamigrate.CardinalityChange{Source: "order", Target: "label", Relation: "tag", From: ref.OneToMany, To: ref.ManyToMany},
		Scope:       validScope(),
	}
}

func okInput() deploy.Input {
	return deploy.Input{
		Phase:   stablePhase(),
		Gate:    passingGate(),
		Surface: surface(),
		Program: program(),
		Change:  renameChange(),
	}
}

// --- the fixture table. ---

func TestDeployFixtures(t *testing.T) {
	// Lifecycle: a stable phase deploys with a forward-only migration.
	cases := []struct {
		name     string
		mutate   func(deploy.Input) deploy.Input
		wantOK   bool
		wantCode blockreason.Code
	}{
		{
			name:   "stable phase with migration deploys",
			mutate: func(in deploy.Input) deploy.Input { return in },
			wantOK: true,
		},
		{
			name: "stable phase, no schema change, deploys with empty migration",
			mutate: func(in deploy.Input) deploy.Input {
				in.Change = datamigrate.Change{}
				return in
			},
			wantOK: true,
		},
		{
			name: "stable phase with cardinality widening deploys",
			mutate: func(in deploy.Input) deploy.Input {
				in.Change = cardChange()
				return in
			},
			wantOK: true,
		},
		{
			name: "RED cut phase is refused PHASE_NOT_STABLE",
			mutate: func(in deploy.Input) deploy.Input {
				in.Phase = redPhase()
				return in
			},
			wantOK:   false,
			wantCode: blockreason.CodePhaseNotStable,
		},
		{
			name: "mutation below threshold is refused PHASE_NOT_STABLE",
			mutate: func(in deploy.Input) deploy.Input {
				in.Gate.MutationScore = 0.5 // < 0.8 threshold
				return in
			},
			wantOK:   false,
			wantCode: blockreason.CodePhaseNotStable,
		},
		{
			name: "a present monster is refused PHASE_NOT_STABLE",
			mutate: func(in deploy.Input) deploy.Input {
				in.Gate.MonsterCount = 1
				return in
			},
			wantOK:   false,
			wantCode: blockreason.CodePhaseNotStable,
		},
		{
			name: "breaking migration with no backfill is refused (delegated to S95)",
			mutate: func(in deploy.Input) deploy.Input {
				c := renameChange()
				c.Scope = nil
				in.Change = c
				return in
			},
			wantOK:   false,
			wantCode: blockreason.CodeBreakingMigrationNoBackfill,
		},
		{
			name: "malformed surface (no server bundle) is refused OUT_OF_SCOPE",
			mutate: func(in deploy.Input) deploy.Input {
				in.Surface.ServerBundleHash = ""
				return in
			},
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
		{
			name: "cross-project program is refused OUT_OF_SCOPE",
			mutate: func(in deploy.Input) deploy.Input {
				in.Program.Path = "gen/other/infra/index.ts"
				return in
			},
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := c.mutate(okInput())
			plan, br := deploy.BuildPlan(in)
			if c.wantOK {
				if br != nil {
					t.Fatalf("expected deploy to succeed, got block %s: %s", br.Code, br.Explanation)
				}
				if plan.ID == "" {
					t.Fatal("deploy plan has no content address")
				}
				if plan.EmittedAppHash == "" {
					t.Fatal("deploy plan has no emitted-app hash (the re-projection address)")
				}
				if !strings.HasPrefix(plan.URL, "https://d-") {
					t.Fatalf("deploy URL is not a per-phase deploy subdomain: %q", plan.URL)
				}
				// The migration (when present) is FORWARD-ONLY.
				if !deploy.MigrationIsForwardOnly(plan.Migration) {
					t.Fatalf("migration is not forward-only: %+v", plan.Migration.Steps)
				}
				return
			}
			if br == nil {
				t.Fatal("expected deploy to be refused, got a plan")
			}
			if br.Code != c.wantCode {
				t.Fatalf("expected refusal code %s, got %s (%s)", c.wantCode, br.Code, br.Explanation)
			}
			if len(br.HowToFix) == 0 {
				t.Fatal("refusal has no how_to_fix path")
			}
		})
	}
}

// The PHASE_NOT_STABLE refusal NAMES the offending reason (the red sensor id).
func TestRefusalNamesTheRedMirror(t *testing.T) {
	in := okInput()
	in.Phase = redPhase()
	_, br := deploy.BuildPlan(in)
	if br == nil || br.Code != blockreason.CodePhaseNotStable {
		t.Fatalf("expected PHASE_NOT_STABLE, got %+v", br)
	}
	if !strings.Contains(br.Explanation, "createOrder.fixture") {
		t.Fatalf("refusal does not name the red mirror: %q", br.Explanation)
	}
}

// The migration runs FORWARD-ONLY: expand → backfill → contract, no backward step.
func TestMigrationIsForwardOnly(t *testing.T) {
	plan, br := deploy.BuildPlan(okInput())
	if br != nil {
		t.Fatalf("unexpected block: %s", br.Explanation)
	}
	wantOrder := []string{"expand", "backfill", "contract"}
	var got []string
	for _, s := range plan.Migration.Steps {
		got = append(got, s.Stage)
	}
	if strings.Join(got, ",") != strings.Join(wantOrder, ",") {
		t.Fatalf("migration stages not forward-only expand→backfill→contract: %v", got)
	}
	if !plan.Migration.PreservesAllData {
		t.Fatal("forward-only migration must preserve all data (backfill before contract)")
	}
}

package datamigrate_test

// S95 — data-migration WORKFLOW mirror (fixture, state → command → events). N2.
// reflects=runtime.datamigrate · test_kind=fixture · liveness=live.
//
// The fixture pins the EXPAND → BACKFILL → CONTRACT lifecycle of each hard case and the
// REFUSAL workflows (breaking-no-backfill, unknown strategy, malformed change). The events
// are the staged steps + the verdict — a deterministic function of the input state.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
)

func validScope() *db.DataTruthScope {
	return &db.DataTruthScope{
		AppliesTo: []db.AppliesTo{db.AppliesExistingRecords},
		Migration: db.Migration{Required: true, Strategy: db.StrategyExpandContract},
		Audit:     db.Audit{PreserveOldTruth: true},
	}
}

type dmFixture struct {
	name     string
	change   datamigrate.Change
	wantOK   bool
	wantSt   []string         // expected stage sequence when accepted
	wantCode blockreason.Code // expected refusal code when refused
}

func TestDataMigrateFixtures(t *testing.T) {
	rename := datamigrate.Change{
		Project: "shop", Kind: datamigrate.KindRename,
		Rename: &datamigrate.RenameChange{Entity: "order", From: "ref", To: "reference", Type: "text"},
		Scope:  validScope(),
	}
	split := datamigrate.Change{
		Project: "shop", Kind: datamigrate.KindSplit,
		Split: &datamigrate.SplitChange{Source: "order", NewEntity: "shipment", Column: "address", Type: "text"},
		Scope: validScope(),
	}
	card := datamigrate.Change{
		Project: "shop", Kind: datamigrate.KindCardinality,
		Cardinality: &datamigrate.CardinalityChange{Source: "order", Target: "label", Relation: "tag", From: ref.OneToMany, To: ref.ManyToMany},
		Scope:       validScope(),
	}

	// Refusal: breaking with no backfill.
	noBackfill := rename
	noBackfill.Scope = nil

	// Refusal: unknown migration strategy (the §44.3 closed-set gate fires).
	badStrat := rename
	bs := *validScope()
	bs.Migration.Strategy = "teleport"
	badStrat.Scope = &bs

	// Refusal: malformed change (cardinality not widening).
	malformed := datamigrate.Change{
		Project: "shop", Kind: datamigrate.KindCardinality,
		Cardinality: &datamigrate.CardinalityChange{Source: "order", Target: "label", Relation: "tag", From: ref.OneToOne, To: ref.ManyToMany},
		Scope:       validScope(),
	}

	// Refusal: no project.
	noProject := rename
	noProject.Project = ""

	fixtures := []dmFixture{
		{"rename lifecycle", rename, true, []string{"expand", "backfill", "contract"}, ""},
		{"split lifecycle", split, true, []string{"expand", "backfill", "contract"}, ""},
		{"cardinality lifecycle", card, true, []string{"expand", "backfill", "contract"}, ""},
		{"breaking no backfill refused", noBackfill, false, nil, blockreason.CodeBreakingMigrationNoBackfill},
		{"unknown strategy refused", badStrat, false, nil, blockreason.CodeUnknownMigrationStrategy},
		{"malformed change refused", malformed, false, nil, blockreason.CodeOutOfScope},
		{"no project refused", noProject, false, nil, blockreason.CodeOutOfScope},
	}

	for _, f := range fixtures {
		t.Run(f.name, func(t *testing.T) {
			plan, br := datamigrate.Build(f.change)
			if f.wantOK {
				if br != nil {
					t.Fatalf("%s: expected acceptance, got %s", f.name, br.Code)
				}
				if len(plan.Steps) != len(f.wantSt) {
					t.Fatalf("%s: want %d steps, got %d", f.name, len(f.wantSt), len(plan.Steps))
				}
				for i, st := range f.wantSt {
					if plan.Steps[i].Stage != st {
						t.Fatalf("%s: step %d = %q, want %q", f.name, i, plan.Steps[i].Stage, st)
					}
				}
				if !plan.PreservesAllData {
					t.Fatalf("%s: plan does not preserve all data", f.name)
				}
				if !plan.MigrationRequired {
					t.Fatalf("%s: migration_required should be true for a breaking change", f.name)
				}
				if plan.ID == "" {
					t.Fatalf("%s: plan has no content address", f.name)
				}
			} else {
				if br == nil {
					t.Fatalf("%s: expected refusal, got a plan %+v", f.name, plan)
				}
				if br.Code != f.wantCode {
					t.Fatalf("%s: refusal code = %q, want %q", f.name, br.Code, f.wantCode)
				}
				if len(br.HowToFix) == 0 {
					t.Fatalf("%s: BlockReason has empty how_to_fix (the prison)", f.name)
				}
			}
		})
	}
}

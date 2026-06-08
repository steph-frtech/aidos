package datamigrate_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
)

// Acceptance mirror runner (Godog, N0): drives tests/runtime/datamigrate.feature against
// the in-process data-migration planner. reflects=runtime.datamigrate · test_kind=gherkin ·
// cert_language=godog · authority=above · liveness=live. The planner writes nothing (the
// wall): Build returns a Plan or a typed BlockReason.

// backfillScope is a valid declared backfill DataTruthScope (required, known strategy,
// preserve_old_truth) — the gate that lets a breaking change proceed.
func backfillScope() *db.DataTruthScope {
	return &db.DataTruthScope{
		AppliesTo: []db.AppliesTo{db.AppliesExistingRecords},
		Migration: db.Migration{Required: true, Strategy: db.StrategyExpandContract},
		Audit:     db.Audit{PreserveOldTruth: true},
	}
}

type dmState struct {
	change datamigrate.Change
	plan   datamigrate.Plan
	plan2  datamigrate.Plan
	block  *struct{ code, fix string }
}

func TestDataMigrateBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "datamigrate",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &dmState{}

			sc.Step(`^a deployed app "([^"]*)" with real rows$`, func(p string) error {
				st.change.Project = p
				return nil
			})
			sc.Step(`^a rename of column "([^"]*)" to "([^"]*)" on entity "([^"]*)" of type "([^"]*)"$`,
				func(from, to, entity, typ string) error {
					st.change.Kind = datamigrate.KindRename
					st.change.Rename = &datamigrate.RenameChange{Entity: entity, From: from, To: to, Type: typ}
					return nil
				})
			sc.Step(`^a split moving column "([^"]*)" from entity "([^"]*)" into entity "([^"]*)" of type "([^"]*)"$`,
				func(col, src, ne, typ string) error {
					st.change.Kind = datamigrate.KindSplit
					st.change.Split = &datamigrate.SplitChange{Source: src, NewEntity: ne, Column: col, Type: typ}
					return nil
				})
			sc.Step(`^a cardinality widening of relation "([^"]*)" from "([^"]*)" to "([^"]*)" between "([^"]*)" and "([^"]*)"$`,
				func(rel, from, to, src, tgt string) error {
					st.change.Kind = datamigrate.KindCardinality
					st.change.Cardinality = &datamigrate.CardinalityChange{
						Source: src, Target: tgt, Relation: rel,
						From: ref.Cardinality(from), To: ref.Cardinality(to),
					}
					return nil
				})
			sc.Step(`^a declared backfill DataTruthScope$`, func() error {
				st.change.Scope = backfillScope()
				return nil
			})
			sc.Step(`^no declared backfill DataTruthScope$`, func() error {
				st.change.Scope = nil
				return nil
			})

			build := func() error {
				plan, br := datamigrate.Build(st.change)
				if br != nil {
					st.block = &struct{ code, fix string }{string(br.Code), strings.Join(br.HowToFix, " | ")}
					return nil
				}
				st.plan = plan
				st.block = nil
				return nil
			}
			sc.Step(`^I build the data-migration plan$`, build)
			sc.Step(`^I build the data-migration plan twice$`, func() error {
				if err := build(); err != nil {
					return err
				}
				p2, br := datamigrate.Build(st.change)
				if br != nil {
					return fmt.Errorf("second build refused: %v", br)
				}
				st.plan2 = p2
				return nil
			})

			sc.Step(`^the plan stages expand then backfill then contract$`, func() error {
				if len(st.plan.Steps) != 3 {
					return fmt.Errorf("want 3 steps, got %d", len(st.plan.Steps))
				}
				want := []string{"expand", "backfill", "contract"}
				for i, s := range st.plan.Steps {
					if s.Stage != want[i] {
						return fmt.Errorf("step %d stage = %q, want %q", i, s.Stage, want[i])
					}
				}
				return nil
			})
			sc.Step(`^the backfill step recopies the old column into the new$`, func() error {
				sql := st.plan.Steps[1].SQL
				if !strings.Contains(sql, "UPDATE") || !strings.Contains(strings.ToLower(sql), "reference") {
					return fmt.Errorf("backfill SQL does not recopy: %q", sql)
				}
				return nil
			})
			sc.Step(`^the backfill step ventilates the source rows into the new table$`, func() error {
				sql := st.plan.Steps[1].SQL
				if !strings.Contains(sql, "INSERT INTO") || !strings.Contains(sql, "SELECT") {
					return fmt.Errorf("backfill SQL does not ventilate: %q", sql)
				}
				return nil
			})
			sc.Step(`^the backfill step fills the join table from the existing foreign keys$`, func() error {
				sql := st.plan.Steps[1].SQL
				if !strings.Contains(sql, "INSERT INTO") || !strings.Contains(strings.ToLower(sql), "order_label") {
					return fmt.Errorf("backfill SQL does not fill the join table: %q", sql)
				}
				return nil
			})
			sc.Step(`^the plan preserves all data$`, func() error {
				if !st.plan.PreservesAllData {
					return fmt.Errorf("plan does not preserve all data")
				}
				return nil
			})

			sc.Step(`^the plan is refused with code "([^"]*)"$`, func(code string) error {
				if st.block == nil {
					return fmt.Errorf("plan was not refused")
				}
				if st.block.code != code {
					return fmt.Errorf("refusal code = %q, want %q", st.block.code, code)
				}
				return nil
			})
			sc.Step(`^how_to_fix names the declared backfill$`, func() error {
				if st.block == nil || !strings.Contains(strings.ToLower(st.block.fix), "backfill") {
					return fmt.Errorf("how_to_fix %v does not name the backfill", st.block)
				}
				return nil
			})
			sc.Step(`^both plans share the same id$`, func() error {
				if st.plan.ID != st.plan2.ID {
					return fmt.Errorf("plan ids differ: %q vs %q", st.plan.ID, st.plan2.ID)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../tests/runtime/datamigrate.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("datamigrate acceptance mirror failed")
	}
}

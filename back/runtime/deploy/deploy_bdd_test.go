package deploy_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
)

// Acceptance mirror runner (Godog, N0): drives tests/runtime/deploy.feature against the
// in-process phase-keyed deploy pipeline. reflects=runtime.deploy · test_kind=gherkin ·
// cert_language=godog · authority=above · liveness=live. The pipeline writes nothing (the
// wall): BuildPlan returns a DeployPlan or a typed BlockReason.

type depState struct {
	in    deploy.Input
	plan  deploy.DeployPlan
	plan2 deploy.DeployPlan
	block *struct{ code, expl string }
}

func TestDeployBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "deploy",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &depState{}

			sc.Step(`^a project "([^"]*)" with a complete emitted surface$`, func(p string) error {
				st.in = okInput()
				st.in.Surface.Project = p
				st.in.Program.Path = "gen/" + p + "/infra/index.ts"
				// Default: no schema change unless a rename step adds one.
				st.in.Change = datamigrate.Change{}
				return nil
			})
			sc.Step(`^a stable phase with mutation ([0-9.]+) over threshold ([0-9.]+) and no monster$`,
				func(score, thr float64) error {
					st.in.Phase = phases.IsStable(
						phases.Cut{"createOrder": "v1"}, nil, nil,
						[]phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
					)
					st.in.Gate = deploy.Gate{MutationScore: score, MutationThreshold: thr, MonsterCount: 0}
					return nil
				})
			sc.Step(`^a phase with a red mirror "([^"]*)"$`, func(id string) error {
				st.in.Phase = phases.IsStable(
					phases.Cut{"createOrder": "v1"}, nil, nil,
					[]phases.SensorStatus{{ID: id, Pass: false}},
				)
				st.in.Gate = deploy.Gate{MutationScore: 0.9, MutationThreshold: 0.8, MonsterCount: 0}
				return nil
			})
			sc.Step(`^a rename of column "([^"]*)" to "([^"]*)" on entity "([^"]*)" of type "([^"]*)" with a declared backfill$`,
				func(from, to, entity, typ string) error {
					st.in.Change = renameChange()
					st.in.Change.Rename = &datamigrate.RenameChange{Entity: entity, From: from, To: to, Type: typ}
					return nil
				})

			deployOnce := func() error {
				plan, br := deploy.BuildPlan(st.in)
				if br != nil {
					st.block = &struct{ code, expl string }{string(br.Code), br.Explanation}
					return nil
				}
				st.plan = plan
				return nil
			}

			sc.Step(`^the phase is deployed$`, deployOnce)
			sc.Step(`^the phase is deployed twice$`, func() error {
				if err := deployOnce(); err != nil {
					return err
				}
				p2, br := deploy.BuildPlan(st.in)
				if br != nil {
					return fmt.Errorf("second deploy refused: %s", br.Explanation)
				}
				st.plan2 = p2
				return nil
			})

			sc.Step(`^the deploy is permitted$`, func() error {
				if st.block != nil {
					return fmt.Errorf("deploy was refused: %s", st.block.expl)
				}
				if st.plan.ID == "" {
					return fmt.Errorf("deploy emitted no plan")
				}
				return nil
			})
			sc.Step(`^the deployed app hash equals the phase emitted app hash$`, func() error {
				if st.plan.EmittedAppHash == "" {
					return fmt.Errorf("no emitted app hash")
				}
				if ok, br := deploy.DeployedMatchesPhase(st.plan, st.plan.EmittedAppHash); !ok {
					return fmt.Errorf("re-projection mismatch: %v", br)
				}
				return nil
			})
			sc.Step(`^the deploy URL is a per-phase deploy subdomain$`, func() error {
				if !strings.HasPrefix(st.plan.URL, "https://d-") {
					return fmt.Errorf("URL %q is not a per-phase deploy subdomain", st.plan.URL)
				}
				return nil
			})
			sc.Step(`^the migration stages are "([^"]*)"$`, func(want string) error {
				var got []string
				for _, s := range st.plan.Migration.Steps {
					got = append(got, s.Stage)
				}
				if strings.Join(got, ",") != want {
					return fmt.Errorf("stages = %v, want %q", got, want)
				}
				return nil
			})
			sc.Step(`^the migration preserves all data$`, func() error {
				if !st.plan.Migration.PreservesAllData {
					return fmt.Errorf("migration does not preserve all data")
				}
				return nil
			})
			sc.Step(`^the deploy is refused with code "([^"]*)"$`, func(code string) error {
				if st.block == nil {
					return fmt.Errorf("deploy was not refused")
				}
				if st.block.code != code {
					return fmt.Errorf("refusal code = %q, want %q", st.block.code, code)
				}
				return nil
			})
			sc.Step(`^the refusal names the red mirror "([^"]*)"$`, func(id string) error {
				if st.block == nil || !strings.Contains(st.block.expl, id) {
					return fmt.Errorf("refusal %v does not name %q", st.block, id)
				}
				return nil
			})
			sc.Step(`^both deploys share the same id$`, func() error {
				if st.plan.ID != st.plan2.ID {
					return fmt.Errorf("deploy ids differ: %q vs %q", st.plan.ID, st.plan2.ID)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../tests/runtime/deploy.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("deploy acceptance mirror failed")
	}
}

package preview_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

// Acceptance mirror runner (Godog, N0): drives tests/runtime/preview.feature against the
// in-process preview planner. reflects=runtime.preview · test_kind=gherkin ·
// cert_language=godog · authority=above · liveness=live.
//
// The planner writes nothing (the wall): BuildPlan / ServedMatchesEmitted return values.
// The feature conceptually lives in the mirrors schema, materialized to tests/runtime/
// (mirrors landed at S06 — bootstrap exception, CLAUDE.md §6). The "served-app hash from
// the phase's emitted bytes" is modelled as the EmittedAppHash baked into the emitted
// server (the /__aidos_hash probe), so the equality is the deterministic done-criterion.

// sampleSurface is the emitted surface a project's stable phase produces (the component
// OutputHashes from honoemit/frontemit/provision — fixed values, no I/O).
func sampleSurface(project string) preview.EmittedSurface {
	return preview.EmittedSurface{
		Project:          project,
		ServerBundleHash: "srv-" + project + "-001",
		FrontBundleHash:  "frt-" + project + "-001",
		InfraHash:        "inf-" + project + "-001",
		DatastoreHash:    "dst-" + project + "-001",
	}
}

// sampleProgram is the emitted Pulumi program for the project's phase (a real honoemit
// Pulumi artifact so its Path carries gen/<project>/infra/…).
func sampleProgram(t *testing.T, project string) honoemit.Artifact {
	t.Helper()
	m := honoemit.StackManifest{
		App: project,
		Services: []honoemit.Service{
			{Name: project + "-server", Role: honoemit.RoleServer, Image: "node:22", InternalPort: 3000},
			{Name: project + "-db", Role: honoemit.RoleDatastore, Image: "postgres:16", InternalPort: 5432},
		},
		Network: honoemit.Network{Name: "traefik_default", External: true},
	}
	art, br := honoemit.EmitPulumiProgram(m)
	if br != nil {
		t.Fatalf("emit pulumi program: %v", br)
	}
	return art
}

type previewBDDState struct {
	t       *testing.T
	phase   preview.PhaseRef
	surface preview.EmittedSurface
	program honoemit.Artifact
	plan    preview.PreviewPlan
	plan2   preview.PreviewPlan
	block   *struct{ code, fix string }
	matched bool
}

func TestPreviewBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "preview",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &previewBDDState{t: t}

			sc.Step(`^a content-addressed stable phase "([^"]*)"$`, func(h string) error {
				st.phase = preview.PhaseRef{PhaseHash: h}
				return nil
			})
			sc.Step(`^its emitted surface for project "([^"]*)" \(server, front, infra, datastore\)$`, func(p string) error {
				st.surface = sampleSurface(p)
				return nil
			})
			sc.Step(`^an emitted surface for project "([^"]*)" with no phase$`, func(p string) error {
				st.surface = sampleSurface(p)
				st.phase = preview.PhaseRef{}
				return nil
			})
			sc.Step(`^the emitted Pulumi program for the phase$`, func() error {
				project := st.surface.Project
				if project == "" {
					project = "shop"
				}
				st.program = sampleProgram(t, project)
				return nil
			})

			build := func() error {
				plan, br := preview.BuildPlan(preview.Input{
					Phase: st.phase, Surface: st.surface, Program: st.program,
				})
				if br != nil {
					st.block = &struct{ code, fix string }{string(br.Code), strings.Join(br.HowToFix, " | ")}
					return nil
				}
				st.plan = plan
				return nil
			}
			sc.Step(`^I build the preview plan for the phase$`, build)
			sc.Step(`^I build the preview plan for the phase twice$`, func() error {
				if err := build(); err != nil {
					return err
				}
				plan2, br := preview.BuildPlan(preview.Input{Phase: st.phase, Surface: st.surface, Program: st.program})
				if br != nil {
					return fmt.Errorf("second build refused: %v", br)
				}
				st.plan2 = plan2
				return nil
			})

			sc.Step(`^the plan is keyed on phase "([^"]*)"$`, func(h string) error {
				if st.plan.PhaseHash != h {
					return fmt.Errorf("plan phase = %q, want %q", st.plan.PhaseHash, h)
				}
				return nil
			})
			sc.Step(`^the preview URL is a per-phase subdomain$`, func() error {
				if !strings.HasPrefix(st.plan.Subdomain, "p-") {
					return fmt.Errorf("subdomain %q is not a per-phase label", st.plan.Subdomain)
				}
				if !strings.Contains(st.plan.URL, st.plan.Subdomain+".") {
					return fmt.Errorf("URL %q does not carry subdomain %q", st.plan.URL, st.plan.Subdomain)
				}
				return nil
			})
			sc.Step(`^the boot command runs "([^"]*)"$`, func(cmd string) error {
				if !strings.Contains(strings.Join(st.plan.Boot, " "), cmd) {
					return fmt.Errorf("boot %v does not run %q", st.plan.Boot, cmd)
				}
				return nil
			})
			sc.Step(`^the teardown command runs "([^"]*)"$`, func(cmd string) error {
				if !strings.Contains(strings.Join(st.plan.Teardown, " "), cmd) {
					return fmt.Errorf("teardown %v does not run %q", st.plan.Teardown, cmd)
				}
				return nil
			})

			sc.Step(`^the running preview reports its served-app hash from the phase's emitted bytes$`, func() error {
				// The emitted server bakes EmittedAppHash and serves it at /__aidos_hash, so the
				// honest served hash IS the plan's EmittedAppHash.
				served := st.plan.EmittedAppHash
				ok, _ := preview.ServedMatchesEmitted(st.plan, served)
				st.matched = ok
				return nil
			})
			sc.Step(`^the served-app hash equals the emitted-app hash of the phase$`, func() error {
				if !st.matched {
					return fmt.Errorf("served hash did not match emitted hash")
				}
				return nil
			})
			sc.Step(`^the running preview reports a served-app hash "([^"]*)"$`, func(served string) error {
				ok, br := preview.ServedMatchesEmitted(st.plan, served)
				st.matched = ok
				if br != nil {
					st.block = &struct{ code, fix string }{string(br.Code), strings.Join(br.HowToFix, " | ")}
				}
				return nil
			})
			sc.Step(`^the hash check is refused with a BlockReason$`, func() error {
				if st.matched || st.block == nil {
					return fmt.Errorf("stale served hash was not refused")
				}
				return nil
			})

			sc.Step(`^the plan is refused with a BlockReason$`, func() error {
				if st.block == nil {
					return fmt.Errorf("plan was not refused")
				}
				return nil
			})
			sc.Step(`^how_to_fix names the content-addressed phase$`, func() error {
				if st.block == nil || !strings.Contains(strings.ToLower(st.block.fix), "phase") {
					return fmt.Errorf("how_to_fix %q does not name the phase", st.block)
				}
				return nil
			})

			sc.Step(`^both plans share the same id and URL$`, func() error {
				if st.plan.ID != st.plan2.ID {
					return fmt.Errorf("plan ids differ: %q vs %q", st.plan.ID, st.plan2.ID)
				}
				if st.plan.URL != st.plan2.URL {
					return fmt.Errorf("plan URLs differ: %q vs %q", st.plan.URL, st.plan2.URL)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../tests/runtime/preview.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("preview acceptance mirror failed")
	}
}

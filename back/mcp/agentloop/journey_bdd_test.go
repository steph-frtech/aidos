// journey_bdd_test.go — the BA19 JOURNEY mirror runner (Godog, N0). It drives
// tests/runtime/agentloop-journey.feature against the in-process agentloop MCP server
// handlers (drive + watch) — the WHOLE mono-agent loop through the capability door, with
// the deterministic scripted provider. reflects=runtime.agentloop · test_kind=acceptance ·
// cert_language=godog · authority=below · liveness=live. Conceptually in the mirrors schema,
// materialized to tests/ for the runner (bootstrap exception, CLAUDE.md §6).
//
// It is RED before the server existed; it is a MEANS-test toward the human red (a governed
// run that closes a goal without ever writing truth), never a new truth.
package main

import (
	"context"
	"fmt"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

type journeyState struct {
	srv      *server
	in       driveInput
	driveOut driveOutput
	watchOut watchOutput
	drove    bool
}

func TestAgentloopJourneyBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "agentloop-journey",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &journeyState{srv: newServer()}

			// the in.* fields the scenarios fill — start from a known-good drive call shape.
			baseIn := func() driveInput {
				return driveInput{
					LayerRef:     "agent:builder@v1",
					RedWorkItem:  "redset:checkout#1",
					ContextPack:  "pack-checkout",
					GoalID:       "g-checkout",
					TargetServer: "mirror-runner",
					TargetTool:   "run_mirror",
					StartedAt:    "2026-06-03T10:00:00Z",
					EndedAt:      "2026-06-03T10:05:00Z",
				}
			}

			sc.Step(`^a governed agent implementation "([^"]*)" with the target tool bound$`, func(ref string) error {
				st.in = baseIn()
				st.in.LayerRef = ref
				return nil
			})

			sc.Step(`^a red work item "([^"]*)" on goal "([^"]*)" with one red mirror$`, func(item, g string) error {
				st.in.RedWorkItem = item
				st.in.GoalID = g
				return nil
			})

			sc.Step(`^a scripted session that writes the allowed projection then runs the mirror green$`, func() error {
				st.in.Scenario = ScenarioHappy
				return nil
			})
			sc.Step(`^a scripted session whose first turn attempts a write to the "([^"]*)" schema$`, func(schema string) error {
				if schema != "kernel" {
					return fmt.Errorf("journey models the kernel-write scenario; got schema %q", schema)
				}
				st.in.Scenario = ScenarioKernelWrite
				return nil
			})
			sc.Step(`^a scripted session whose turn costs exceed the declared budget$`, func() error {
				st.in.Scenario = ScenarioOverBudget
				return nil
			})

			drive := func() error {
				_, out, err := st.srv.drive(context.Background(), nil, st.in)
				if err != nil {
					return err
				}
				st.driveOut = out
				st.drove = true
				return nil
			}
			sc.Step(`^the loop drives the run through agentloop\.drive$`, drive)
			sc.Step(`^the loop drove the run through agentloop\.drive$`, drive)

			sc.Step(`^the run is watched through agentloop\.watch$`, func() error {
				_, out, err := st.srv.watch(context.Background(), nil, watchInput{
					LayerRef:     st.in.LayerRef,
					RedWorkItem:  st.in.RedWorkItem,
					ContextPack:  st.in.ContextPack,
					Scenario:     st.in.Scenario,
					GoalID:       st.in.GoalID,
					TargetServer: st.in.TargetServer,
					TargetTool:   st.in.TargetTool,
					StartedAt:    st.in.StartedAt,
					EndedAt:      st.in.EndedAt,
				})
				if err != nil {
					return err
				}
				st.watchOut = out
				return nil
			})

			sc.Step(`^the run result is "([^"]*)"$`, func(want string) error {
				if st.driveOut.Refused {
					return fmt.Errorf("run was refused at the boundary: %+v", st.driveOut.BlockReason)
				}
				if st.driveOut.Run == nil {
					return fmt.Errorf("no run recorded")
				}
				if got := string(st.driveOut.Run.Result); got != want {
					return fmt.Errorf("result = %q, want %q", got, want)
				}
				return nil
			})

			sc.Step(`^every recorded action is authorised$`, func() error {
				if st.driveOut.Run == nil {
					return fmt.Errorf("no run")
				}
				for i, a := range st.driveOut.Run.Actions {
					if !a.Autorisee {
						return fmt.Errorf("action %d not authorised: %+v", i, a.RaisonBlocage)
					}
				}
				return nil
			})

			sc.Step(`^the run wrote no truth above the waterline$`, func() error {
				if st.driveOut.Run == nil {
					return fmt.Errorf("no run")
				}
				// The wall: no AUTHORISED action targets an above-waterline zone. A refused
				// kernel write is fine (the wall held); an AUTHORISED one would be a breach.
				for i, a := range st.driveOut.Run.Actions {
					if a.Autorisee && isAboveWaterline(a.Cible) {
						return fmt.Errorf("action %d wrote truth above the waterline: %q", i, a.Cible)
					}
				}
				// And the run type itself cannot carry a version/mirror (agentrun makes that
				// unrepresentable) — nothing further to assert.
				return nil
			})

			sc.Step(`^the run records the agent identity "([^"]*)" and the work item "([^"]*)"$`, func(_, item string) error {
				if st.driveOut.Run == nil {
					return fmt.Errorf("no run")
				}
				if st.driveOut.Run.RedWorkItem != item {
					return fmt.Errorf("red_work_item = %q, want %q", st.driveOut.Run.RedWorkItem, item)
				}
				if st.driveOut.Run.Agent == "" {
					return fmt.Errorf("run records no agent identity")
				}
				return nil
			})

			sc.Step(`^one recorded action is refused with BlockReason code "([^"]*)"$`, func(code string) error {
				if st.driveOut.Run == nil {
					return fmt.Errorf("no run")
				}
				for _, a := range st.driveOut.Run.Actions {
					if !a.Autorisee && a.RaisonBlocage != nil && string(a.RaisonBlocage.Code) == code {
						return nil
					}
				}
				return fmt.Errorf("no refused action carrying %q; actions=%+v", code, st.driveOut.Run.Actions)
			})

			sc.Step(`^the watched timeline lists every recorded action in order$`, func() error {
				if st.driveOut.Run == nil {
					return fmt.Errorf("no run to compare")
				}
				if len(st.watchOut.Timeline) != len(st.driveOut.Run.Actions) {
					return fmt.Errorf("timeline len %d != run actions %d", len(st.watchOut.Timeline), len(st.driveOut.Run.Actions))
				}
				for i, e := range st.watchOut.Timeline {
					if e.Index != i {
						return fmt.Errorf("entry %d has index %d", i, e.Index)
					}
					if e.Cible != st.driveOut.Run.Actions[i].Cible {
						return fmt.Errorf("entry %d cible %q != %q", i, e.Cible, st.driveOut.Run.Actions[i].Cible)
					}
				}
				return nil
			})

			sc.Step(`^the watched result is "([^"]*)"$`, func(want string) error {
				if st.watchOut.Result != want {
					return fmt.Errorf("watched result = %q, want %q", st.watchOut.Result, want)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/agentloop-journey.feature"},
			TestingT: t,
			Strict:   true,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("agentloop journey mirror failed")
	}
}

// isAboveWaterline is the test's local zone check: a target whose first path segment is a
// truth schema/prefix is above the line. It mirrors the wall's deny-list conceptually (the
// authoritative classifier is wall.Classify in the gate); here it asserts the LEDGER carries
// no authorised truth write.
func isAboveWaterline(cible string) bool {
	for _, z := range []string{"kernel", "mirrors", "fitness", "back/kernel", "back/migrations"} {
		if cible == z || hasPrefixSeg(cible, z) {
			return true
		}
	}
	return false
}

func hasPrefixSeg(s, p string) bool {
	return len(s) >= len(p) && s[:len(p)] == p && (len(s) == len(p) || s[len(p)] == '/')
}

// compile-time guards that the codes the feature names exist (single-sourced).
var _ = blockreason.CodeAgentWriteAboveWaterline
var _ = agentrun.ResultGreen

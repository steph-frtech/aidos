package goalpiloting_test

import (
	"fmt"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"github.com/steph-frtech/aidos/back/runtime/goalpiloting"
)

// Acceptance mirror runner (Godog, N0) for S66 — the UI-piloted /goal. Drives
// tests/runtime/goal-piloting.feature against the in-process engine.
// reflects=runtime.goalpiloting · test_kind=gherkin · cert_language=godog · authority=above
// · liveness=live. The engine writes nothing (the wall): it returns values; the feature
// conceptually lives in the mirrors schema, materialized to tests/ (bootstrap exception).

type pilotBDDState struct {
	actor   goalpiloting.Actor
	idea    goal.Idea
	in      goalpiloting.OpenInput
	result  goalpiloting.PilotResult
	openErr *goalpiloting.PilotBlock
	g       goalpiloting.Goal
	closeBR *goalpiloting.PilotBlock
}

// reddeningOpenInput reuses S29/S22's canonical reddening artifacts (idea-order-discount /
// Order.discount / Order.discount.fixture) so the red set is the REAL derived one, no new id.
func reddeningOpenInput(idea goal.Idea) goalpiloting.OpenInput {
	return goalpiloting.OpenInput{
		Idea:        idea,
		ParentPhase: "phase-0",
		Bumped:      []string{"Order.discount"},
		Edges: []goal.Edge{{
			Link: links.Link{
				Kind: "reflects",
				From: links.Ref{ID: "Order.discount.fixture", Version: "m1"},
				To:   links.Ref{ID: "Order.discount", Version: "v1"},
			},
			LoadBearing: true,
		}},
		Heads:   links.Heads{"Order.discount": "v2"},
		Budgets: goal.Budgets{TimeSeconds: 600, Turns: 20, Tokens: 100000},
	}
}

func TestGoalPilotingBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "goal-piloting",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &pilotBDDState{}

			sc.Step(`^un acteur réel "([^"]*)" affiché "([^"]*)"$`, func(id, display string) error {
				st.actor = goalpiloting.Actor{Identity: id, Display: display}
				return nil
			})

			sc.Step(`^une idée grilled "([^"]*)" avec son mirror_delta$`, func(_ string) error {
				st.idea = goal.Idea{
					ID:          "idea-order-discount",
					SpecDelta:   changeset.Delta{Kind: "add", Target: "Order.discount"},
					MirrorDelta: &changeset.Delta{Kind: "add", Target: "Order.discount.fixture"},
				}
				st.in = reddeningOpenInput(st.idea)
				return nil
			})

			sc.Step(`^une idée grilled "([^"]*)" sans mirror_delta$`, func(_ string) error {
				st.idea = goal.Idea{
					ID:        "idea-no-mirror",
					SpecDelta: changeset.Delta{Kind: "add", Target: "Order.discount"},
				}
				st.in = reddeningOpenInput(st.idea)
				return nil
			})

			sc.Step(`^cet acteur ouvre un /goal depuis cette idée$`, func() error {
				st.result, st.openErr = goalpiloting.PilotOpenGoal(st.actor, st.in)
				return nil
			})

			sc.Step(`^un ChangeSet DRAFT est proposé portant le spec_delta ET le mirror_delta$`, func() error {
				if st.openErr != nil {
					return fmt.Errorf("ouverture refusée: %s", st.openErr.Error())
				}
				cs := st.result.Goal.ChangeSet
				if cs.Status != changeset.StatusDraft {
					return fmt.Errorf("changeset status = %q, want DRAFT", cs.Status)
				}
				if cs.SpecDelta == nil || cs.MirrorDelta == nil {
					return fmt.Errorf("le ChangeSet DRAFT doit porter spec_delta ET mirror_delta")
				}
				if st.result.Goal.ChangeSetRef != cs.ID {
					return fmt.Errorf("changeset_ref %q != ChangeSet id %q", st.result.Goal.ChangeSetRef, cs.ID)
				}
				return nil
			})

			sc.Step(`^le set rouge calculé est non vide$`, func() error {
				if len(goalpiloting.LiveRedSet(st.result.Goal)) == 0 {
					return fmt.Errorf("le set rouge est vide — un goal porte ≥1 miroir rouge (§56)")
				}
				return nil
			})

			sc.Step(`^le goal est OUVERT$`, func() error {
				if st.result.Goal.Status != goal.StatusOpen {
					return fmt.Errorf("status = %q, want OPEN", st.result.Goal.Status)
				}
				return nil
			})

			sc.Step(`^aucune vérité du Kernel n'a été écrite$`, func() error {
				// The engine returns VALUES — it performs no write. The DRAFT ChangeSet is a
				// PROPOSAL, never APPLIED here (DRAFT→APPLIED stays S20's commit-gate under approval).
				if st.openErr == nil && st.result.Goal.ChangeSet.Status != changeset.StatusDraft {
					return fmt.Errorf("le ChangeSet doit rester DRAFT (proposé, non appliqué)")
				}
				return nil
			})

			sc.Step(`^l'ouverture est refusée avec le code "([^"]*)"$`, func(code string) error {
				if st.openErr == nil {
					return fmt.Errorf("l'ouverture n'a pas été refusée; code attendu %q", code)
				}
				if st.openErr.Code != code {
					return fmt.Errorf("code = %q, want %q", st.openErr.Code, code)
				}
				if len(st.openErr.HowToFix) == 0 {
					return fmt.Errorf("un refus sans how_to_fix est une prison (§44.5)")
				}
				return nil
			})

			sc.Step(`^aucun ChangeSet n'est ouvert$`, func() error {
				if st.result.Goal.ChangeSet.ID != "" || st.result.Goal.Status != "" {
					return fmt.Errorf("aucun goal/ChangeSet ne doit être ouvert sur un refus; got %+v", st.result.Goal)
				}
				return nil
			})

			sc.Step(`^un goal ouvert dont le set rouge est "([^"]*)"$`, func(mirror string) error {
				st.g = goalpiloting.Goal{Status: goal.StatusOpen, RedSet: []string{mirror}}
				return nil
			})

			sc.Step(`^on tente de fermer avec le set rouge encore rouge, vert antérieur intact, mutation ([0-9.]+), seuil ([0-9.]+), aucun monstre$`,
				func(mut, floor string) error {
					st.closeBR = goalpiloting.PilotCloseGoal(st.g, goalpiloting.StopInput{
						Sensors:       map[string]goal.SensorState{st.g.RedSet[0]: goal.SensorRed},
						PriorGreen:    goal.PriorIntact,
						Mutation:      mustFloat(mut),
						MutationFloor: mustFloat(floor),
					})
					return nil
				})

			sc.Step(`^on tente de fermer avec le set rouge vert, vert antérieur intact, mutation ([0-9.]+), seuil ([0-9.]+), aucun monstre$`,
				func(mut, floor string) error {
					st.closeBR = goalpiloting.PilotCloseGoal(st.g, goalpiloting.StopInput{
						Sensors:       map[string]goal.SensorState{st.g.RedSet[0]: goal.SensorGreen},
						PriorGreen:    goal.PriorIntact,
						Mutation:      mustFloat(mut),
						MutationFloor: mustFloat(floor),
					})
					return nil
				})

			sc.Step(`^on tente de fermer avec le set rouge vert, vert antérieur cassé, mutation ([0-9.]+), seuil ([0-9.]+), aucun monstre$`,
				func(mut, floor string) error {
					st.closeBR = goalpiloting.PilotCloseGoal(st.g, goalpiloting.StopInput{
						Sensors:       map[string]goal.SensorState{st.g.RedSet[0]: goal.SensorGreen},
						PriorGreen:    goal.PriorBroken,
						Mutation:      mustFloat(mut),
						MutationFloor: mustFloat(floor),
					})
					return nil
				})

			sc.Step(`^la fermeture est refusée avec le code "([^"]*)"$`, func(code string) error {
				if st.closeBR == nil {
					return fmt.Errorf("la fermeture n'a pas été refusée; code attendu %q", code)
				}
				if st.closeBR.Code != code {
					return fmt.Errorf("code = %q, want %q", st.closeBR.Code, code)
				}
				return nil
			})

			sc.Step(`^la fermeture est acceptée$`, func() error {
				if st.closeBR != nil {
					return fmt.Errorf("la fermeture a été refusée: %s", st.closeBR.Error())
				}
				if !goalpiloting.CanClose(st.g, goalpiloting.StopInput{
					Sensors:       map[string]goal.SensorState{st.g.RedSet[0]: goal.SensorGreen},
					PriorGreen:    goal.PriorIntact,
					Mutation:      0.9,
					MutationFloor: 0.8,
				}) {
					return fmt.Errorf("CanClose doit être vrai quand les quatre conditions tiennent")
				}
				return nil
			})

			sc.Step(`^le goal peut passer FERMÉ$`, func() error {
				// The close gate is open; stamping CLOSED stays the aidos CLI role (S20 commit-gate).
				return nil
			})

			sc.Step(`^le goal reste OUVERT$`, func() error {
				if st.g.Status != goal.StatusOpen {
					return fmt.Errorf("status = %q, want OPEN", st.g.Status)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/goal-piloting.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("goal-piloting BDD scenarios failed")
	}
}

func mustFloat(s string) float64 {
	var f float64
	if _, err := fmt.Sscanf(s, "%g", &f); err != nil {
		panic(err)
	}
	return f
}

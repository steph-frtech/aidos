package shapeeditor_test

import (
	"errors"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/shapeeditor"
)

// Acceptance mirror runner (Godog, N0) for S68 — the three-shape mirror editor. Drives
// tests/runtime/shape-editor.feature against the in-process engine. The engine writes nothing
// (the wall): it returns values; the feature conceptually lives in the mirrors schema,
// materialized to tests/ (bootstrap exception, S06).

type shapeBDDState struct {
	derivation shapeeditor.Derivation
	deriveErr  error
	draft      shapeeditor.Draft
	proposal   shapeeditor.Proposal
	proposeErr error
}

func TestShapeEditorBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "shape-editor",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &shapeBDDState{}

			sc.Step(`^je dérive la forme pour la nature "([^"]*)"$`, func(nat string) error {
				st.derivation, st.deriveErr = shapeeditor.DeriveShape(shapeeditor.TruthNature(nat))
				return nil
			})
			sc.Step(`^la forme dérivée est "([^"]*)"$`, func(shape string) error {
				if st.deriveErr != nil {
					return st.deriveErr
				}
				if string(st.derivation.Shape) != shape {
					return errors.New("derived shape is " + string(st.derivation.Shape) + ", want " + shape)
				}
				return nil
			})
			sc.Step(`^le test_kind dérivé est "([^"]*)"$`, func(tk string) error {
				if string(st.derivation.TestKind) != tk {
					return errors.New("derived test_kind is " + string(st.derivation.TestKind) + ", want " + tk)
				}
				return nil
			})
			sc.Step(`^la dérivation est refusée$`, func() error {
				if st.deriveErr == nil {
					return errors.New("expected a refusal for an unknown nature, got none")
				}
				return nil
			})
			sc.Step(`^un brouillon de miroir pour la nature "([^"]*)" sur la couche "([^"]*)" du projet "([^"]*)"$`, func(nat, layer, proj string) error {
				st.draft, st.proposeErr = shapeeditor.OpenDraft(proj, records.LayerRef{LayerID: layer, Version: "v1"}, shapeeditor.TruthNature(nat))
				return st.proposeErr
			})
			sc.Step(`^la source du brouillon est une fixture valide$`, func() error {
				st.draft.Source = "fixture: discount\nstate: cart\ncommand: apply\nevent: applied"
				st.draft.Title = "discount"
				return nil
			})
			sc.Step(`^je propose le miroir$`, func() error {
				st.proposal, st.proposeErr = shapeeditor.ProposeMirror(st.draft, "phase-0")
				return st.proposeErr
			})
			sc.Step(`^le miroir proposé est rouge$`, func() error {
				if !shapeeditor.IsRed(st.proposal) {
					return errors.New("the proposed mirror is not born red")
				}
				return nil
			})
			sc.Step(`^la proposition est un ChangeSet DRAFT project-scopé "([^"]*)"$`, func(proj string) error {
				if st.proposal.ChangeSet.Status != "DRAFT" {
					return errors.New("changeset is not DRAFT: " + string(st.proposal.ChangeSet.Status))
				}
				if st.proposal.ProjectID != proj {
					return errors.New("proposal is not scoped to " + proj)
				}
				return nil
			})
			sc.Step(`^la proposition n'écrit aucune vérité miroir$`, func() error {
				if st.proposal.WroteMirror {
					return errors.New("WALL VIOLATION: WroteMirror=true")
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/shape-editor.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("S68 shape-editor acceptance mirror failed")
	}
}

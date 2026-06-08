package behaviorcapture_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
	"github.com/steph-frtech/aidos/back/runtime/behaviorcapture"
)

// Acceptance mirror runner (Godog, N0) for S67 — attach-behavior-at-capture. Drives
// tests/runtime/behavior-capture.feature against the in-process engine.
// reflects=runtime.behaviorcapture · test_kind=gherkin · cert_language=godog · authority=above
// · liveness=live. The engine writes nothing (the wall): it returns values; the feature
// conceptually lives in the mirrors schema, materialized to tests/ (bootstrap exception, S06).

type captureBDDState struct {
	ideaRef     string
	library     []behaviorcapture.Behavior
	proposal    behaviorcapture.Proposal
	attachErr   error
}

func TestBehaviorCaptureBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "behavior-capture",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &captureBDDState{}

			sc.Step(`^une idée capturée "([^"]*)"$`, func(ref string) error {
				st.ideaRef = ref
				return nil
			})
			sc.Step(`^la librairie de behaviours réutilisables est surfacée$`, func() error {
				st.library = behaviorcapture.Library()
				return nil
			})
			sc.Step(`^j'attache la behavior "([^"]*)" à l'entité "([^"]*)"$`, func(b, entity string) error {
				st.proposal, st.attachErr = behaviorcapture.AttachBehaviorAtCapture(
					st.ideaRef, behaviorcapture.Attachment{Behavior: behaviorcapture.Behavior(b), Entity: entity}, "phase-0",
				)
				return nil
			})
			sc.Step(`^j'attache la behavior "([^"]*)" à l'entité "([^"]*)" sans idée capturée$`, func(b, entity string) error {
				_, st.attachErr = behaviorcapture.AttachBehaviorAtCapture(
					"", behaviorcapture.Attachment{Behavior: behaviorcapture.Behavior(b), Entity: entity}, "phase-0",
				)
				return nil
			})
			sc.Step(`^la proposition expanse l'attribut "([^"]*)"$`, func(name string) error {
				if st.attachErr != nil {
					return st.attachErr
				}
				for _, a := range st.proposal.Expansion.Attributes {
					if a.Name == name {
						return nil
					}
				}
				return errors.New("attribute not in expansion: " + name)
			})
			sc.Step(`^la proposition expanse la policy "([^"]*)"$`, func(name string) error {
				for _, p := range st.proposal.Expansion.Policies {
					if p.Name == name {
						return nil
					}
				}
				return errors.New("policy not in expansion: " + name)
			})
			sc.Step(`^la proposition est un ChangeSet DRAFT ciblant "([^"]*)"$`, func(target string) error {
				if st.proposal.ChangeSet.Status != changeset.StatusDraft {
					return errors.New("proposal changeset is not DRAFT: " + string(st.proposal.ChangeSet.Status))
				}
				if st.proposal.ChangeSet.SpecDelta == nil || st.proposal.ChangeSet.SpecDelta.Target != target {
					return errors.New("spec_delta does not target " + target)
				}
				return nil
			})
			sc.Step(`^la proposition n'écrit aucune vérité Kernel$`, func() error {
				if st.proposal.Expansion.WroteKernel {
					return errors.New("WALL VIOLATION: WroteKernel=true")
				}
				if st.proposal.ChangeSet.Status != changeset.StatusDraft {
					return errors.New("WALL VIOLATION: changeset not DRAFT")
				}
				return nil
			})
			sc.Step(`^l'expansion attachée est byte-identique à celle de S76 pour "([^"]*)" sur "([^"]*)"$`, func(b, entity string) error {
				want, err := behavior.Expand(behavior.Attachment{Behavior: behavior.Kind(b), Entity: entity})
				if err != nil {
					return err
				}
				if !reflect.DeepEqual(st.proposal.Expansion, want) {
					return errors.New("attached expansion is NOT byte-identical to S76's (a second implementation crept in)")
				}
				return nil
			})
			sc.Step(`^la librairie surfacée est exactement le catalogue S76$`, func() error {
				want := behavior.Catalogue()
				if !reflect.DeepEqual(st.library, want) {
					return errors.New("surfaced library is not the S76 catalogue")
				}
				return nil
			})
			sc.Step(`^l'attache est refusée par S76 comme behavior inconnue$`, func() error {
				if !errors.Is(st.attachErr, behavior.ErrUnknownBehavior) {
					return errors.New("expected ErrUnknownBehavior, got: " + errStr(st.attachErr))
				}
				return nil
			})
			sc.Step(`^l'attache est refusée faute d'idée capturée$`, func() error {
				if !errors.Is(st.attachErr, behaviorcapture.ErrNoIdea) {
					return errors.New("expected ErrNoIdea, got: " + errStr(st.attachErr))
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/behavior-capture.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("S67 behavior-capture acceptance mirror failed")
	}
}

func errStr(e error) string {
	if e == nil {
		return "<nil>"
	}
	return e.Error()
}

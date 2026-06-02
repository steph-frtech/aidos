package truthtyping_test

import (
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
)

// Acceptance mirror (Gherkin/Godog): reflects=kernel.truthtyping,
// test_kind=acceptance, cert_language=gherkin, liveness=live, authority=above.
//
// It proves the two S14 done criteria: a truth without a TruthKind is REJECTED
// (BlockReason code "missing-truth-kind"); a non-verifiable truth is ROUTED to
// /spike. The feature lives conceptually in the mirrors schema, materialized at
// tests/kernel/truth_typing.feature for the Godog runner (the frozen N0 back slot).

type truthTypingBDDState struct {
	truth   truthtyping.Truth
	routing truthtyping.Routing
	err     error
}

func TestTruthTypingBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "truth-typing",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			state := &truthTypingBDDState{}

			sc.Step(`^a candidate truth with no truth_kind set$`, func() error {
				state.truth = truthtyping.Truth{}
				return nil
			})
			sc.Step(`^a candidate truth with truth_kind "([^"]*)"$`, func(kind string) error {
				state.truth.TruthKind = truthtyping.TruthKind(kind)
				return nil
			})
			sc.Step(`^verifiability_level "([^"]*)"$`, func(level string) error {
				state.truth.VerifiabilityLevel = truthtyping.VerifiabilityLevel(level)
				return nil
			})
			sc.Step(`^it is classified$`, func() error {
				state.routing, state.err = truthtyping.Classify(state.truth)
				return nil
			})
			sc.Step(`^it is rejected$`, func() error {
				if state.routing.Zone != truthtyping.ZoneRejected {
					return godog.ErrPending
				}
				if state.err == nil {
					return godog.ErrPending
				}
				return nil
			})
			sc.Step(`^the BlockReason code is "([^"]*)"$`, func(code string) error {
				if string(state.routing.Code) != code {
					return godog.ErrPending
				}
				return nil
			})
			sc.Step(`^it is not admitted to the kernel$`, func() error {
				if state.routing.Admitted {
					return godog.ErrPending
				}
				return nil
			})
			sc.Step(`^it is routed to zone "([^"]*)"$`, func(zone string) error {
				if string(state.routing.Zone) != zone {
					return godog.ErrPending
				}
				if state.routing.Admitted {
					return godog.ErrPending
				}
				return nil
			})
			sc.Step(`^it is admitted to zone "([^"]*)"$`, func(zone string) error {
				if string(state.routing.Zone) != zone {
					return godog.ErrPending
				}
				if !state.routing.Admitted {
					return godog.ErrPending
				}
				if state.err != nil {
					return godog.ErrPending
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/kernel/truth_typing.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("BDD scenarios failed")
	}
}

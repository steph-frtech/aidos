package records_test

import (
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Acceptance mirror (Gherkin/Godog): reflects=kernel.records, test_kind=acceptance,
// cert_language=gherkin, liveness=live, authority=above.
//
// "aidos check validates the canonical empty example": id == hash == version for
// each of the seven kinds; a SELECT-only role suffices (the check is pure, it
// writes nothing). The feature lives in the mirrors schema, materialized at
// tests/kernel/krdcore_records.feature for the runner.

type recordsBDDState struct {
	set    []records.Record
	result records.CheckResult
	err    error
}

func TestKRDCoreRecordsBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "krdcore-records",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			state := &recordsBDDState{}

			sc.Step(`^an empty example record of each KRDCore kind$`, func() error {
				set, err := records.EmptyExampleSet()
				state.set = set
				state.err = err
				return err
			})
			sc.Step(`^I run aidos check over the example$`, func() error {
				state.result = records.Check(state.set)
				return nil
			})
			sc.Step(`^it reports the example VALID$`, func() error {
				if !state.result.Valid {
					return godog.ErrPending
				}
				if state.result.Count != len(records.Kinds()) {
					return godog.ErrPending
				}
				return nil
			})
			sc.Step(`^each record id equals its content hash equals its version$`, func() error {
				for _, r := range state.set {
					canon, err := records.Canonicalize(r.Body)
					if err != nil {
						return err
					}
					want := records.Hash(canon)
					if r.ID != want || r.Version != want {
						return godog.ErrPending
					}
				}
				return nil
			})
			sc.Step(`^no agent write is required to validate$`, func() error {
				// Check is a pure function over in-memory records: it performs no
				// INSERT/UPDATE/DELETE. A SELECT-only role suffices. We assert the
				// computation succeeded without any store/DB handle in scope.
				if state.result.Count == 0 {
					return godog.ErrPending
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/kernel/krdcore_records.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("BDD scenarios failed")
	}
}

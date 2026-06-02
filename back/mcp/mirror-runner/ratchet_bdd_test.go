package mirrorrunner

// Acceptance mirror runner (Godog, N0): drives tests/runtime/ci-ratchet.feature
// against the cliquet — the Ratchet shell (seed baseline + replay candidate,
// recording append-only in an in-memory mirror_runs) and the pure core that the
// ci-ratchet hook delegates to. The feature conceptually lives in the mirrors
// schema, materialized to tests/ (mirrors lands at S06 — bootstrap exception,
// CLAUDE.md §6). The DB-level append-only + wall proofs are in
// mirror_runs_db_test.go (Testcontainers).

import (
	"context"
	"fmt"
	"testing"

	"github.com/cucumber/godog"
)

type ratchetBDDState struct {
	mirrors  []Mirror
	log      *memLog
	baseline map[string]Status // recorded baseline after seeding
	pending  map[string]Status // the candidate replay statuses
	result   RatchetResult
	hookExit int
}

func (s *ratchetBDDState) seedBaseline(statuses map[string]Status) error {
	s.log = &memLog{}
	r := &Ratchet{
		Source:   fakeSource{mirrors: s.mirrors},
		Replayer: fakeReplayer{status: statuses},
		Log:      s.log,
	}
	res, err := r.Check(context.Background(), "run-base", "merge-base")
	if err != nil {
		return err
	}
	if res.Verdict != VerdictAllowed && allGreen(statuses, s.mirrors) {
		return fmt.Errorf("baseline seed expected ALLOWED, got %s", res.Verdict)
	}
	s.baseline, err = s.log.Baseline(context.Background())
	return err
}

func allGreen(st map[string]Status, ms []Mirror) bool {
	for _, m := range ms {
		if st[m.ID] != StatusGreen {
			return false
		}
	}
	return true
}

func (s *ratchetBDDState) runCandidate(statuses map[string]Status) error {
	cand := &Ratchet{
		Source:   fakeSource{mirrors: s.mirrors},
		Replayer: fakeReplayer{status: statuses},
		Log:      s.log,
	}
	res, err := cand.Check(context.Background(), "run-cand", "candidate")
	if err != nil {
		return err
	}
	s.result = res
	// The hook delegates to the same pure core; mirror its exit code.
	if res.Verdict == VerdictRejected {
		s.hookExit = 2
	} else {
		s.hookExit = 0
	}
	return nil
}

func TestRatchetBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "ci-ratchet",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &ratchetBDDState{}

			sc.Step(`^a set of mirrors that are all green on the merge base$`, func() error {
				st.mirrors = threeMirrors()
				return st.seedBaseline(map[string]Status{"a": StatusGreen, "b": StatusGreen, "c": StatusGreen})
			})
			sc.Step(`^each green status is recorded in mirror_runs as the baseline$`, func() error {
				for _, m := range st.mirrors {
					if st.baseline[m.ID] != StatusGreen {
						return fmt.Errorf("mirror %s not recorded green at baseline", m.ID)
					}
				}
				return nil
			})

			// Scenario 1 — reddens a prior mirror.
			sc.Step(`^a candidate change that breaks a previously-green mirror$`, func() error {
				st.pending = map[string]Status{"a": StatusGreen, "b": StatusRed, "c": StatusGreen}
				return nil
			})
			// Scenario 2 — keeps all green.
			sc.Step(`^a candidate change that leaves all baseline-green mirrors green$`, func() error {
				st.pending = map[string]Status{"a": StatusGreen, "b": StatusGreen, "c": StatusGreen}
				return nil
			})
			// Scenario 3 — already red at baseline.
			sc.Step(`^a mirror that was already red on the merge base$`, func() error {
				st.mirrors = threeMirrors()
				return st.seedBaseline(map[string]Status{"a": StatusRed, "b": StatusGreen, "c": StatusGreen})
			})

			sc.Step(`^the ci-ratchet hook runs mirror-runner over every materialized mirror$`, func() error {
				if st.pending == nil {
					// scenario 3 sets the candidate in a later step; default to baseline.
					st.pending = map[string]Status{"a": StatusRed, "b": StatusGreen, "c": StatusGreen}
				}
				return st.runCandidate(st.pending)
			})
			sc.Step(`^that mirror is still red on the candidate$`, func() error {
				// already applied via runCandidate (a stays red); assert it.
				for _, row := range st.log.rows {
					if row.RunID == "run-cand" && row.MirrorID == "a" && row.Status != StatusRed {
						return fmt.Errorf("mirror a should still be red on candidate")
					}
				}
				return nil
			})

			sc.Step(`^mirror_runs records a new red run for that mirror flagged regressed=true$`, func() error {
				for _, row := range st.log.rows {
					if row.RunID == "run-cand" && row.MirrorID == "b" {
						if row.Status == StatusRed && row.Regressed {
							return nil
						}
						return fmt.Errorf("b candidate run not red+regressed: %+v", row)
					}
				}
				return fmt.Errorf("no candidate run recorded for b")
			})
			sc.Step(`^the hook returns BlockReason RED_REGRESSION with a non-zero exit$`, func() error {
				if st.hookExit == 0 {
					return fmt.Errorf("expected non-zero exit")
				}
				if st.result.BlockReason == nil || st.result.BlockReason.Code != CodeRedRegression {
					return fmt.Errorf("expected RED_REGRESSION, got %v", st.result.BlockReason)
				}
				return nil
			})
			sc.Step(`^the merge is rejected$`, func() error {
				if st.result.Verdict != VerdictRejected {
					return fmt.Errorf("expected REJECTED, got %s", st.result.Verdict)
				}
				return nil
			})

			sc.Step(`^mirror_runs records all runs as green with regressed=false$`, func() error {
				for _, row := range st.log.rows {
					if row.RunID == "run-cand" && (row.Status != StatusGreen || row.Regressed) {
						return fmt.Errorf("candidate run not green+not-regressed: %+v", row)
					}
				}
				return nil
			})
			sc.Step(`^the hook returns no BlockReason and a zero exit$`, func() error {
				if st.hookExit != 0 {
					return fmt.Errorf("expected zero exit, got %d", st.hookExit)
				}
				if st.result.BlockReason != nil {
					return fmt.Errorf("expected no BlockReason, got %v", st.result.BlockReason)
				}
				return nil
			})
			sc.Step(`^the merge is allowed$`, func() error {
				if st.result.Verdict != VerdictAllowed {
					return fmt.Errorf("expected ALLOWED, got %s", st.result.Verdict)
				}
				return nil
			})
			sc.Step(`^no regression is reported for that mirror$`, func() error {
				if len(st.result.Regressed) != 0 {
					return fmt.Errorf("expected no regression, got %+v", st.result.Regressed)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/ci-ratchet.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("ci-ratchet BDD scenarios failed")
	}
}

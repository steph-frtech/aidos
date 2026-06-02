package exploration_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/exploration"
)

// Acceptance mirror runner (Godog, N0): drives tests/runtime/exploration.feature
// against the in-process exploration engine. reflects=runtime.exploration ·
// test_kind=gherkin · cert_language=godog · authority=above · liveness=live.
//
// The engine writes nothing (the wall): it returns values. The feature conceptually
// lives in the mirrors schema, materialized to tests/ (mirrors lands at S06 —
// bootstrap exception, CLAUDE.md §6).

type explorationBDDState struct {
	idea     ideas.Idea
	verdict  exploration.GrillVerdict
	provided string // last provenance source recorded
	block    *blockreason.BlockReason
	proposal exploration.DraftTruthProposal
	gotProp  bool
	ratchet  string
	err      error
}

func TestExplorationBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "exploration-gestures",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &explorationBDDState{}

			sc.Step(`^an Idea with intent "([^"]*)", provenance "([^"]*)", status "([^"]*)"$`,
				func(intent, source, status string) error {
					i, err := ideas.Capture(
						ideas.ProposesPolicy,
						intent,
						ideas.Provenance{Source: ideas.ProvenanceSource(source), Detail: intent},
					)
					if err != nil {
						return err
					}
					i.Status = ideas.Status(status)
					st.idea = i
					st.provided = source
					return nil
				})

			sc.Step(`^I grill it and the intention is "([^"]*)"$`, func(v string) error {
				st.verdict = exploration.GrillVerdict(v)
				reason := ""
				if st.verdict == exploration.VerdictBad {
					reason = "bad idea: refused at grill, traced"
				}
				st.idea, st.err = exploration.Grill(st.idea, st.verdict, reason)
				return st.err
			})

			sc.Step(`^the Idea status becomes "([^"]*)"$`, func(want string) error {
				if string(st.idea.Status) != want {
					return fmt.Errorf("status = %q, want %q", st.idea.Status, want)
				}
				return nil
			})

			sc.Step(`^the spike zone is ratchet OFF at rigor "([^"]*)"$`, func(rigor string) error {
				// The ratchet OFF / T0 fact is a property of the spiking status; we assert
				// the engine routed us into spiking (the zone where the ratchet is off).
				if st.idea.Status != ideas.StatusSpiking {
					return fmt.Errorf("not in the spike zone: status = %q", st.idea.Status)
				}
				st.ratchet = rigor
				return nil
			})

			sc.Step(`^the verdict "([^"]*)" and the provenance "([^"]*)" are recorded$`,
				func(v, source string) error {
					if st.verdict != exploration.GrillVerdict(v) {
						return fmt.Errorf("verdict = %q, want %q", st.verdict, v)
					}
					if string(st.idea.Provenance.Source) != source {
						return fmt.Errorf("provenance = %q, want %q", st.idea.Provenance.Source, source)
					}
					return nil
				})

			sc.Step(`^the spike writes to "([^"]*)"$`, func(path string) error {
				st.block = exploration.CheckSpikeWrite(exploration.SpikeWrite{Path: path})
				return nil
			})

			sc.Step(`^the write is allowed$`, func() error {
				if st.block != nil {
					return fmt.Errorf("write blocked unexpectedly: %v", st.block.Code)
				}
				return nil
			})

			sc.Step(`^the write is blocked with BlockReason code "([^"]*)"$`, func(code string) error {
				if st.block == nil {
					return fmt.Errorf("no BlockReason; want code %q", code)
				}
				if string(st.block.Code) != code {
					return fmt.Errorf("BlockReason code = %q, want %q", st.block.Code, code)
				}
				return nil
			})

			sc.Step(`^how_to_fix contains "([^"]*)"$`, func(token string) error {
				if st.block == nil {
					return fmt.Errorf("no BlockReason to inspect for token %q", token)
				}
				for _, step := range st.block.HowToFix {
					if strings.Contains(step, token) {
						return nil
					}
				}
				return fmt.Errorf("how_to_fix %v does not contain %q", st.block.HowToFix, token)
			})

			sc.Step(`^I harvest it$`, func() error {
				st.idea, st.proposal, st.err = exploration.Harvest(st.idea, st.idea.Intent)
				st.gotProp = st.err == nil
				return st.err
			})

			sc.Step(`^a DRAFT-Truth proposal is produced$`, func() error {
				if !st.gotProp {
					return fmt.Errorf("no proposal produced")
				}
				if st.proposal.Kind != exploration.KindDraftTruth {
					return fmt.Errorf("proposal kind = %q, want %q", st.proposal.Kind, exploration.KindDraftTruth)
				}
				return nil
			})

			sc.Step(`^the proposal has no frozen version and no mirror$`, func() error {
				if st.proposal.HasFrozenVersion() {
					return fmt.Errorf("proposal carries a frozen version — it is no longer a DRAFT Truth")
				}
				if st.proposal.HasMirror() {
					return fmt.Errorf("proposal carries a mirror — it is no longer a DRAFT Truth")
				}
				return nil
			})

			sc.Step(`^harvesting did not write the kernel or a mirror$`, func() error {
				// Harvest returns values; it performs no write. The wall for a DIRECT
				// kernel/mirror write is CheckHarvestWrite, asserted in its own scenario.
				if exploration.CheckHarvestWrite("kernel") == nil {
					return fmt.Errorf("harvest is allowed to write the kernel — the wall is breached")
				}
				return nil
			})

			sc.Step(`^harvest attempts to write the "([^"]*)" schema directly$`, func(schema string) error {
				st.block = exploration.CheckHarvestWrite(schema)
				return nil
			})

			sc.Step(`^the rejection is recorded with provenance "([^"]*)"$`, func(source string) error {
				if st.idea.Status != ideas.StatusRejected {
					return fmt.Errorf("status = %q, want rejected", st.idea.Status)
				}
				if st.idea.RejectReason == "" {
					return fmt.Errorf("rejection has no traced reason")
				}
				if string(st.idea.Provenance.Source) != source {
					return fmt.Errorf("provenance = %q, want %q", st.idea.Provenance.Source, source)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/exploration.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("exploration BDD scenarios failed")
	}
}

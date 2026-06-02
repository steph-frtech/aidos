package evolve_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/runtime/evolve"
)

// Acceptance mirror runner (Godog, N0): drives tests/runtime/evolution-sandbox.feature
// against the in-process EvolutionSandbox engine. reflects=runtime.evolve ·
// test_kind=gherkin · cert_language=godog · authority=above · liveness=live.
//
// The engine writes nothing (the wall): Confine/Promote/Evolve return values. The
// feature conceptually lives in the mirrors schema, materialized to tests/ (mirrors
// landed at S06 — bootstrap exception, CLAUDE.md §6).

type evolveBDDState struct {
	cell      string
	confine   evolve.ConfineResult
	gotWrite  bool
	variant   evolve.Variant
	evidence  evolve.Evidence
	promotion evolve.PromotionResult
}

func TestEvolveBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "evolution-sandbox",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &evolveBDDState{}

			sc.Step(`^an active /evolve run on cell "([^"]*)"$`, func(cell string) error {
				st.cell = cell
				return nil
			})

			writeStep := func(path string) error {
				st.confine = evolve.Confine(evolve.WriteAttempt{Path: path})
				st.gotWrite = true
				return nil
			}
			sc.Step(`^the run writes a variant to "([^"]*)"$`, writeStep)
			sc.Step(`^the run writes a score to "([^"]*)"$`, writeStep)
			sc.Step(`^the run writes a suggestion to "([^"]*)"$`, writeStep)
			sc.Step(`^the run writes to "([^"]*)"$`, writeStep)

			sc.Step(`^the write is allowed$`, func() error {
				if st.confine.Verdict != evolve.VerdictAllowed {
					return fmt.Errorf("write blocked unexpectedly: %v", st.confine.BlockReason)
				}
				return nil
			})

			sc.Step(`^the write is blocked with BlockReason code "([^"]*)"$`, func(code string) error {
				if st.confine.Verdict != evolve.VerdictRefused || st.confine.BlockReason == nil {
					return fmt.Errorf("write not blocked; want code %q", code)
				}
				if string(st.confine.BlockReason.Code) != code {
					return fmt.Errorf("BlockReason code = %q, want %q", st.confine.BlockReason.Code, code)
				}
				return nil
			})

			sc.Step(`^how_to_fix contains "([^"]*)"$`, func(token string) error {
				if st.confine.BlockReason == nil {
					return fmt.Errorf("no BlockReason to inspect for token %q", token)
				}
				for _, s := range st.confine.BlockReason.HowToFix {
					if strings.Contains(s, token) {
						return nil
					}
				}
				return fmt.Errorf("how_to_fix %v does not contain %q", st.confine.BlockReason.HowToFix, token)
			})

			sc.Step(`^a variant "([^"]*)" in niche "([^"]*)" with mirror "([^"]*)", out_of_sample "([^"]*)" and authority_approval "([^"]*)"$`,
				func(id, niche, mirror, oos, approval string) error {
					st.variant = evolve.Variant{ID: id, Niche: niche}
					st.evidence = evolve.Evidence{
						Mirror:            evolve.MirrorStatus(mirror),
						OutOfSample:       evolve.OutOfSampleStatus(oos),
						AuthorityApproved: approval == "true",
						Fitness:           0.5,
					}
					return nil
				})

			sc.Step(`^the run proposes its promotion$`, func() error {
				st.promotion = evolve.Promote(st.variant, st.evidence)
				return nil
			})

			sc.Step(`^a promotion proposal is produced for niche "([^"]*)"$`, func(niche string) error {
				if st.promotion.Verdict != evolve.PromotionProposed {
					return fmt.Errorf("promotion = %q, want proposed: %s", st.promotion.Verdict, st.promotion.Reason)
				}
				if st.promotion.Proposal == nil || st.promotion.Proposal.Niche != niche {
					return fmt.Errorf("no proposal for niche %q: %+v", niche, st.promotion.Proposal)
				}
				return nil
			})

			sc.Step(`^the sandbox did not write the kernel, a mirror, authority or fitness$`, func() error {
				if st.promotion.Proposal == nil {
					return fmt.Errorf("no proposal")
				}
				if st.promotion.Proposal.WritesTruth {
					return fmt.Errorf("the proposal wrote truth — the sandbox governed")
				}
				// the cannot_write zones stay refused by Confine (the wall holds).
				for _, p := range []string{"/kernel/x", "/mirrors/above/x", "/authority/x", "/fitness/x"} {
					if evolve.Confine(evolve.WriteAttempt{Path: p}).Verdict != evolve.VerdictRefused {
						return fmt.Errorf("a cannot_write zone %q is not refused — the wall is breached", p)
					}
				}
				return nil
			})

			sc.Step(`^the promotion is refused$`, func() error {
				if st.promotion.Verdict != evolve.PromotionRefused {
					return fmt.Errorf("promotion = %q, want refused", st.promotion.Verdict)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/evolution-sandbox.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("evolution-sandbox BDD scenarios failed")
	}
}

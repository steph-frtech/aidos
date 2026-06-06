package besoin_test

// invariant_bdd_test.go — EL14 acceptance mirror (Godog, N0): drives
// back/tests/runtime/besoin-invariant.feature. The transversal band /besoin-invariant records the
// invariants ∀ and policies that CROSS the levels; the CODE JUDGES (the lateral constraint, the ∀-vs-∃
// gate, the routing, the circularity ban, band completeness, the at-most-one Idea{policy}). The band
// writes NO truth (the wall): it returns the BesoinGraph to be appended via the EL15 MCP + at most one
// Idea{Proposes:policy} guidance.

import (
	"fmt"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"github.com/steph-frtech/aidos/back/runtime/besoin"
)

type bandState struct {
	graph           besoin.BesoinGraph
	meta            besoin.Metadata
	result          besoin.InvariantResult
	completeness    besoin.BandCompletenessReport
	graphHashBefore string
}

func bandCompleteMeta() besoin.Metadata {
	return besoin.Metadata{
		TruthKind:     truthtyping.KindBehavioral,
		Verifiability: truthtyping.LevelDeterministic,
		Scope:         scope.TruthScope{Region: scope.RegionGlobal},
	}
}

func TestBesoinInvariantBandBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "besoin-invariant",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &bandState{}

			sc.Step(`^a fresh BesoinGraph for the project "([^"]*)"$`, func(p string) error {
				st.graph = besoin.NewGraph(p)
				st.meta = bandCompleteMeta()
				h, _ := st.graph.Hash()
				st.graphHashBefore = h
				return nil
			})

			sc.Step(`^I record a forall invariant attached at "([^"]*)"$`, func(rung string) error {
				st.result = besoin.RecordInvariant(st.graph, map[string]any{
					"statement":       "pour tout chemin, le solde reste ≥ 0",
					"attached_levels": []any{rung},
					"kind":            "path_independent",
				}, "le solde ne descend jamais sous zéro", false, st.meta)
				return nil
			})

			sc.Step(`^I record an example statement attached at "([^"]*)"$`, func(rung string) error {
				st.result = besoin.RecordInvariant(st.graph, map[string]any{
					"statement":       "par exemple, la commande #3 est payée",
					"attached_levels": []any{rung},
				}, "la commande #3 est payée", false, st.meta)
				return nil
			})

			sc.Step(`^I record a self-authored invariant attached at "([^"]*)"$`, func(rung string) error {
				st.result = besoin.RecordInvariant(st.graph, map[string]any{
					"statement":       "pour tout P, Q",
					"attached_levels": []any{rung},
				}, "(la skill tente)", true, st.meta)
				return nil
			})

			sc.Step(`^I record a policy band attached at "([^"]*)"$`, func(rung string) error {
				st.result = besoin.RecordInvariant(st.graph, map[string]any{
					"statement":       "pour tout utilisateur non-admin, le remboursement est interdit",
					"attached_levels": []any{rung},
					"kind":            "policy",
					"rule":            "seul un admin peut rembourser",
				}, "je veux que seuls les admins remboursent", false, st.meta)
				return nil
			})

			sc.Step(`^the recorded routing is "([^"]*)"$`, func(want string) error {
				if string(st.result.Routing) != want {
					return fmt.Errorf("routing = %q, want %q", st.result.Routing, want)
				}
				return nil
			})

			sc.Step(`^the crossed levels include "([^"]*)"$`, func(want string) error {
				for _, l := range st.result.CrossedLevels {
					if string(l) == want {
						return nil
					}
				}
				return fmt.Errorf("crossed levels %v do not include %q", st.result.CrossedLevels, want)
			})

			sc.Step(`^the block reason code is "([^"]*)"$`, func(want string) error {
				if st.result.BlockReason == nil {
					return fmt.Errorf("no block reason; want code %q", want)
				}
				if string(st.result.BlockReason.Code) != want {
					return fmt.Errorf("block code = %q, want %q", st.result.BlockReason.Code, want)
				}
				return nil
			})

			sc.Step(`^exactly one policy idea is emitted with provenance human$`, func() error {
				if st.result.PolicyIdea == nil {
					return fmt.Errorf("no policy idea emitted")
				}
				if st.result.PolicyIdea.Proposes != ideas.ProposesPolicy {
					return fmt.Errorf("idea proposes = %q, want policy", st.result.PolicyIdea.Proposes)
				}
				if st.result.PolicyIdea.Provenance.Source != ideas.ProvenanceHuman {
					return fmt.Errorf("idea provenance source = %q, want human", st.result.PolicyIdea.Provenance.Source)
				}
				return nil
			})

			sc.Step(`^no kernel truth was written by the band$`, func() error {
				// The result type cannot encode a Version or a Mirror (the double absence); the band
				// returns a BesoinGraph above the wall + at most one Idea (which itself has no mirror).
				if st.result.PolicyIdea != nil {
					// An idea is a candidate-truth, NOT a truth: it carries no version/mirror by construction.
					if st.result.PolicyIdea.Status != ideas.StatusDraft {
						return fmt.Errorf("policy idea status = %q, want draft (no freeze)", st.result.PolicyIdea.Status)
					}
				}
				return nil
			})

			sc.Step(`^the BesoinGraph is unchanged by the band$`, func() error {
				h, _ := st.result.Graph.Hash()
				if h != st.graphHashBefore {
					return fmt.Errorf("graph_hash changed on a refused turn: %q != %q", h, st.graphHashBefore)
				}
				return nil
			})

			sc.Step(`^a resolved "([^"]*)" rung that requires a crossing invariant$`, func(rung string) error {
				lvl, err := besoin.ParseLevel(rung)
				if err != nil {
					return err
				}
				body := []byte(`{"requires_invariant":true,"marker":"x"}`)
				g, err := st.graph.AddNode(besoin.LevelNode{
					Level:      lvl,
					Body:       body,
					Status:     besoin.NodeResolved,
					Provenance: besoin.Provenance{Source: "human", Detail: "verbatim"},
				})
				if err != nil {
					return err
				}
				st.graph = g
				st.completeness = besoin.BandCompleteness(g)
				return nil
			})

			sc.Step(`^the band completeness flags one monster "([^"]*)"$`, func(code string) error {
				if st.completeness.Complete {
					return fmt.Errorf("expected a monster %q, got complete", code)
				}
				if len(st.completeness.Monsters) != 1 || string(st.completeness.Monsters[0].Code) != code {
					return fmt.Errorf("monsters = %+v, want one %q", st.completeness.Monsters, code)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../tests/runtime/besoin-invariant.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("the besoin-invariant band feature is RED")
	}
}

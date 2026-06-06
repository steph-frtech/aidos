package besoin_test

// interview_bdd_test.go — EL13 acceptance mirror (Godog, N0): drives
// tests/runtime/compound-besoin.feature. The umbrella skill /compound-besoin LEADS the dialogue, the
// CODE JUDGES: the enterable level, the resolved verdict, the routing and the altitude are all
// computed by back/runtime/besoin, never by the LLM. The interview writes NO truth (the wall): it
// returns the BesoinGraph to be appended via the EL15 MCP; this test asserts no kernel write occurred
// (the result carries no Version/Mirror — the type cannot encode one) and the graph is unchanged on a
// rejected/fuzzy turn.

import (
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"github.com/steph-frtech/aidos/back/runtime/besoin"
)

// interviewState threads one interview turn across the scenario steps.
type interviewState struct {
	graph           besoin.BesoinGraph
	enterable       besoin.Level
	meta            besoin.Metadata
	result          besoin.InterviewResult
	graphHashBefore string
}

// completeMeta is the four-metadata set a product node needs to pass gate (b) (REUSED from the EL07
// fixtures' fullMeta shape: behavioral + deterministic + explicitly global).
func completeMeta() besoin.Metadata {
	return besoin.Metadata{
		TruthKind:     truthtyping.KindBehavioral,
		Verifiability: truthtyping.LevelDeterministic,
		Scope:         scope.TruthScope{Region: scope.RegionGlobal},
	}
}

// fuzzyMeta is metadata the classifier routes to /spike: an UNVERIFIABLE verifiability (ModeSpike).
func fuzzyMeta() besoin.Metadata {
	m := completeMeta()
	m.Verifiability = truthtyping.LevelUnverifiable
	return m
}

func TestCompoundBesoinInterviewBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "compound-besoin",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &interviewState{}

			sc.Step(`^a fresh BesoinGraph for the project "([^"]*)"$`, func(p string) error {
				st.graph = besoin.NewGraph(p)
				st.meta = completeMeta()
				h, _ := st.graph.Hash()
				st.graphHashBefore = h
				return nil
			})

			sc.Step(`^the enterable level is "([^"]*)"$`, func(level string) error {
				got, ok := besoin.EnterableLevel(st.graph, func(besoin.Level) besoin.Metadata { return st.meta })
				if !ok {
					return errf("no enterable level, expected %q", level)
				}
				if string(got) != level {
					return errf("enterable level = %q, want %q", got, level)
				}
				st.enterable = got
				return nil
			})

			// --- whens ---
			sc.Step(`^I record a non-vacant product answer that names an intent, right-sized scenarios and a retained view archetype$`,
				func() error {
					body := map[string]any{
						"intent":    "Un suivi de tâches simple",
						"scenarios": []any{"créer une tâche", "cocher une tâche"},
						"selects":   []any{"onboarding", "core-task"},
					}
					st.meta = completeMeta()
					st.result = besoin.RecordAnswer(st.graph, st.enterable, body, "je veux suivre mes tâches", st.meta)
					return nil
				})

			sc.Step(`^I record a product answer the metadata classifies as unverifiable$`, func() error {
				body := map[string]any{
					"intent":    "Une app qui rend les gens heureux",
					"scenarios": []any{"être heureux"},
					"selects":   []any{"onboarding"},
				}
				st.meta = fuzzyMeta()
				st.result = besoin.RecordAnswer(st.graph, st.enterable, body, "je veux que les gens soient heureux", st.meta)
				return nil
			})

			sc.Step(`^I record an entity attributes body submitted at the product level$`, func() error {
				body := map[string]any{"attributes": []any{"id", "title", "done"}}
				st.meta = completeMeta()
				st.result = besoin.RecordAnswer(st.graph, st.enterable, body, "une tâche a un titre et un état", st.meta)
				return nil
			})

			sc.Step(`^I record a schema-valid product answer that selects no view archetype$`, func() error {
				// intent + scenarios satisfy the product schema (NOT off-altitude), but selecting no
				// view archetype leaves the anti-vacuity branch open → recorded, not resolved.
				body := map[string]any{
					"intent":    "Un suivi de tâches simple",
					"scenarios": []any{"créer une tâche"},
					"selects":   []any{},
				}
				st.meta = completeMeta()
				st.result = besoin.RecordAnswer(st.graph, st.enterable, body, "je veux suivre mes tâches", st.meta)
				return nil
			})

			// --- thens ---
			sc.Step(`^the recorded routing is "([^"]*)"$`, func(want string) error {
				if string(st.result.Routing) != want {
					return errf("routing = %q, want %q (block=%v)", st.result.Routing, want, st.result.BlockReason)
				}
				return nil
			})

			sc.Step(`^the (product|journey|view|control|action|operation|entity) level is resolved$`, func(level string) error {
				if !st.result.Resolved {
					return errf("level %q not resolved; open branches=%v", level, st.result.OpenBranches)
				}
				return nil
			})

			sc.Step(`^the (product|journey|view|control|action|operation|entity) level is not resolved$`, func(string) error {
				if st.result.Resolved {
					return errf("level resolved, expected not resolved")
				}
				return nil
			})

			sc.Step(`^the spike route is "([^"]*)"$`, func(want string) error {
				got := strings.Join(st.result.SpikeRoute, ",")
				if got != want {
					return errf("spike route = %q, want %q", got, want)
				}
				return nil
			})

			sc.Step(`^the block reason names the schema mismatch$`, func() error {
				if st.result.BlockReason == nil {
					return errf("no block reason on an off-altitude turn")
				}
				if !strings.Contains(st.result.BlockReason.Explanation, "schéma") {
					return errf("block reason does not name the schema mismatch: %q", st.result.BlockReason.Explanation)
				}
				return nil
			})

			sc.Step(`^at least one open branch remains$`, func() error {
				if len(st.result.OpenBranches) == 0 {
					return errf("expected at least one open branch")
				}
				return nil
			})

			sc.Step(`^no kernel truth was written by the interview$`, func() error {
				// The wall: the result is a BesoinGraph (no Version, no Mirror field — the type cannot
				// encode a freeze). The interview returns the graph to be appended via EL15; it never
				// writes the kernel. Assert the recorded node carries provenance human + no proof.
				node, ok := st.result.Graph.Node(st.enterable)
				if !ok {
					return errf("recorded turn produced no node")
				}
				if node.Provenance.Source != "human" {
					return errf("recorded node provenance must be human, got %q", node.Provenance.Source)
				}
				return nil
			})

			sc.Step(`^the BesoinGraph is unchanged by the interview$`, func() error {
				h, _ := st.result.Graph.Hash()
				if h != st.graphHashBefore {
					return errf("graph changed on a rejected/fuzzy turn: hash %q != %q", h, st.graphHashBefore)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../tests/runtime/compound-besoin.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("the compound-besoin interview feature is RED")
	}
}

// errf is a tiny fmt.Errorf alias keeping the step bodies terse.
func errf(format string, a ...any) error { return fmt.Errorf(format, a...) }

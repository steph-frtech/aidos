package besoin_test

// emit_ideas_bdd_test.go — EL16 acceptance mirror (Godog, N0): drives
// back/tests/runtime/emit-ideas.feature. EmitIdeas projects a BesoinGraph into the backlog of Ideas,
// GOVERNED by the closed table LevelToProposes (EL05). For each resolved MAPPING rung it emits exactly
// one draft Idea (provenance human, the utterance verbatim, content-addressed id); NoEmit rungs emit
// nothing. The emitter writes NO kernel and NO mirror (the wall): an emitted Idea cannot encode a
// version or a mirror by construction. The mapping is a pure table, never an LLM cast.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/besoin"
)

type emitState struct {
	graph    besoin.BesoinGraph
	emitted  []ideas.Idea
	emitted2 []ideas.Idea
	// the unverifiable-rung lifecycle probe (scenario 4).
	draft     ideas.Idea
	advanced  ideas.Idea
	directErr error
	emitErr   error
}

// resolvedNode builds a resolved LevelNode for a level with a minimal valid-shaped body + a verbatim
// utterance (provenance human). The body is canonical-ready; EmitIdeas derives the Intent from the
// node provenance utterance, so the same node always lands at the same content address.
func resolvedNode(level besoin.Level, utterance string) besoin.LevelNode {
	body, _ := json.Marshal(map[string]any{"marker": string(level), "intent": utterance})
	return besoin.LevelNode{
		Level:      level,
		Body:       body,
		Status:     besoin.NodeResolved,
		Provenance: besoin.Provenance{Source: "human", Detail: utterance},
	}
}

func draftingNode(level besoin.Level, utterance string) besoin.LevelNode {
	n := resolvedNode(level, utterance)
	n.Status = besoin.NodeDrafting
	return n
}

func mustAdd(g besoin.BesoinGraph, n besoin.LevelNode) besoin.BesoinGraph {
	out, err := g.AddNode(n)
	if err != nil {
		panic(err)
	}
	return out
}

func TestBesoinEmitIdeasBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "emit-ideas",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &emitState{}

			sc.Step(`^a BesoinGraph with a resolved "([^"]*)" rung and a resolved "([^"]*)" rung$`, func(a, b string) error {
				la, errA := besoin.ParseLevel(a)
				lb, errB := besoin.ParseLevel(b)
				if errA != nil || errB != nil {
					return fmt.Errorf("parse levels %q/%q: %v/%v", a, b, errA, errB)
				}
				g := besoin.NewGraph("demo-checkout")
				g = mustAdd(g, resolvedNode(la, "je veux "+a))
				g = mustAdd(g, resolvedNode(lb, "je veux "+b))
				st.graph = g
				return nil
			})

			sc.Step(`^a BesoinGraph with a resolved "([^"]*)" rung and a drafting "([^"]*)" rung$`, func(a, b string) error {
				la, errA := besoin.ParseLevel(a)
				lb, errB := besoin.ParseLevel(b)
				if errA != nil || errB != nil {
					return fmt.Errorf("parse levels: %v/%v", errA, errB)
				}
				g := besoin.NewGraph("demo-checkout")
				g = mustAdd(g, resolvedNode(la, "je veux "+a))
				g = mustAdd(g, draftingNode(lb, "je veux "+b))
				st.graph = g
				return nil
			})

			sc.Step(`^I EmitIdeas over the graph$`, func() error {
				st.emitted, st.emitErr = besoin.EmitIdeas(st.graph)
				return st.emitErr
			})

			sc.Step(`^I EmitIdeas over the graph twice$`, func() error {
				var e1, e2 error
				st.emitted, e1 = besoin.EmitIdeas(st.graph)
				st.emitted2, e2 = besoin.EmitIdeas(st.graph)
				if e1 != nil || e2 != nil {
					return fmt.Errorf("emit errors: %v/%v", e1, e2)
				}
				return nil
			})

			sc.Step(`^exactly (\d+) ideas? (?:is|are) emitted$`, func(n int) error {
				if len(st.emitted) != n {
					return fmt.Errorf("emitted %d ideas, want %d", len(st.emitted), n)
				}
				return nil
			})

			sc.Step(`^every emitted idea has status "([^"]*)"$`, func(want string) error {
				for _, i := range st.emitted {
					if string(i.Status) != want {
						return fmt.Errorf("idea %s status = %q, want %q", i.ID, i.Status, want)
					}
				}
				return nil
			})

			sc.Step(`^every emitted idea has provenance source "([^"]*)"$`, func(want string) error {
				for _, i := range st.emitted {
					if string(i.Provenance.Source) != want {
						return fmt.Errorf("idea %s provenance = %q, want %q", i.ID, i.Provenance.Source, want)
					}
				}
				return nil
			})

			sc.Step(`^an emitted idea proposes "([^"]*)"$`, func(want string) error {
				for _, i := range st.emitted {
					if string(i.Proposes) == want {
						return nil
					}
				}
				return fmt.Errorf("no emitted idea proposes %q (got %v)", want, proposesOf(st.emitted))
			})

			sc.Step(`^no emitted idea proposes "([^"]*)"$`, func(want string) error {
				for _, i := range st.emitted {
					if string(i.Proposes) == want {
						return fmt.Errorf("an emitted idea proposes %q but should not (NoEmit/unresolved)", want)
					}
				}
				return nil
			})

			sc.Step(`^no emitted idea carries a mirror$`, func() error {
				// The double absence (the wall): ideas.Idea has no Version and no Mirror field by
				// construction. We assert the canonical body carries neither key.
				for _, i := range st.emitted {
					b, err := ideas.Canonicalize(i)
					if err != nil {
						return err
					}
					var m map[string]any
					if err := json.Unmarshal(b, &m); err != nil {
						return err
					}
					if _, ok := m["mirror"]; ok {
						return fmt.Errorf("idea %s canonical body carries a mirror key", i.ID)
					}
					if _, ok := m["version"]; ok {
						return fmt.Errorf("idea %s canonical body carries a version key", i.ID)
					}
				}
				return nil
			})

			sc.Step(`^no kernel truth was written by the emitter$`, func() error {
				// EmitIdeas is a pure function returning []Idea — it has no DB handle, no kernel grant.
				// Every emitted Idea is a draft candidate, never a frozen truth.
				for _, i := range st.emitted {
					if i.Status != ideas.StatusDraft {
						return fmt.Errorf("idea %s is not a draft (status %q) — emission must not freeze", i.ID, i.Status)
					}
				}
				return nil
			})

			sc.Step(`^the two emissions are byte-identical$`, func() error {
				a, err := json.Marshal(st.emitted)
				if err != nil {
					return err
				}
				b, err := json.Marshal(st.emitted2)
				if err != nil {
					return err
				}
				if !bytes.Equal(a, b) {
					return fmt.Errorf("re-emission not byte-identical:\n  %s\n  %s", a, b)
				}
				return nil
			})

			sc.Step(`^an emitted draft idea from an unverifiable rung$`, func() error {
				// EmitIdeas yields a draft Idea (the only legal first state). An unverifiable rung still
				// emits a DRAFT first — never a direct spike cast.
				g := besoin.NewGraph("demo-checkout")
				g = mustAdd(g, resolvedNode(besoin.LevelProduct, "je veux un produit flou"))
				out, err := besoin.EmitIdeas(g)
				if err != nil {
					return err
				}
				if len(out) != 1 {
					return fmt.Errorf("expected one draft idea, got %d", len(out))
				}
				st.draft = out[0]
				if st.draft.Status != ideas.StatusDraft {
					return fmt.Errorf("emitted idea is not a draft: %q", st.draft.Status)
				}
				return nil
			})

			sc.Step(`^the idea is grilled then spiked$`, func() error {
				grilled, err := ideas.Grill(st.draft)
				if err != nil {
					return err
				}
				st.advanced, err = ideas.Spike(grilled)
				return err
			})

			sc.Step(`^the idea reaches status "([^"]*)"$`, func(want string) error {
				if string(st.advanced.Status) != want {
					return fmt.Errorf("advanced status = %q, want %q", st.advanced.Status, want)
				}
				return nil
			})

			sc.Step(`^a direct spike from draft is refused$`, func() error {
				_, st.directErr = ideas.Spike(st.draft)
				if st.directErr == nil {
					return fmt.Errorf("a direct spike from draft was allowed; want refused (draft → grill → spike)")
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../tests/runtime/emit-ideas.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("the emit-ideas feature is RED")
	}
}

func proposesOf(in []ideas.Idea) []string {
	out := make([]string, 0, len(in))
	for _, i := range in {
		out = append(out, string(i.Proposes))
	}
	return out
}

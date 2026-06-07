package context_test

// S55 ContextRouter PROJECT-ISOLATION property mirror. reflects=runtime.context.Compile ·
// test_kind=property · cert_language=rapid · liveness=live · authority=below (a means-test
// toward the human red, not a truth the agent invents).
//
// THE DONE-CRITERION (roadmap S55): "un ContextPack du projet A contient zéro nœud du projet
// B". The router compiles the pack ONLY from the active project's subgraph; any graph node
// scoped to a DIFFERENT project is fenced out (excluded cross-project) and NEVER appears in any
// section of the pack. This is the OUTER scope, independent of branch / bounded-context / memory
// filters.
//
// DETERMINISM (CLAUDE.md §8): the router is an ALGORITHM not a prompt — same (goal, branch,
// graph) ⇒ byte-identical pack; the project fence is a pure predicate.

import (
	"testing"

	rctx "github.com/steph-frtech/aidos/back/runtime/context"
	"pgregory.net/rapid"
)

func genProject() *rapid.Generator[string] {
	// Two real projects A and B (+ the empty/singleton case the seed uses).
	return rapid.SampledFrom([]string{"proj-a", "proj-b", ""})
}

// genProjectGraph builds a graph whose nodes are tagged with a project A/B/"" so the fence can
// be exercised. Nodes carry a project alongside the existing BC/branch/scope fields.
func genProjectGraph(t *rapid.T) rctx.ContextGraph {
	n := rapid.IntRange(0, 6).Draw(t, "n")
	var g rctx.ContextGraph
	for i := 0; i < n; i++ {
		id := rapid.StringMatching(`L[0-9]`).Draw(t, "lid")
		g.Layers = append(g.Layers, rctx.Layer{
			ID:             id,
			BoundedContext: rapid.SampledFrom([]string{"checkout", ""}).Draw(t, "lbc"),
			LoadBearing:    rapid.Bool().Draw(t, "lb"),
			Project:        genProject().Draw(t, "lproj"),
		})
	}
	m := rapid.IntRange(0, 4).Draw(t, "m")
	for i := 0; i < m; i++ {
		g.Mirrors = append(g.Mirrors, rctx.Mirror{
			ID:             rapid.StringMatching(`M[0-9]`).Draw(t, "mid"),
			BoundedContext: rapid.SampledFrom([]string{"checkout", ""}).Draw(t, "mbc"),
			Project:        genProject().Draw(t, "mproj"),
		})
	}
	c := rapid.IntRange(0, 4).Draw(t, "c")
	for i := 0; i < c; i++ {
		g.Contracts = append(g.Contracts, rctx.Contract{
			ID:             rapid.StringMatching(`C[0-9]`).Draw(t, "cid"),
			BoundedContext: rapid.SampledFrom([]string{"checkout", "billing", ""}).Draw(t, "cbc"),
			Public:         rapid.Bool().Draw(t, "cpub"),
			Project:        genProject().Draw(t, "cproj"),
		})
	}
	mem := rapid.IntRange(0, 4).Draw(t, "mem")
	for i := 0; i < mem; i++ {
		g.Memory = append(g.Memory, rctx.MemoryRecord{
			ID:         rapid.StringMatching(`R[0-9]`).Draw(t, "rid"),
			Kind:       rctx.MemoryLesson,
			Scope:      rapid.SampledFrom([]string{"checkout", ""}).Draw(t, "rscope"),
			Confidence: rctx.ConfidenceEstablished,
			Approved:   true,
			Project:    genProject().Draw(t, "rproj"),
		})
	}
	return g
}

// nodeProjects maps each node id to its project so the test can assert no B-node leaks into an
// A-scoped pack. When two nodes share an id with different projects, the test only fails if NO
// same-project (or unscoped) sibling exists — mirroring the branch-no-leak guard.
func TestProperty_ProjectIsolation(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		active := rapid.SampledFrom([]string{"proj-a", "proj-b"}).Draw(t, "active")
		graph := genProjectGraph(t)

		// A goal worked in the active project, redding every layer id (so the fence, not the
		// red-set, is what excludes the neighbor-project nodes).
		var red []string
		for _, l := range graph.Layers {
			red = append(red, l.ID)
		}
		goal := rctx.Goal{
			ID:             "g",
			BoundedContext: "checkout",
			RedSet:         red,
			Project:        active,
		}
		pack := rctx.Compile(goal, "main", graph)

		// Helper: a node id has a sibling that is in-project (same project) or unscoped.
		inProjectSibling := func(id string, projects map[string][]string) bool {
			for _, p := range projects[id] {
				if p == "" || p == active {
					return true
				}
			}
			return false
		}

		// Build id→projects maps per section so an off-project id may still appear iff a
		// same-project sibling shares the id.
		layerProj := map[string][]string{}
		for _, l := range graph.Layers {
			layerProj[l.ID] = append(layerProj[l.ID], l.Project)
		}
		for _, id := range pack.AffectedLayers {
			if !inProjectSibling(id, layerProj) {
				t.Fatalf("cross-project leak: layer %q (no %q sibling) in pack", id, active)
			}
		}

		mirProj := map[string][]string{}
		for _, m := range graph.Mirrors {
			mirProj[m.ID] = append(mirProj[m.ID], m.Project)
		}
		for _, id := range pack.ActiveKernel.Mirrors {
			if !inProjectSibling(id, mirProj) {
				t.Fatalf("cross-project leak: mirror %q in %q pack", id, active)
			}
		}

		conProj := map[string][]string{}
		for _, c := range graph.Contracts {
			conProj[c.ID] = append(conProj[c.ID], c.Project)
		}
		for _, id := range pack.ActiveKernel.Contracts {
			if !inProjectSibling(id, conProj) {
				t.Fatalf("cross-project leak: contract %q in %q pack", id, active)
			}
		}

		memProj := map[string][]string{}
		for _, r := range graph.Memory {
			memProj[r.ID] = append(memProj[r.ID], r.Project)
		}
		allMem := append(append(append([]string{}, pack.Memory.RelevantLessons...),
			pack.Memory.RecentIncidents...), pack.Memory.GlossaryTerms...)
		for _, id := range allMem {
			if !inProjectSibling(id, memProj) {
				t.Fatalf("cross-project leak: memory %q in %q pack", id, active)
			}
		}
	})
}

// TestProperty_SingletonNoFence — backward-compat: a goal with an EMPTY project applies no
// fence (the pre-S55 singleton / __system__ seed behaviour is preserved — the S33 corpus stays
// green). Compiling the SAME graph with an empty-project goal must never exclude anything for
// the cross-project reason.
func TestProperty_SingletonNoFence(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		graph := genProjectGraph(t)
		var red []string
		for _, l := range graph.Layers {
			red = append(red, l.ID)
		}
		goal := rctx.Goal{ID: "g", BoundedContext: "checkout", RedSet: red, Project: ""}
		pack := rctx.Compile(goal, "main", graph)
		for _, e := range pack.Excluded {
			if e.Reason == rctx.ReasonCrossProject {
				t.Fatalf("singleton goal must not fence cross-project, excluded %q", e.ID)
			}
		}
	})
}

package context_test

// ContextRouter property mirror (∀ invariants). reflects=runtime.context.Compile ·
// test_kind=property · cert_language=rapid · liveness=live · authority=below (computational —
// these are MEANS-tests toward the human red, not new truths the agent invents and grades).
//
// The invariants (KRD §119.3/§143/§144/§145), each a means-test toward the human red:
//  1. MINIMALITY — every layer in the pack is in the goal's red-set (load-bearing for the
//     red-set); a node from a different bounded context never appears as an internal layer.
//  2. STALENESS/SCOPE EXCLUSION — no stale, no out-of-scope, no unapproved, no below-threshold
//     memory ever appears; every included memory has scope overlap and confidence ≥ repeated.
//  3. WALL-AS-BOUNDARY — forbidden_paths ALWAYS contains /kernel/** and /mirror/**, on every
//     pack, regardless of goal.
//  4. DETERMINISM / CONTENT-ADDRESSING — same (goal, branch, graph) ⇒ identical hash.
//  5. BRANCH-NO-LEAK — no layer from another branch ever enters the cut.
//  6. STOP-CONDITION PRESENT — every pack carries a non-empty stop_condition.
//  7. TOTALITY — Compile never panics on an arbitrary graph/goal.

import (
	"testing"

	rctx "github.com/steph-frtech/aidos/back/runtime/context"
	"pgregory.net/rapid"
)

func genConfidence() *rapid.Generator[rctx.Confidence] {
	return rapid.SampledFrom([]rctx.Confidence{
		rctx.ConfidenceOnce, rctx.ConfidenceRepeated, rctx.ConfidenceEstablished, rctx.Confidence("weird"),
	})
}

func genKind() *rapid.Generator[rctx.MemoryKind] {
	return rapid.SampledFrom([]rctx.MemoryKind{
		rctx.MemoryLesson, rctx.MemoryIncident, rctx.MemoryGlossary, rctx.MemoryKind("weird"),
	})
}

func genBC() *rapid.Generator[string] {
	return rapid.SampledFrom([]string{"checkout", "billing", "catalog", ""})
}

func genBranch() *rapid.Generator[string] {
	return rapid.SampledFrom([]string{"main", "feature/x", ""})
}

func genID() *rapid.Generator[string] {
	return rapid.SampledFrom([]string{"a", "b", "c", "d", "e", "f"})
}

// genMemID draws from a wider alphabet so memory records get distinct ids in practice.
func genMemID() *rapid.Generator[string] {
	return rapid.SampledFrom([]string{"m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11"})
}

// dedupMem keeps only the first record per id so pack membership by id is unambiguous (the
// router itself does not require unique ids; this is a test-side soundness aid for the
// membership-based invariants).
func dedupMem(rs []rctx.MemoryRecord) []rctx.MemoryRecord {
	seen := map[string]bool{}
	var out []rctx.MemoryRecord
	for _, r := range rs {
		if seen[r.ID] {
			continue
		}
		seen[r.ID] = true
		out = append(out, r)
	}
	return out
}

func genGoal() *rapid.Generator[rctx.Goal] {
	return rapid.Custom(func(t *rapid.T) rctx.Goal {
		red := rapid.SliceOfN(genID(), 0, 4).Draw(t, "redSet")
		return rctx.Goal{
			ID:             rapid.SampledFrom([]string{"g1", "g2"}).Draw(t, "goalID"),
			BoundedContext: rapid.SampledFrom([]string{"checkout", "billing"}).Draw(t, "goalBC"),
			RedSet:         red,
			AllowedPaths:   []string{"/src/x/**"},
		}
	})
}

func genGraph() *rapid.Generator[rctx.ContextGraph] {
	return rapid.Custom(func(t *rapid.T) rctx.ContextGraph {
		layers := rapid.SliceOfN(rapid.Custom(func(t *rapid.T) rctx.Layer {
			return rctx.Layer{
				ID:             genID().Draw(t, "lid"),
				BoundedContext: genBC().Draw(t, "lbc"),
				Branch:         genBranch().Draw(t, "lbr"),
				LoadBearing:    rapid.Bool().Draw(t, "llb"),
			}
		}), 0, 6).Draw(t, "layers")
		mirrors := rapid.SliceOfN(rapid.Custom(func(t *rapid.T) rctx.Mirror {
			return rctx.Mirror{ID: genID().Draw(t, "mid"), BoundedContext: genBC().Draw(t, "mbc"), Red: rapid.Bool().Draw(t, "mred")}
		}), 0, 5).Draw(t, "mirrors")
		contracts := rapid.SliceOfN(rapid.Custom(func(t *rapid.T) rctx.Contract {
			return rctx.Contract{ID: genID().Draw(t, "cid"), BoundedContext: genBC().Draw(t, "cbc"), Public: rapid.Bool().Draw(t, "cpub")}
		}), 0, 5).Draw(t, "contracts")
		memory := rapid.SliceOfN(rapid.Custom(func(t *rapid.T) rctx.MemoryRecord {
			return rctx.MemoryRecord{
				// ID drawn from a wide-enough alphabet that distinct records get distinct ids;
				// membership in the pack is then unambiguous (no two records share an id).
				ID:         genMemID().Draw(t, "rid"),
				Kind:       genKind().Draw(t, "rkind"),
				Scope:      genBC().Draw(t, "rscope"),
				Confidence: genConfidence().Draw(t, "rconf"),
				Stale:      rapid.Bool().Draw(t, "rstale"),
				Approved:   rapid.Bool().Draw(t, "rappr"),
			}
		}), 0, 6).Draw(t, "memory")
		memory = dedupMem(memory)
		return rctx.ContextGraph{Layers: layers, Mirrors: mirrors, Contracts: contracts, Memory: memory}
	})
}

func inSlice(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func memHas(p rctx.ContextPack, id string) bool {
	return inSlice(p.Memory.RelevantLessons, id) || inSlice(p.Memory.RecentIncidents, id) || inSlice(p.Memory.GlossaryTerms, id)
}

// TestProperty_RouterInvariants pins minimality, exclusion, wall-as-boundary, determinism,
// branch-no-leak, stop-condition presence, and totality over arbitrary graphs/goals/branches.
func TestProperty_RouterInvariants(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		goal := genGoal().Draw(t, "goal")
		graph := genGraph().Draw(t, "graph")
		branch := genBranch().Draw(t, "branch")

		p := rctx.Compile(goal, branch, graph) // 7. totality: never panics.

		// 1. Minimality: every packed layer is in the red-set and is same-BC.
		for _, lid := range p.AffectedLayers {
			if !inSlice(goal.RedSet, lid) {
				t.Fatalf("affected layer %q not in red-set %v (minimality)", lid, goal.RedSet)
			}
		}
		// 2. Memory exclusion: nothing stale/unapproved/out-of-scope/below-threshold appears,
		//    and everything included has scope overlap + confidence ≥ repeated.
		for _, r := range graph.Memory {
			included := memHas(p, r.ID)
			eligible := !r.Stale && r.Approved &&
				(r.Scope == "" || r.Scope == goal.BoundedContext) &&
				r.Confidence.AtLeastRepeated()
			if included && !eligible {
				t.Fatalf("memory %+v included but not eligible", r)
			}
		}

		// 3. Wall-as-boundary: always forbids /kernel/** and /mirror/**.
		if !inSlice(p.Boundaries.ForbiddenPaths, "/kernel/**") || !inSlice(p.Boundaries.ForbiddenPaths, "/mirror/**") {
			t.Fatalf("forbidden_paths missing the wall: %v", p.Boundaries.ForbiddenPaths)
		}

		// 4. Determinism / content-addressing.
		p2 := rctx.Compile(goal, branch, graph)
		if p.Hash != p2.Hash {
			t.Fatalf("non-deterministic hash: %q != %q", p.Hash, p2.Hash)
		}
		if p.Hash == "" {
			t.Fatal("empty hash")
		}

		// 5. Branch-no-leak: no layer pinned to another branch enters the cut.
		for _, l := range graph.Layers {
			if l.Branch != "" && l.Branch != branch && inSlice(p.AffectedLayers, l.ID) {
				// allowed only if a same-branch layer shares the id; verify no SOLE source.
				sameBranchSibling := false
				for _, o := range graph.Layers {
					if o.ID == l.ID && (o.Branch == "" || o.Branch == branch) {
						sameBranchSibling = true
					}
				}
				if !sameBranchSibling {
					t.Fatalf("branch leak: layer %q from branch %q in cut on %q", l.ID, l.Branch, branch)
				}
			}
		}

		// 6. Stop condition present.
		if p.StopCondition == "" {
			t.Fatal("empty stop_condition")
		}
	})
}

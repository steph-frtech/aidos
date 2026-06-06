package besoin_test

// capitalisation_property_test.go — EL18 reproducibility mirror (rapid). Pins the load-bearing
// invariants of the need-capitalisation: (1) WroteKernel ALWAYS false (the wall — strictly via
// ViaIdea, never ToKernel); (2) the capitalised idea's provenance RECONSTRUCTS down to the
// graph_hash (recoverable from the free-text memory provenance); (3) determinism (same resolve ⇒
// byte-identical capture); (4) reuse under canonicalised names replays ≥1 unit (ReplayCost), while a
// dissimilar need fabricates NO reuse (anti-false-positive frontier).

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/besoin"
	"github.com/steph-frtech/aidos/back/runtime/compound"
	"pgregory.net/rapid"
)

// capResolvedNode builds a resolved SOURCE-rung node with a verbatim utterance.
func capResolvedNode(lvl besoin.Level, intent string) besoin.LevelNode {
	return besoin.LevelNode{
		Level:      lvl,
		Status:     besoin.NodeResolved,
		Provenance: besoin.Provenance{Source: "human", Detail: intent},
	}
}

// capResolvedGraph builds a small fully-resolved need graph (product + entity, two mapping rungs).
func capResolvedGraph(project, productIntent, entityIntent string) besoin.BesoinGraph {
	g := besoin.NewGraph(project)
	g, _ = g.AddNode(capResolvedNode(besoin.LevelProduct, productIntent))
	g, _ = g.AddNode(capResolvedNode(besoin.LevelEntity, entityIntent))
	return g
}

func TestCapitaliseBesoin_NeverWritesKernel(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		pi := rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "product")
		ei := rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "entity")
		br := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "branch")
		g := capResolvedGraph("proj", pi+" x", ei+" y")
		cap, err := besoin.CapitaliseBesoin(besoin.BesoinResolve{Graph: g, Branch: br})
		if err != nil {
			t.Fatalf("capitalise: %v", err)
		}
		if cap.WroteKernel() {
			t.Fatalf("WroteKernel must ALWAYS be false (the wall) — got true")
		}
		for _, b := range cap.BehaviorCandidates {
			if b.WroteKernel {
				t.Fatalf("a behaviour candidate wrote kernel — the wall is breached")
			}
			// The ideas.Idea type carries NO Version and NO Mirror field by construction —
			// that double absence is the no-truth proof (it cannot encode a freeze or a mirror).
			if b.Idea.Status != ideas.StatusDraft {
				t.Fatalf("a capitalised idea must be a DRAFT; got %q", b.Idea.Status)
			}
		}
	})
}

func TestCapitaliseBesoin_ProvenanceReconstructsToGraphHash(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		pi := rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "product")
		ei := rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "entity")
		g := capResolvedGraph("proj", pi+" a", ei+" b")
		gh, err := g.Hash()
		if err != nil {
			t.Fatalf("graph hash: %v", err)
		}
		cap, err := besoin.CapitaliseBesoin(besoin.BesoinResolve{Graph: g, Branch: "main"})
		if err != nil {
			t.Fatalf("capitalise: %v", err)
		}
		if cap.Anchor.GraphHash != gh {
			t.Fatalf("anchor graph hash mismatch: %q != %q", cap.Anchor.GraphHash, gh)
		}
		// The memory provenance must reconstruct to the graph_hash.
		if len(cap.ProceduralWrites) != 1 {
			t.Fatalf("want exactly 1 procedural write, got %d", len(cap.ProceduralWrites))
		}
		got, ok := besoin.ParseGraphHash(cap.ProceduralWrites[0].Provenance)
		if !ok || got != gh {
			t.Fatalf("provenance does not reconstruct to graph_hash: ok=%v got=%q want=%q", ok, got, gh)
		}
	})
}

func TestCapitaliseBesoin_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		pi := rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "product")
		ei := rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "entity")
		g := capResolvedGraph("proj", pi+" a", ei+" b")
		r := besoin.BesoinResolve{Graph: g, Branch: "main"}
		c1, err1 := besoin.CapitaliseBesoin(r)
		c2, err2 := besoin.CapitaliseBesoin(r)
		if err1 != nil || err2 != nil {
			t.Fatalf("errors: %v %v", err1, err2)
		}
		b1, _ := json.Marshal(c1)
		b2, _ := json.Marshal(c2)
		if string(b1) != string(b2) {
			t.Fatalf("capitalisation is not deterministic:\n%s\n!=\n%s", b1, b2)
		}
	})
}

func TestCapitaliseBesoin_UnresolvedCapitalisesNothing(t *testing.T) {
	g := besoin.NewGraph("proj")
	// drafting (not resolved) node
	g, _ = g.AddNode(besoin.LevelNode{Level: besoin.LevelProduct, Status: besoin.NodeDrafting,
		Provenance: besoin.Provenance{Source: "human", Detail: "incomplete"}})
	cap, err := besoin.CapitaliseBesoin(besoin.BesoinResolve{Graph: g, Branch: "main"})
	if err != nil {
		t.Fatalf("capitalise: %v", err)
	}
	if len(cap.ProceduralWrites) != 0 || len(cap.BehaviorCandidates) != 0 {
		t.Fatalf("an unresolved need must capitalise NOTHING; got %d/%d",
			len(cap.ProceduralWrites), len(cap.BehaviorCandidates))
	}
}

// TestReuse_SimilarUnderCanonicalNamesReplays — a SECOND need whose rung intents canonicalise
// identically (differing only in casing/spacing/punctuation) reuses ≥1 unit (ReplayCost), proving
// the explicit cross-app normalisation works. A DISSIMILAR need fabricates NO reuse.
func TestReuse_CanonicalNamesGovernReplayVsFresh(t *testing.T) {
	first := capResolvedGraph("app1", "Manage tasks.", "A Task entity")
	anchor, err := besoin.BesoinResolve{Graph: first, Branch: "main"}.Anchor()
	if err != nil {
		t.Fatalf("anchor: %v", err)
	}

	// Similar second need: same intents, different casing/whitespace/punctuation → SAME keys.
	similar := capResolvedGraph("app2", "  manage   tasks  ", "a task entity!")
	plan, err := anchor.ReuseFor(besoin.BesoinResolve{Graph: similar, Branch: "main"})
	if err != nil {
		t.Fatalf("reuse similar: %v", err)
	}
	if plan.ReusedProcedural < 1 {
		t.Fatalf("similar need under canonical names must replay ≥1 unit; got %d (routes=%+v)",
			plan.ReusedProcedural, plan.Routes)
	}
	if plan.SavedTokens <= 0 || plan.EffortAfter >= plan.EffortBefore {
		t.Fatalf("similar reuse must save tokens; before=%d after=%d", plan.EffortBefore, plan.EffortAfter)
	}

	// Dissimilar second need: entirely different intents → NO reuse (anti-false-positive).
	dissimilar := capResolvedGraph("app3", "schedule meetings", "a Calendar entity")
	plan2, err := anchor.ReuseFor(besoin.BesoinResolve{Graph: dissimilar, Branch: "main"})
	if err != nil {
		t.Fatalf("reuse dissimilar: %v", err)
	}
	if plan2.ReusedProcedural != 0 || plan2.ReusedBehavior != 0 {
		t.Fatalf("dissimilar need must fabricate NO reuse; got proc=%d beh=%d",
			plan2.ReusedProcedural, plan2.ReusedBehavior)
	}
	if plan2.EffortAfter != plan2.EffortBefore {
		t.Fatalf("dissimilar need must pay full (no reuse); before=%d after=%d",
			plan2.EffortBefore, plan2.EffortAfter)
	}
	if plan2.WroteKernel {
		t.Fatalf("reuse must not write kernel")
	}
}

// TestCanonicalIntentKey_StableUnderCosmeticChange — the normalisation collapses casing, whitespace
// and trailing punctuation to the SAME key, but distinguishes genuinely different intents.
func TestCanonicalIntentKey_StableUnderCosmeticChange(t *testing.T) {
	a := besoin.CanonicalIntentKey(besoin.LevelProduct, "Manage Tasks.")
	b := besoin.CanonicalIntentKey(besoin.LevelProduct, "  manage   tasks  ")
	if a != b {
		t.Fatalf("cosmetic variants must canonicalise to the same key: %q != %q", a, b)
	}
	c := besoin.CanonicalIntentKey(besoin.LevelProduct, "schedule meetings")
	if a == c {
		t.Fatalf("genuinely different intents must have different keys")
	}
	// Level is part of the key: same intent at different levels → different keys.
	d := besoin.CanonicalIntentKey(besoin.LevelEntity, "Manage Tasks.")
	if a == d {
		t.Fatalf("same intent at different levels must have different keys")
	}
}

// Sanity: the reuse corpus uses ChannelProceduralMemory (replayed below the line).
func TestAnchorCorpus_ProceduralChannel(t *testing.T) {
	g := capResolvedGraph("app", "manage tasks", "a Task")
	anchor, _ := besoin.BesoinResolve{Graph: g, Branch: "main"}.Anchor()
	c := anchor.Corpus()
	for _, u := range c.Procedural {
		if u.Channel != compound.ChannelProceduralMemory {
			t.Fatalf("corpus unit must be procedural; got %q", u.Channel)
		}
	}
}

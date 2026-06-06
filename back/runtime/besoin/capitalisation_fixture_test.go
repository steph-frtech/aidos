package besoin_test

// capitalisation_fixture_test.go — EL18 worked-example fixtures. Pins: NoEmit rungs (journey/view)
// seed anchors but are NOT reusable AnchorUnits (they carry no replayable idea-intent); the
// capitalisation proposes a DRAFT idea via ViaIdea (provenance carries the graph_hash); a partially
// resolved need capitalises nothing.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/besoin"
)

func TestCapitalise_NoEmitRungsNotInAnchorUnits(t *testing.T) {
	g := besoin.NewGraph("proj")
	g, _ = g.AddNode(besoin.LevelNode{Level: besoin.LevelProduct, Status: besoin.NodeResolved,
		Provenance: besoin.Provenance{Source: "human", Detail: "manage tasks"}})
	g, _ = g.AddNode(besoin.LevelNode{Level: besoin.LevelJourney, Status: besoin.NodeResolved,
		Provenance: besoin.Provenance{Source: "human", Detail: "Given a user When they add a task Then it appears"}})
	g, _ = g.AddNode(besoin.LevelNode{Level: besoin.LevelEntity, Status: besoin.NodeResolved,
		Provenance: besoin.Provenance{Source: "human", Detail: "a Task entity"}})

	anchor, err := besoin.BesoinResolve{Graph: g, Branch: "main"}.Anchor()
	if err != nil {
		t.Fatalf("anchor: %v", err)
	}
	for _, u := range anchor.Units {
		if besoin.IsNoEmit(u.Level) {
			t.Fatalf("NoEmit rung %q must not be a reusable AnchorUnit", u.Level)
		}
	}
	// product + entity map; journey is NoEmit → exactly 2 units.
	if len(anchor.Units) != 2 {
		t.Fatalf("want 2 mapping units (product, entity); got %d: %+v", len(anchor.Units), anchor.Units)
	}
}

func TestCapitalise_ProposesDraftIdeaViaWall(t *testing.T) {
	g := besoin.NewGraph("proj")
	g, _ = g.AddNode(besoin.LevelNode{Level: besoin.LevelProduct, Status: besoin.NodeResolved,
		Provenance: besoin.Provenance{Source: "human", Detail: "manage tasks"}})
	g, _ = g.AddNode(besoin.LevelNode{Level: besoin.LevelEntity, Status: besoin.NodeResolved,
		Provenance: besoin.Provenance{Source: "human", Detail: "a Task entity"}})

	cap, err := besoin.CapitaliseBesoin(besoin.BesoinResolve{Graph: g, Branch: "main"})
	if err != nil {
		t.Fatalf("capitalise: %v", err)
	}
	if len(cap.BehaviorCandidates) != 1 {
		t.Fatalf("want exactly 1 behaviour candidate; got %d", len(cap.BehaviorCandidates))
	}
	cand := cap.BehaviorCandidates[0]
	if cand.WroteKernel {
		t.Fatalf("candidate must not write kernel (the wall)")
	}
	// ViaIdea freezes Detail "memory:<id>" — the wall artefact (verified in firewall.go).
	if !strings.HasPrefix(cand.Idea.Provenance.Detail, "memory:") {
		t.Fatalf("ViaIdea must freeze a memory: provenance; got %q", cand.Idea.Provenance.Detail)
	}
	// The graph_hash is recoverable from the procedural memory's free-text provenance.
	gh, _ := g.Hash()
	got, ok := besoin.ParseGraphHash(cap.ProceduralWrites[0].Provenance)
	if !ok || got != gh {
		t.Fatalf("provenance must reconstruct to graph_hash %q; ok=%v got=%q", gh, ok, got)
	}
}

func TestCapitalise_PartiallyResolvedCapitalisesNothing(t *testing.T) {
	g := besoin.NewGraph("proj")
	g, _ = g.AddNode(besoin.LevelNode{Level: besoin.LevelProduct, Status: besoin.NodeResolved,
		Provenance: besoin.Provenance{Source: "human", Detail: "manage tasks"}})
	g, _ = g.AddNode(besoin.LevelNode{Level: besoin.LevelEntity, Status: besoin.NodeDrafting,
		Provenance: besoin.Provenance{Source: "human", Detail: "a Task entity (wip)"}})

	cap, err := besoin.CapitaliseBesoin(besoin.BesoinResolve{Graph: g, Branch: "main"})
	if err != nil {
		t.Fatalf("capitalise: %v", err)
	}
	if len(cap.ProceduralWrites) != 0 || len(cap.BehaviorCandidates) != 0 {
		t.Fatalf("partially resolved need must capitalise NOTHING; got %d/%d",
			len(cap.ProceduralWrites), len(cap.BehaviorCandidates))
	}
}

func TestParseGraphHash_NonBesoinProvenance(t *testing.T) {
	if _, ok := besoin.ParseGraphHash("memory:abc"); ok {
		t.Fatalf("a non-besoin provenance must not parse as a graph_hash")
	}
	if _, ok := besoin.ParseGraphHash("besoin:"); ok {
		t.Fatalf("an empty besoin: provenance must not parse")
	}
	if gh, ok := besoin.ParseGraphHash("besoin:deadbeef"); !ok || gh != "deadbeef" {
		t.Fatalf("besoin:deadbeef must parse to deadbeef; ok=%v gh=%q", ok, gh)
	}
}

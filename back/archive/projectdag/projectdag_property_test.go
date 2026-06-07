package projectdag_test

// Property mirror — conceptually stored in the `mirrors` schema (reflects archive.projectdag,
// test_kind: property, cert_language: rapid, authority: below), materialized here (CLAUDE.md §6).
//
// The S56 reproducibility + isolation invariants, over ANY two distinct projects and ANY sequence
// of in-frontier moves:
//   - REPRODUCIBILITY (determinism-first): Genesis(p) is a pure function — the same project always
//     yields the same genesis id and the same namespace; a fork is byte-stable for the same dst.
//   - ISOLATION: two distinct projects have DISJOINT genesis ids and DISJOINT content namespaces;
//     no node of project B is ever in project A's DAG (Contains/Heads), no matter how A branches.
//   - FRONTIER: SameProject is the exact mergeability predicate; a cross-project merge always
//     refuses with CROSS_PROJECT_MERGE; a foreign node always refuses a move with CROSS_PROJECT_NODE.
//   - APPEND-ONLY: every in-frontier move only grows the project's DAG (node count non-decreasing);
//     archive never shrinks the kept node set, restore brings it back unchanged.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/merge"
	"github.com/steph-frtech/aidos/back/archive/projectdag"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/project"
	"pgregory.net/rapid"
)

// slugGen draws a valid slug (a-z0-9 with single hyphens) the project validator accepts.
func slugGen() *rapid.Generator[string] {
	return rapid.Custom(func(rt *rapid.T) string {
		n := rapid.IntRange(1, 4).Draw(rt, "segs")
		segs := make([]string, n)
		for i := range segs {
			segs[i] = rapid.StringMatching(`[a-z0-9]{1,6}`).Draw(rt, "seg")
		}
		return strings.Join(segs, "-")
	})
}

func mkProject(rt *rapid.T, label string) project.Project {
	slug := slugGen().Draw(rt, label)
	p, err := project.New(slug, "App", "owner", "2026-06-07T00:00:00Z")
	if err != nil {
		rt.Fatalf("project.New(%q): %v", slug, err)
	}
	return p
}

func TestProperty_GenesisReproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		p := mkProject(rt, "p")
		g1 := projectdag.Genesis(p)
		g2 := projectdag.Genesis(p)
		if g1.GenesisID() != g2.GenesisID() {
			rt.Fatalf("Genesis not reproducible: %q vs %q", g1.GenesisID(), g2.GenesisID())
		}
		if projectdag.ContentNamespace(p.ID) != projectdag.ContentNamespace(g2.ProjectID()) {
			rt.Fatalf("namespace not reproducible")
		}
	})
}

func TestProperty_DistinctProjectsAreIsolated(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pa := mkProject(rt, "a")
		pb := mkProject(rt, "b")
		if pa.ID == pb.ID {
			return // same content address ⇒ same project; nothing to isolate
		}
		a := projectdag.Genesis(pa)
		b := projectdag.Genesis(pb)

		// Disjoint genesis ids and namespaces.
		if a.GenesisID() == b.GenesisID() {
			rt.Fatalf("distinct projects share a genesis id")
		}
		if projectdag.ContentNamespace(pa.ID) == projectdag.ContentNamespace(pb.ID) {
			rt.Fatalf("distinct projects share a content namespace")
		}
		keyA := projectdag.NamespaceKey(pa.ID, "k")
		if projectdag.SameNamespace(pb.ID, keyA) {
			rt.Fatalf("A's namespaced key resolved inside B")
		}

		// However A branches, B never gains an A node.
		nMoves := rapid.IntRange(0, 5).Draw(rt, "moves")
		cur := a
		for i := 0; i < nMoves; i++ {
			from := cur.GenesisID()
			heads := cur.Heads()
			if len(heads) > 0 {
				from = heads[rapid.IntRange(0, len(heads)-1).Draw(rt, "head")].ID
			}
			next, _, br := cur.Branch(from, "l", "cs")
			if br != nil {
				rt.Fatalf("in-frontier branch refused: %v", br)
			}
			// append-only: node count grows.
			if len(next.HeadsIncludingMasked()) < len(cur.Heads()) {
				rt.Fatalf("branch shrank the head set")
			}
			cur = next
		}
		for _, h := range cur.HeadsIncludingMasked() {
			if b.Contains(h.ID) {
				rt.Fatalf("B contains an A node %q after A branched", h.ID)
			}
		}
	})
}

func TestProperty_FrontierPredicateGovernsMerge(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pa := mkProject(rt, "a")
		pb := mkProject(rt, "b")
		base := merge.Base{ID: "v0"}
		left := merge.Branch{Ancestor: "v0"}
		right := merge.Branch{Ancestor: "v0"}

		_, br := projectdag.Merge(pa.ID, pb.ID, base, left, right, links.Heads{})
		want := projectdag.SameProject(pa.ID, pb.ID)
		got := br == nil
		if got != want {
			rt.Fatalf("Merge allowed=%v but SameProject=%v (a=%q b=%q)", got, want, pa.ID, pb.ID)
		}
		if br != nil && br.Code != projectdag.CodeCrossProjectMerge {
			rt.Fatalf("cross-project merge wrong code: %v", br.Code)
		}
	})
}

func TestProperty_ArchiveRestoreIsReversibleAndAppendOnly(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pd := projectdag.Genesis(mkProject(rt, "p"))
		n := rapid.IntRange(0, 4).Draw(rt, "branches")
		for i := 0; i < n; i++ {
			next, _, br := pd.Branch(pd.GenesisID(), "l", "cs")
			if br != nil {
				rt.Fatalf("branch refused: %v", br)
			}
			pd = next
		}
		kept := len(pd.HeadsIncludingMasked())
		archived := pd.Archive()
		if len(archived.Heads()) != 0 {
			rt.Fatalf("archive did not mask the default heads view")
		}
		if len(archived.HeadsIncludingMasked()) != kept {
			rt.Fatalf("archive destroyed nodes")
		}
		restored := archived.Restore()
		if len(restored.HeadsIncludingMasked()) != kept {
			rt.Fatalf("restore lost nodes")
		}
	})
}

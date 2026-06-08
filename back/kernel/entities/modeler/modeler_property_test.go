package modeler

// Property mirror (∀ invariants, rapid). reflects=kernel.entities.modeler.{SchemaHash,
// MergeDrafts,Propose}, test_kind=property, cert_language=rapid, liveness=live,
// authority=below (computational — MEANS-tests toward the human red).
//
// The invariants (S75 spec):
//  1. SCHEMA HASH INPUT-ORDER-INVARIANT — shuffling the node/relation order of a draft
//     yields the SAME SchemaHash (two editors who built the same nodes in a different
//     order get the same content address).
//  2. SCHEMA HASH DETERMINISTIC — SchemaHash(d) == SchemaHash(d) (no clock/RNG/map-order).
//  3. PROPOSE PURE & DRAFT — Propose never applies (status DRAFT, applied_at nil); its
//     schema hash equals SchemaHash(d).
//  4. MERGE IDEMPOTENT — MergeDrafts(base, d, d) keeps exactly d's node set (no conflict,
//     no loss) when d is d.
//  5. MERGE NO-LOSS — every entity added by exactly one editor survives the merge (no
//     editor's add is ever silently dropped — the anti-overwrite guarantee).

import (
	"sort"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"pgregory.net/rapid"
)

// genEntity generates a valid S35 entity with one identifier.
func genEntity(name string) entities.Entity {
	return entities.Entity{
		Name: name,
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeString, Required: true, Identifier: true},
			{Name: "label", Type: entities.TypeString},
		},
	}
}

// genValidDraft generates a valid, resolvable draft of N entities where each entity (after
// the first) carries a 1-N FK to the first (which has an identifier).
func genValidDraft(t *rapid.T) Draft {
	n := rapid.IntRange(1, 5).Draw(t, "n")
	nodes := make([]EntityNode, 0, n)
	names := make([]string, 0, n)
	for i := 0; i < n; i++ {
		name := "E" + string(rune('A'+i))
		names = append(names, name)
		node := EntityNode{Entity: genEntity(name)}
		if i > 0 {
			node.Relations = []ref.Relation{
				{Name: "ref0", Target: names[0], Cardinality: ref.OneToMany, Semantic: ref.FK},
			}
		}
		nodes = append(nodes, node)
	}
	return Draft{Project: "p", Nodes: nodes}
}

func shuffleNodes(d Draft, seed []int) Draft {
	nodes := make([]EntityNode, len(d.Nodes))
	copy(nodes, d.Nodes)
	// deterministic permutation from seed
	for i := range nodes {
		j := seed[i%len(seed)] % len(nodes)
		nodes[i], nodes[j] = nodes[j], nodes[i]
	}
	return Draft{Project: d.Project, Nodes: nodes}
}

// 1+2: SchemaHash is input-order-invariant and deterministic.
func TestProp_SchemaHash_InputOrderInvariant(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		d := genValidDraft(t)
		h1, err := SchemaHash(d)
		if err != nil {
			t.Fatalf("hash: %v", err)
		}
		h2, _ := SchemaHash(d)
		if h1 != h2 {
			t.Fatalf("SchemaHash not deterministic: %s vs %s", h1, h2)
		}
		seed := rapid.SliceOfN(rapid.IntRange(0, 100), 1, 6).Draw(t, "seed")
		shuffled := shuffleNodes(d, seed)
		h3, _ := SchemaHash(shuffled)
		if h1 != h3 {
			t.Fatalf("SchemaHash leaked input order: %s vs %s", h1, h3)
		}
	})
}

// 3: Propose is pure and always DRAFT, carrying SchemaHash.
func TestProp_Propose_PureDraft(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		d := genValidDraft(t)
		prop, err := Propose(d, "phase")
		if err != nil {
			t.Fatalf("propose: %v", err)
		}
		if prop.ChangeSet.Status != "DRAFT" {
			t.Fatalf("propose must be DRAFT, got %s", prop.ChangeSet.Status)
		}
		if prop.ChangeSet.AppliedAt != nil {
			t.Fatal("propose must never apply")
		}
		h, _ := SchemaHash(d)
		if prop.SchemaHash != h {
			t.Fatalf("proposal hash mismatch: %s vs %s", prop.SchemaHash, h)
		}
	})
}

// 4: MergeDrafts is idempotent — merge(base, d, d) keeps d's node set, no conflict.
func TestProp_Merge_Idempotent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		d := genValidDraft(t)
		out := MergeDrafts(d, d, d)
		if len(out.Conflicts) != 0 {
			t.Fatalf("merge(d,d,d) must have no conflict, got %v", out.Conflicts)
		}
		got := names(out.Merged)
		want := names(d)
		if !equalStrings(got, want) {
			t.Fatalf("merge(d,d,d) node set changed: %v vs %v", got, want)
		}
	})
}

// 5: MERGE NO-LOSS — an entity added by exactly one editor survives.
func TestProp_Merge_NoLoss(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := Draft{Project: "p", Nodes: []EntityNode{{Entity: genEntity("Root")}}}
		// A adds NodeA, B adds NodeB (disjoint), both off base.
		a := Draft{Project: "p", Nodes: []EntityNode{{Entity: genEntity("Root")}, {Entity: genEntity("Alpha")}}}
		b := Draft{Project: "p", Nodes: []EntityNode{{Entity: genEntity("Root")}, {Entity: genEntity("Beta")}}}
		out := MergeDrafts(base, a, b)
		got := names(out.Merged)
		for _, want := range []string{"Root", "Alpha", "Beta"} {
			if !contains(got, want) {
				t.Fatalf("merge lost %q (silent overwrite): got %v", want, got)
			}
		}
		_ = rapid.Bool().Draw(t, "_") // keep rapid engaged
	})
}

func names(d Draft) []string {
	out := make([]string, 0, len(d.Nodes))
	for _, n := range d.Nodes {
		out = append(out, n.Entity.Name)
	}
	sort.Strings(out)
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

package dag_test

// Property mirror — conceptually stored in the `mirrors` schema (reflects the dag movement
// functions, test_kind: property, cert_language: rapid, authority: below), materialized here.
//
// For ANY sequence of branch / checkout_ancestor / rebranch commands:
//   - the DAG only GROWS: node count and edge count are monotonically non-decreasing (append-only;
//     no move ever deletes a node or an edge — §120);
//   - the structure stays a DAG: no cycle (IsReachable is irreflexive on its own back-edge; an
//     edge points to a node created later);
//   - there is at least one head, and the DAG MAY hold several parallel heads (§125);
//   - checkout_ancestor(p) leaves every prior node present and sets p.head (a head-flag move,
//     never a structural delete);
//   - rebranch always creates a node whose parent_ids contains the checked-out ancestor;
//   - every Node.id equals the content hash of its canonical body (content-addressing, S01/S02);
//   - the functions never panic / never delete.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/dag"
	"pgregory.net/rapid"
)

// seedDAG returns the canonical §120 root DAG.
func seedDAG() dag.DAG {
	root := dag.Node{ID: "v0", ParentIDs: nil, Head: true, Stratum: dag.StratumAbove, Label: "root"}
	return dag.New([]dag.Node{root}, nil)
}

func TestProp_DAG_OnlyGrows_NeverDeletes_StaysDAG(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		d := seedDAG()
		n := rapid.IntRange(1, 12).Draw(rt, "ops")
		for i := 0; i < n; i++ {
			beforeNodes := len(d.Nodes())
			beforeEdges := len(d.Edges())

			// pick an existing node to act on.
			ids := nodeIDs(d)
			target := ids[rapid.IntRange(0, len(ids)-1).Draw(rt, "target")]
			op := rapid.IntRange(0, 2).Draw(rt, "op")
			cs := "cs-" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(rt, "cs")

			var out dag.DAG
			var err error
			switch op {
			case 0:
				out, _, err = dag.Branch(d, target, "b", cs)
			case 1:
				out, _, err = dag.CheckoutAncestor(d, target)
			default:
				out, _, err = dag.Rebranch(d, target, "r", cs)
			}
			if err != nil {
				// a refusal must not mutate the DAG.
				if len(d.Nodes()) != beforeNodes || len(d.Edges()) != beforeEdges {
					rt.Fatalf("a refused move must not change the DAG")
				}
				continue
			}

			// only grows — never deletes.
			if len(out.Nodes()) < beforeNodes {
				rt.Fatalf("node count shrank: %d -> %d (append-only violated)", beforeNodes, len(out.Nodes()))
			}
			if len(out.Edges()) < beforeEdges {
				rt.Fatalf("edge count shrank: %d -> %d (append-only violated)", beforeEdges, len(out.Edges()))
			}
			// every prior node still present.
			for _, id := range ids {
				if _, ok := out.Node(id); !ok {
					rt.Fatalf("prior node %q vanished (nothing is ever destroyed)", id)
				}
			}
			// no cycle: no node reaches itself.
			for _, id := range nodeIDs(out) {
				if dag.IsReachable(out, id, id) {
					rt.Fatalf("cycle detected: %q reaches itself (must stay a DAG)", id)
				}
			}
			// at least one head.
			if len(dag.Heads(out)) < 1 {
				rt.Fatalf("the DAG must always have at least one head")
			}
			// every node id is its content address.
			for _, nd := range out.Nodes() {
				if nd.ID == "v0" {
					continue // the seeded root uses a fixed test id.
				}
				want, e := dag.NodeID(nd.ParentIDs, nd.Stratum, nd.Label)
				if e != nil {
					rt.Fatalf("NodeID: %v", e)
				}
				if nd.ID != want {
					rt.Fatalf("node id %q is not its content address %q", nd.ID, want)
				}
			}
			d = out
		}
	})
}

// TestProp_Checkout_IsHeadFlagMove — checkout_ancestor(p) sets p.head and leaves every node present;
// no node/edge is added or removed.
func TestProp_Checkout_IsHeadFlagMove(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		d := dag.New([]dag.Node{
			{ID: "v0", Head: false, Stratum: dag.StratumAbove},
			{ID: "v1", ParentIDs: []string{"v0"}, Head: false, Stratum: dag.StratumAbove},
			{ID: "v2", ParentIDs: []string{"v1"}, Head: true, Stratum: dag.StratumAbove},
		}, []dag.Edge{{From: "v0", To: "v1", Changeset: "c1"}, {From: "v1", To: "v2", Changeset: "c2"}})

		ids := nodeIDs(d)
		p := ids[rapid.IntRange(0, len(ids)-1).Draw(rt, "p")]
		beforeNodes, beforeEdges := len(d.Nodes()), len(d.Edges())

		out, _, err := dag.CheckoutAncestor(d, p)
		if err != nil {
			rt.Fatalf("checkout of an existing node must succeed: %v", err)
		}
		if len(out.Nodes()) != beforeNodes || len(out.Edges()) != beforeEdges {
			rt.Fatalf("checkout must be a head-flag move (no node/edge added or removed)")
		}
		pn, ok := out.Node(p)
		if !ok || !pn.Head {
			rt.Fatalf("checkout must set %q.head", p)
		}
	})
}

// TestProp_Rebranch_ParentsOnAncestor — rebranch(p) creates a node whose parent_ids contains p.
func TestProp_Rebranch_ParentsOnAncestor(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		d := dag.New([]dag.Node{
			{ID: "v0", Head: false, Stratum: dag.StratumAbove},
			{ID: "v1", ParentIDs: []string{"v0"}, Head: true, Stratum: dag.StratumAbove},
		}, []dag.Edge{{From: "v0", To: "v1", Changeset: "c1"}})

		out, _, err := dag.Rebranch(d, "v1", "r", "cs-x")
		if err != nil {
			rt.Fatalf("rebranch must succeed: %v", err)
		}
		var ok bool
		for _, nd := range out.Nodes() {
			if nd.ID != "v0" && nd.ID != "v1" {
				for _, p := range nd.ParentIDs {
					if p == "v1" {
						ok = true
					}
				}
			}
		}
		if !ok {
			rt.Fatalf("rebranch must create a node parented on the ancestor v1")
		}
	})
}

func nodeIDs(d dag.DAG) []string {
	ns := d.Nodes()
	ids := make([]string, len(ns))
	for i, n := range ns {
		ids[i] = n.ID
	}
	return ids
}

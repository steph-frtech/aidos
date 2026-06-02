package dag_test

// DAG-navigation fixture mirror — conceptually stored in the `mirrors` schema
// (reflects: dag.node/dag.edge "version-dag-§120", test_kind: fixture, cert_language: fixture,
// authority: above), materialized here for the runner (the mirrors schema persistence is the
// S06 substrate; this file IS the red→green proof per the bootstrap exception).
//
// It mirrors the THREE §121 navigation moves over the canonical §120 graph as
// state → command → events:
//   - branch off the root / off an inner ancestor → Branched, a new node parented on the
//     from-phase, the head moves, the from-node is NOT deleted (append-only);
//   - checkout_ancestor → HeadMoved, the ancestor's head flag set, EVERY later node still
//     present (append-only — a backward move, nothing destroyed);
//   - rebranch from the recheckout-ed ancestor → Rebranched, a NEW node parented on it,
//     reachable from the root, the abandoned line STILL present (THE done case).
//
// These rows are MEANS-tests toward the human red (KRD §120/§121): "you can branch, checkout an
// ancestor, and rebranch all work — and the abandoned line is never destroyed."

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/dag"
)

// edge builds a ChangeSet edge reusing an existing changesets.changeset.id (S20) — the DAG is a
// relation over existing rows, it never copies a ChangeSet body.
func edge(from, to, changeset string) dag.Edge {
	return dag.Edge{From: from, To: to, Changeset: changeset}
}

// node builds a phase node. id is the content address (the test seeds known ids; production ids
// come from phases.StablePhase.Version / records.Hash). stratum is the waterline placement.
func node(id string, parents []string, head bool, stratum dag.Stratum, label string) dag.Node {
	return dag.Node{ID: id, ParentIDs: parents, Head: head, Stratum: stratum, Label: label}
}

// containsHead reports whether the named node is currently a head in the DAG.
func isHead(d dag.DAG, id string) bool {
	for _, h := range dag.Heads(d) {
		if h.ID == id {
			return true
		}
	}
	return false
}

func mustNode(t *testing.T, d dag.DAG, id string) dag.Node {
	t.Helper()
	n, ok := d.Node(id)
	if !ok {
		t.Fatalf("node %q must still exist in the DAG (append-only — nothing is destroyed)", id)
	}
	return n
}

// TestBranch_OffRoot_MovesHead_NeverDeletes — branch from the root v0: a new node v1 parented on
// v0 becomes the head, v0 stays present with head==false (the head moved, v0 not deleted).
func TestBranch_OffRoot_MovesHead_NeverDeletes(t *testing.T) {
	d := dag.New([]dag.Node{
		node("v0", nil, true, dag.StratumAbove, "root"),
	}, nil)

	out, ev, err := dag.Branch(d, "v0", "main-line", "cs-v0-v1")
	if err != nil {
		t.Fatalf("branch off root must succeed: %v", err)
	}
	if ev != dag.EventBranched {
		t.Fatalf("event = %q, want Branched", ev)
	}

	// The new node id is content-addressed; the test asserts via Heads, not a fixed id.
	heads := dag.Heads(out)
	if len(heads) != 1 {
		t.Fatalf("after branch off root there must be exactly one head, got %d", len(heads))
	}
	newHead := heads[0]
	if len(newHead.ParentIDs) != 1 || newHead.ParentIDs[0] != "v0" {
		t.Fatalf("new head must be parented on v0, got parents %v", newHead.ParentIDs)
	}

	v0 := mustNode(t, out, "v0")
	if v0.Head {
		t.Fatalf("v0.head must be false after the head moved (head moved, v0 NOT deleted)")
	}
}

// TestBranch_OffInnerAncestor_ParallelHeads — branch w1 off the inner ancestor v1 while v2 is the
// head: a parallel line of truth, both heads live (§125).
func TestBranch_OffInnerAncestor_ParallelHeads(t *testing.T) {
	d := dag.New([]dag.Node{
		node("v0", nil, false, dag.StratumAbove, ""),
		node("v1", []string{"v0"}, false, dag.StratumAbove, ""),
		node("v2", []string{"v1"}, true, dag.StratumAbove, ""),
	}, []dag.Edge{edge("v0", "v1", "cs1"), edge("v1", "v2", "cs2")})

	out, ev, err := dag.Branch(d, "v1", "tva-eu-variant", "cs-v1-w1")
	if err != nil {
		t.Fatalf("branch off inner ancestor must succeed: %v", err)
	}
	if ev != dag.EventBranched {
		t.Fatalf("event = %q, want Branched", ev)
	}

	// v2 must remain a head AND the new branch is a head — two parallel lines of truth (§125).
	heads := dag.Heads(out)
	if len(heads) != 2 {
		t.Fatalf("a branch off an inner ancestor must yield TWO parallel heads (§125), got %d", len(heads))
	}
	if !isHead(out, "v2") {
		t.Fatalf("v2 must remain a head (a branch can be stable while another is in flux, §125)")
	}
	// the new branch is parented on v1.
	var found bool
	for _, h := range heads {
		if h.ID != "v2" && len(h.ParentIDs) == 1 && h.ParentIDs[0] == "v1" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the new parallel head must be parented on v1")
	}
}

// TestCheckoutAncestor_BackwardMove_NothingDestroyed — checkout v1 (a backward move): v1 becomes
// the head, v2 and w1 STILL EXIST (append-only — the abandoned line stays in the DAG).
func TestCheckoutAncestor_BackwardMove_NothingDestroyed(t *testing.T) {
	d := dag.New([]dag.Node{
		node("v0", nil, false, dag.StratumAbove, ""),
		node("v1", []string{"v0"}, false, dag.StratumAbove, ""),
		node("v2", []string{"v1"}, true, dag.StratumAbove, ""),
		node("w1", []string{"v1"}, false, dag.StratumBelow, ""),
	}, []dag.Edge{edge("v0", "v1", "cs1"), edge("v1", "v2", "cs2"), edge("v1", "w1", "cs3")})

	before := len(d.Nodes())
	out, ev, err := dag.CheckoutAncestor(d, "v1")
	if err != nil {
		t.Fatalf("checkout ancestor v1 must succeed: %v", err)
	}
	if ev != dag.EventHeadMoved {
		t.Fatalf("event = %q, want HeadMoved", ev)
	}

	v1 := mustNode(t, out, "v1")
	if !v1.Head {
		t.Fatalf("v1.head must be true after checkout_ancestor")
	}
	// every later node still present — nothing is destroyed.
	mustNode(t, out, "v2")
	mustNode(t, out, "w1")
	if len(out.Nodes()) != before {
		t.Fatalf("checkout is a head-flag move: node count must not change (was %d, now %d)", before, len(out.Nodes()))
	}
}

// TestRebranch_OpensNewLine_AbandonedLinePersists — rebranch v2a from the recheckout-ed ancestor
// v1: a NEW node parented on v1, reachable from the root v0, the abandoned line v2 STILL present
// (THE done case).
func TestRebranch_OpensNewLine_AbandonedLinePersists(t *testing.T) {
	d := dag.New([]dag.Node{
		node("v0", nil, false, dag.StratumAbove, ""),
		node("v1", []string{"v0"}, true, dag.StratumAbove, ""), // recheckout-ed head
		node("v2", []string{"v1"}, false, dag.StratumAbove, ""),
		node("w1", []string{"v1"}, false, dag.StratumBelow, ""),
	}, []dag.Edge{edge("v0", "v1", "cs1"), edge("v1", "v2", "cs2"), edge("v1", "w1", "cs3")})

	out, ev, err := dag.Rebranch(d, "v1", "v2a-line", "cs-v1-v2a")
	if err != nil {
		t.Fatalf("rebranch from v1 must succeed: %v", err)
	}
	if ev != dag.EventRebranched {
		t.Fatalf("event = %q, want Rebranched", ev)
	}

	// the abandoned line v2 still exists (THE done case — old line never destroyed).
	mustNode(t, out, "v2")

	// the new node is parented on v1 and is the head.
	var newNode *dag.Node
	for _, h := range dag.Heads(out) {
		hh := h
		if hh.ID != "v2" && hh.ID != "w1" && len(hh.ParentIDs) == 1 && hh.ParentIDs[0] == "v1" {
			newNode = &hh
		}
	}
	if newNode == nil {
		t.Fatalf("rebranch must create a NEW node parented on v1 as a head")
	}
	// reachable from the root v0.
	if !dag.IsReachable(out, "v0", newNode.ID) {
		t.Fatalf("the new line must be reachable from the root v0")
	}
}

// TestNodeID_IsContentAddress — every node's id equals the content hash of its canonical body
// (content-addressing reused from S01/S02 — never forked).
func TestNodeID_IsContentAddress(t *testing.T) {
	id, err := dag.NodeID([]string{"v0"}, dag.StratumAbove, "line")
	if err != nil {
		t.Fatalf("NodeID must compute: %v", err)
	}
	id2, err := dag.NodeID([]string{"v0"}, dag.StratumAbove, "line")
	if err != nil {
		t.Fatalf("NodeID must compute: %v", err)
	}
	if id != id2 {
		t.Fatalf("NodeID must be deterministic (content-addressed): %q != %q", id, id2)
	}
	if id == "" {
		t.Fatalf("NodeID must be a non-empty content hash")
	}
}

package whytree_test

// Fixture mirror (N2 workflow) for the WhyTree — the HUMAN's loop-closure rule, above the line
// (the property mirror pins the computational invariants; this fixture pins the concrete FK13
// worked example /why must reproduce). reflects=kernel.whytree · test_kind=fixture · cert_language=go
// · liveness=live · authority=above.
//
// THE WORKED EXAMPLE (FKE-35.1, the 5-whys redressed):
// A failing acceptance mirror `checkout-accept` reddened (provenance=mirror). Walking caused_by
// UPWARD (FK12): checkout-accept ← createOrder ← {Order, authzPolicy} ← add_total_col. EACH cause
// is REPRODUCED (a deterministic re-run reddened on it). The deepest reproduced cause is
// `add_total_col` — the ROOT. /learn freezes an anti-recurrence terminal mirror reflecting that
// root. A WhyTree built WITHOUT that terminal mirror is REFUSED (WHYTREE_NO_MIRROR); a cause that
// was NOT reproduced is REFUSED (anti-confabulation); a caused_by cycle is REFUSED.

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/causedby"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/whytree"
)

func ref(id string) links.Ref { return links.Ref{ID: id, Version: "v1"} }

// the worked-example caused_by graph (the FK12 §17 example, reused).
func exampleEdges() []causedby.Edge {
	return []causedby.Edge{
		{From: ref("checkout-accept"), To: ref("createOrder")},
		{From: ref("createOrder"), To: ref("Order")},
		{From: ref("createOrder"), To: ref("authzPolicy")},
		{From: ref("Order"), To: ref("add_total_col")},
	}
}

// allReproduced returns a positive reproduction for every candidate cause on the trace.
func allReproduced() []whytree.Reproduction {
	return []whytree.Reproduction{
		{CauseID: "createOrder", Reproduced: true, Detail: "createOrder fixture red on re-run"},
		{CauseID: "Order", Reproduced: true, Detail: "Order entity contract red"},
		{CauseID: "authzPolicy", Reproduced: true, Detail: "authzPolicy denies"},
		{CauseID: "add_total_col", Reproduced: true, Detail: "migration broke the total column"},
	}
}

// terminalFor builds an anti-recurrence terminal mirror reflecting the given root cause.
func terminalFor(root string) whytree.TerminalMirror {
	return whytree.TerminalMirror{MirrorID: "mir-antirecur-1", ReflectsRootCause: root}
}

// TestFixture_BuildsTreeRootedAtDeepestReproducedCause: the canonical /why journey — symptom →
// ordered reproduced causes → root = the deepest (add_total_col) → terminal mirror reflects it.
func TestFixture_BuildsTreeRootedAtDeepestReproducedCause(t *testing.T) {
	tree, err := whytree.Build(whytree.Input{
		Symptom:       "checkout-accept",
		Provenance:    whytree.FromMirror,
		Edges:         exampleEdges(),
		Reproductions: allReproduced(),
		Terminal:      terminalFor("add_total_col"),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tree.Symptom != "checkout-accept" {
		t.Fatalf("symptom = %q, want checkout-accept", tree.Symptom)
	}
	// nearest-first order, inherited from FK12 Trace:
	want := []string{"createOrder", "Order", "authzPolicy", "add_total_col"}
	if len(tree.Causes) != len(want) {
		t.Fatalf("causes = %v, want %v", causeIDs(tree), want)
	}
	for i := range want {
		if tree.Causes[i].CauseID != want[i] {
			t.Fatalf("cause[%d] = %q, want %q (full %v)", i, tree.Causes[i].CauseID, want[i], causeIDs(tree))
		}
		if !tree.Causes[i].Reproduced {
			t.Fatalf("cause %q admitted but not marked reproduced", tree.Causes[i].CauseID)
		}
	}
	if tree.RootCause != "add_total_col" {
		t.Fatalf("root = %q, want add_total_col (the deepest reproduced cause)", tree.RootCause)
	}
	if tree.Terminal.MirrorID == "" {
		t.Fatal("a built tree must carry a terminal mirror")
	}
}

// TestFixture_NoTerminalMirrorRefused: a WhyTree without a terminal mirror is refused —
// WHYTREE_NO_MIRROR (the FK13 done-criterion: termination in a mirror is OBLIGATORY).
func TestFixture_NoTerminalMirrorRefused(t *testing.T) {
	_, err := whytree.Build(whytree.Input{
		Symptom:       "checkout-accept",
		Provenance:    whytree.FromMirror,
		Edges:         exampleEdges(),
		Reproductions: allReproduced(),
		Terminal:      whytree.TerminalMirror{}, // no mirror id
	})
	if err == nil {
		t.Fatal("expected ErrNoTerminalMirror (WHYTREE_NO_MIRROR), got nil")
	}
	if !errors.Is(err, whytree.ErrNoTerminalMirror) {
		t.Fatalf("expected ErrNoTerminalMirror, got %v", err)
	}
}

// TestFixture_NonReproducedCauseRefused: a candidate cause that was NOT reproduced is refused —
// anti-confabulation (the FK13 done-criterion: a non-reproducible cause is rejected).
func TestFixture_NonReproducedCauseRefused(t *testing.T) {
	repros := []whytree.Reproduction{
		{CauseID: "createOrder", Reproduced: true},
		{CauseID: "Order", Reproduced: false}, // could NOT be reproduced — confabulation risk
		{CauseID: "authzPolicy", Reproduced: true},
		{CauseID: "add_total_col", Reproduced: true},
	}
	_, err := whytree.Build(whytree.Input{
		Symptom:       "checkout-accept",
		Provenance:    whytree.FromMirror,
		Edges:         exampleEdges(),
		Reproductions: repros,
		Terminal:      terminalFor("add_total_col"),
	})
	if err == nil {
		t.Fatal("expected ErrCauseNotReproduced, got nil")
	}
	if !errors.Is(err, whytree.ErrCauseNotReproduced) {
		t.Fatalf("expected ErrCauseNotReproduced, got %v", err)
	}
}

// TestFixture_MissingReproductionRefused: a candidate cause with NO reproduction proof at all is
// refused too (an off-graph LLM-proposed cause with no proof never enters the tree).
func TestFixture_MissingReproductionRefused(t *testing.T) {
	repros := []whytree.Reproduction{
		{CauseID: "createOrder", Reproduced: true},
		// Order, authzPolicy, add_total_col have NO reproduction entry at all.
	}
	_, err := whytree.Build(whytree.Input{
		Symptom:       "checkout-accept",
		Provenance:    whytree.FromMirror,
		Edges:         exampleEdges(),
		Reproductions: repros,
		Terminal:      terminalFor("add_total_col"),
	})
	if !errors.Is(err, whytree.ErrCauseNotReproduced) {
		t.Fatalf("expected ErrCauseNotReproduced for an unproven cause, got %v", err)
	}
}

// TestFixture_LeafSymptomIsItsOwnRoot: a symptom with no caused_by cause is its own root; it still
// REQUIRES a terminal mirror reflecting the symptom itself.
func TestFixture_LeafSymptomIsItsOwnRoot(t *testing.T) {
	tree, err := whytree.Build(whytree.Input{
		Symptom:       "add_total_col",
		Provenance:    whytree.FromIncident,
		Edges:         exampleEdges(),
		Reproductions: allReproduced(),
		Terminal:      terminalFor("add_total_col"), // reflects the symptom (its own root)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !tree.IsLeaf() {
		t.Fatalf("a root-cause symptom should be a leaf, got causes %v", causeIDs(tree))
	}
	if tree.RootCause != "add_total_col" {
		t.Fatalf("leaf root = %q, want the symptom add_total_col", tree.RootCause)
	}
}

// TestFixture_TerminalMustReflectRoot: a terminal mirror reflecting the WRONG node is refused.
func TestFixture_TerminalMustReflectRoot(t *testing.T) {
	_, err := whytree.Build(whytree.Input{
		Symptom:       "checkout-accept",
		Provenance:    whytree.FromMirror,
		Edges:         exampleEdges(),
		Reproductions: allReproduced(),
		Terminal:      terminalFor("createOrder"), // not the root (root is add_total_col)
	})
	if !errors.Is(err, whytree.ErrTerminalMismatch) {
		t.Fatalf("expected ErrTerminalMismatch, got %v", err)
	}
}

// TestFixture_CycleRefused: a caused_by cycle reachable from the symptom is refused — no partial tree.
func TestFixture_CycleRefused(t *testing.T) {
	cyclic := []causedby.Edge{
		{From: ref("checkout-accept"), To: ref("createOrder")},
		{From: ref("createOrder"), To: ref("Order")},
		{From: ref("Order"), To: ref("createOrder")}, // the loop
	}
	_, err := whytree.Build(whytree.Input{
		Symptom:       "checkout-accept",
		Provenance:    whytree.FromMirror,
		Edges:         cyclic,
		Reproductions: allReproduced(),
		Terminal:      terminalFor("anything"),
	})
	if !errors.Is(err, whytree.ErrCycle) {
		t.Fatalf("expected ErrCycle, got %v", err)
	}
}

// TestFixture_UnknownProvenanceRefused: a symptom with an out-of-set provenance is refused.
func TestFixture_UnknownProvenanceRefused(t *testing.T) {
	_, err := whytree.Build(whytree.Input{
		Symptom:    "checkout-accept",
		Provenance: whytree.ProvenanceKind("telepathy"),
		Edges:      exampleEdges(),
		Terminal:   terminalFor("add_total_col"),
	})
	if !errors.Is(err, whytree.ErrUnknownProvenance) {
		t.Fatalf("expected ErrUnknownProvenance, got %v", err)
	}
}

// TestFixture_RoundTripContentAddressed: SerializeBody → NewRecord round-trips as
// id == version == Hash(Canonicalize(body)); a changed terminal mirror id ⇒ a DIFFERENT version.
func TestFixture_RoundTripContentAddressed(t *testing.T) {
	tree, err := whytree.Build(whytree.Input{
		Symptom:       "checkout-accept",
		Provenance:    whytree.FromMirror,
		Edges:         exampleEdges(),
		Reproductions: allReproduced(),
		Terminal:      terminalFor("add_total_col"),
	})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	rec, err := whytree.Record(tree)
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if rec.ID != rec.Version {
		t.Fatalf("content-address invariant broken: id %q != version %q", rec.ID, rec.Version)
	}
	if err := records.Validate(rec); err != nil {
		t.Fatalf("record fails Validate: %v", err)
	}
	back, err := whytree.ParseBody(rec.Body)
	if err != nil {
		t.Fatalf("ParseBody: %v", err)
	}
	if back.Symptom != tree.Symptom || back.RootCause != tree.RootCause {
		t.Fatalf("round-trip lost data: %+v vs %+v", back, tree)
	}

	// A changed terminal mirror id ⇒ a new version (never a mutation).
	tree2 := tree
	tree2.Terminal = whytree.TerminalMirror{MirrorID: "mir-antirecur-2", ReflectsRootCause: tree.RootCause}
	rec2, err := whytree.Record(tree2)
	if err != nil {
		t.Fatalf("Record(2): %v", err)
	}
	if rec2.Version == rec.Version {
		t.Fatal("a changed terminal mirror must yield a new version (content-addressed)")
	}
}

func causeIDs(t whytree.WhyTree) []string {
	out := make([]string, len(t.Causes))
	for i, c := range t.Causes {
		out[i] = c.CauseID
	}
	return out
}

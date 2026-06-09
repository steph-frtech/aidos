package causedby_test

// Fixture mirror (N2 workflow) for the caused_by causal-edge — the HUMAN's causal rule, above
// the line (the property mirror pins the computational invariants; this fixture pins the
// concrete §17 worked example FK12 must reproduce). reflects=kernel.causedby · test_kind=fixture
// · cert_language=go · liveness=live · authority=above.
//
// THE WORKED EXAMPLE (FKE-35.1, the red wave redressed):
// A failing acceptance mirror `checkout-accept` reddened. Walking caused_by UPWARD: the mirror
// is caused_by the operation `createOrder`, which is caused_by the entity `Order`, which is
// caused_by the migration `add_total_col`. Trace from the symptom must produce that ordered
// chain of candidate causes — nearest first. A cycle (Order caused_by createOrder caused_by
// Order) must be refused.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/causedby"
	"github.com/steph-frtech/aidos/back/kernel/links"
)

func ref(id string) links.Ref { return links.Ref{ID: id, Version: "v1"} }

// the worked-example graph: a linear cause chain, plus a side branch (createOrder also
// caused_by a policy) to exercise the multi-cause ordering.
func exampleEdges() []causedby.Edge {
	return []causedby.Edge{
		{From: ref("checkout-accept"), To: ref("createOrder")},
		{From: ref("createOrder"), To: ref("Order")},
		{From: ref("createOrder"), To: ref("authzPolicy")},
		{From: ref("Order"), To: ref("add_total_col")},
	}
}

func TestFixture_TraceProducesOrderedCauseChain(t *testing.T) {
	chain, err := causedby.Trace("checkout-accept", exampleEdges())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if chain.Symptom != "checkout-accept" {
		t.Fatalf("symptom = %q, want checkout-accept", chain.Symptom)
	}
	// nearest-first by hop distance, ties by id:
	//   dist 1: createOrder
	//   dist 2: Order, authzPolicy  (sorted by id: Order < authzPolicy)
	//   dist 3: add_total_col
	want := []string{"createOrder", "Order", "authzPolicy", "add_total_col"}
	if len(chain.Causes) != len(want) {
		t.Fatalf("causes = %v, want %v", chain.Causes, want)
	}
	for i := range want {
		if chain.Causes[i] != want[i] {
			t.Fatalf("cause[%d] = %q, want %q (full %v)", i, chain.Causes[i], want[i], chain.Causes)
		}
	}
}

func TestFixture_LeafSymptomHasNoCauses(t *testing.T) {
	chain, err := causedby.Trace("add_total_col", exampleEdges())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !chain.IsEmpty() {
		t.Fatalf("root cause should have no further causes, got %v", chain.Causes)
	}
}

func TestFixture_CycleRefused(t *testing.T) {
	cyclic := []causedby.Edge{
		{From: ref("checkout-accept"), To: ref("createOrder")},
		{From: ref("createOrder"), To: ref("Order")},
		{From: ref("Order"), To: ref("createOrder")}, // the loop
	}
	_, err := causedby.Trace("checkout-accept", cyclic)
	if err == nil {
		t.Fatal("expected ErrCycle, got nil")
	}
	if want := causedby.ErrCycle; err != nil && !errorsIs(err, want) {
		t.Fatalf("expected ErrCycle, got %v", err)
	}
}

func TestFixture_SelfEdgeRejectedByValidate(t *testing.T) {
	self := causedby.Edge{From: ref("Order"), To: ref("Order")}
	if err := causedby.Validate(self); err == nil {
		t.Fatal("expected ErrSelfCause for a self-edge, got nil")
	}
}

func TestFixture_UnpinnedCauseRejected(t *testing.T) {
	bad := causedby.Edge{From: ref("checkout-accept"), To: links.Ref{ID: "createOrder"}}
	if err := causedby.Validate(bad); err == nil {
		t.Fatal("expected ErrUnpinnedTo for an unpinned cause, got nil")
	}
}

// errorsIs is a tiny local wrapper to keep the import list minimal.
func errorsIs(err, target error) bool {
	for err != nil {
		if err == target {
			return true
		}
		type unwrapper interface{ Unwrap() error }
		u, ok := err.(unwrapper)
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

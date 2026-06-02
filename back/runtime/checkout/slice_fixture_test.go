package checkout_test

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/runtime/checkout"
)

// Fixture (N2) mirror — the slice SCRIPT, state → command → events. Conceptually in
// the mirrors schema; materialized here for the runner (bootstrap exception). reflects=
// examples.checkout.full-loop · test_kind=fixture · cert_language=go · authority=above ·
// liveness=live.
//
//	state   = a clean stable phase + the seeded Idea
//	command = the ordered loop (intake → goal → approved changeset → emit → invoke
//	          createOrder → seal phase)
//	events  = [IdeaIntaken, GoalOpened, ChangeSetApplied, MirrorLive, ArtifactsEmitted,
//	          OrderPlaced, PhaseSealed]
//
// It asserts: the exact event order; the kernel ASTs are content-addressed and
// reproducible; the changeset reaches APPLIED only through the completeness gate; the
// placed order's line items MATCH the cart (no phantom, no dropped item); no invented
// total; the loop never side-writes truth (the kernel write is the approved changeset).

// expectedEvents is the ordered N2 event list the slice must emit — the done shape.
var expectedEvents = []checkout.Event{
	checkout.EventIdeaIntaken,
	checkout.EventGoalOpened,
	checkout.EventChangeSetApplied,
	checkout.EventMirrorLive,
	checkout.EventArtifactsEmitted,
	checkout.EventOrderPlaced,
	checkout.EventPhaseSealed,
}

func TestSlice_FullLoop_EmitsTheOrderedEvents(t *testing.T) {
	tr, br := checkout.RunSlice(checkout.ExampleInput())
	if br != nil {
		t.Fatalf("the slice must run green end to end, blocked: %s", string(br.Code))
	}
	if !reflect.DeepEqual(tr.Events, expectedEvents) {
		t.Fatalf("events = %v, want %v", tr.Events, expectedEvents)
	}
}

func TestSlice_IdeaIsCandidateTruth_NoVersionNoMirror(t *testing.T) {
	tr, br := checkout.RunSlice(checkout.ExampleInput())
	if br != nil {
		t.Fatalf("blocked: %s", string(br.Code))
	}
	// An idea is a candidate-truth: its intent is the verbatim utterance, paraphrased
	// by nothing; it carries an id (content address) but no version/mirror by type.
	if tr.Idea.Intent != "a customer places an order from their cart" {
		t.Fatalf("idea intent must be the verbatim utterance, got %q", tr.Idea.Intent)
	}
	if tr.Idea.ID == "" {
		t.Fatalf("the idea must be content-addressed (an id), got empty")
	}
}

func TestSlice_GoalWritesARedSetForCreateOrder(t *testing.T) {
	tr, br := checkout.RunSlice(checkout.ExampleInput())
	if br != nil {
		t.Fatalf("blocked: %s", string(br.Code))
	}
	if len(tr.Goal.RedSet) == 0 {
		t.Fatalf("the /goal must write a non-empty red set (the red IS the goal, S29)")
	}
	// The red set is exactly the createOrder mirror (the slice's single failing mirror).
	found := false
	for _, m := range tr.Goal.RedSet {
		if m == "examples.checkout.full-loop" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the red set must contain the createOrder mirror ref, got %v", tr.Goal.RedSet)
	}
}

func TestSlice_KernelEnteredOnlyViaApprovedChangeSet(t *testing.T) {
	tr, br := checkout.RunSlice(checkout.ExampleInput())
	if br != nil {
		t.Fatalf("blocked: %s", string(br.Code))
	}
	// The candidate ASTs enter the kernel ONLY through the door: the changeset is
	// APPLIED, and it carries BOTH a spec_delta and its mirror_delta (the completeness
	// gate — no monster).
	if tr.ChangeSet.Status != changeset.StatusApplied {
		t.Fatalf("the changeset must reach APPLIED, got %q", tr.ChangeSet.Status)
	}
	if tr.ChangeSet.SpecDelta == nil || tr.ChangeSet.MirrorDelta == nil {
		t.Fatalf("the applied changeset must carry spec_delta AND mirror_delta (no monster)")
	}
}

func TestSlice_OrderLineItemsMatchTheCart_NoInventedTotal(t *testing.T) {
	in := checkout.ExampleInput()
	tr, br := checkout.RunSlice(in)
	if br != nil {
		t.Fatalf("blocked: %s", string(br.Code))
	}
	if !reflect.DeepEqual(tr.Order.Items, in.Cart.Items) {
		t.Fatalf("the placed order's line items must MATCH the cart: order=%v cart=%v",
			tr.Order.Items, in.Cart.Items)
	}
	// Honesty: no invented total. The PlacedOrder type carries ONLY id + items — there
	// is no Total field to invent. (The Order entity's `total` is owned by the mutate
	// seam, never asserted by the slice — an OpenQuestion, not a guessed default.)
}

func TestSlice_ContentIdempotent_SameHashesAndEvents(t *testing.T) {
	a, br1 := checkout.RunSlice(checkout.ExampleInput())
	b, br2 := checkout.RunSlice(checkout.ExampleInput())
	if br1 != nil || br2 != nil {
		t.Fatalf("both runs must be green; got %v / %v", br1, br2)
	}
	if a.ASTs != b.ASTs {
		t.Fatalf("re-running from a clean phase must yield the SAME content-addressed ASTs:\n%+v\n%+v", a.ASTs, b.ASTs)
	}
	if !reflect.DeepEqual(a.Events, b.Events) {
		t.Fatalf("re-running must yield the SAME ordered events")
	}
	if a.SealedPhase != b.SealedPhase {
		t.Fatalf("re-running must seal the SAME (content-addressed) phase: %q vs %q", a.SealedPhase, b.SealedPhase)
	}
	if a.SealedPhase == "" {
		t.Fatalf("the slice must seal a non-empty stable phase id")
	}
}

func TestSlice_EmptyCartIsABlockReason_NotAnInventedOrder(t *testing.T) {
	in := checkout.ExampleInput()
	in.Cart = checkout.Cart{ID: "cart-empty", Items: nil}
	_, br := checkout.RunSlice(in)
	if br == nil {
		t.Fatalf("an empty cart must yield a BlockReason (no order to place), got a green run")
	}
}

func TestSlice_EmitsAllProjectionTargets(t *testing.T) {
	tr, br := checkout.RunSlice(checkout.ExampleInput())
	if br != nil {
		t.Fatalf("blocked: %s", string(br.Code))
	}
	if len(tr.Artifacts) == 0 {
		t.Fatalf("the slice must emit the Order projections (Go / DDL / TS)")
	}
	// Every emitted artifact carries the protected header and a stable output hash.
	for _, a := range tr.Artifacts {
		if a.OutputHash == "" || a.SourceHash == "" {
			t.Fatalf("every emitted artifact must be content-addressed (source+output hash): %+v", a.Path)
		}
	}
}

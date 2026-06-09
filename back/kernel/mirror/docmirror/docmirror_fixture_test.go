package docmirror

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/generators/derivedoc"
)

// checkoutKernel builds the canonical checkout cell s9 is derived from — an operation that
// authorizes + emits, a control bound through an action. The human s2 is then authored to
// match it exactly (the green baseline), and the fault-injection fixtures perturb one side.
func checkoutKernel() derivedoc.Kernel {
	return derivedoc.Kernel{
		KernelID: "checkout",
		Operations: []operation.Operation{{
			Name:  "createOrder",
			Input: "Cart",
			Steps: []operation.Step{
				operation.AuthorizeStep{Policy: "canCheckout"},
				operation.MutateStep{Entity: "Order"},
			},
			Emits: []string{"OrderCreated"},
		}},
		Controls: []control.Control{{Name: "checkout-button", Triggers: "checkout-submit"}},
		Actions:  []action.Action{{Name: "checkout-submit", Invoke: "createOrder", On: action.On{Control: "checkout-button"}}},
	}
}

// humanMatching authors an s2 that is STRUCTURALLY identical to the derived s9 — same
// concepts, behaviour IDs, errors. The prose is the human's own wording.
func humanMatching(s9 derivedoc.S9) HumanDoc {
	beh := make([]derivedoc.Behavior, len(s9.Behaviors))
	for i, b := range s9.Behaviors {
		beh[i] = derivedoc.Behavior{ID: b.ID, Description: "Texte humain pour " + b.ID + "."}
	}
	return HumanDoc{
		KernelID:  s9.KernelID,
		Concepts:  append([]string(nil), s9.Concepts...),
		Errors:    append([]string(nil), s9.Errors...),
		Behaviors: beh,
	}
}

// TestDocMirror_AlignedIsGreen: a human doc that matches the derived code structurally is
// GREEN — the byte-identical baseline the fault-injection fixtures perturb.
func TestDocMirror_AlignedIsGreen(t *testing.T) {
	s9 := derivedoc.DeriveDoc(checkoutKernel()).S9
	rep := Compare(humanMatching(s9), s9)
	if !rep.Green() {
		t.Fatalf("aligned doc-mirror should be green, got red: %+v", rep.StructuralDivergences)
	}
	if rep.PairingMismatch {
		t.Fatalf("matching kernel ids should not mismatch")
	}
}

// TestDocMirror_RemoveBehaviorFromCodeIsRed is the headline done-criterion (« retirer un
// behavior du code → doc-miroir rouge »): when the code stops exposing a behaviour the
// human still documents, the doc-mirror goes RED with a code_missing structural divergence.
func TestDocMirror_RemoveBehaviorFromCodeIsRed(t *testing.T) {
	full := derivedoc.DeriveDoc(checkoutKernel()).S9
	human := humanMatching(full) // human documents the FULL surface.

	// Remove a behaviour from the CODE: derive s9 from a kernel whose operation no longer
	// emits the event (the emit:createOrder:OrderCreated behaviour disappears from s9).
	k := checkoutKernel()
	k.Operations[0].Emits = nil
	reduced := derivedoc.DeriveDoc(k).S9

	rep := Compare(human, reduced)
	if rep.Green() {
		t.Fatalf("removing a behaviour from the code must turn the doc-mirror red")
	}
	found := false
	for _, d := range rep.StructuralDivergences {
		if d.Section == SectionBehaviors && d.Key == "emit:createOrder:OrderCreated" && d.Side == SideCodeMissing {
			found = true
		}
	}
	if !found {
		t.Fatalf("the removed behaviour was not reported as code_missing: %+v", rep.StructuralDivergences)
	}
}

// TestDocMirror_EditProseOnlyIsAdvisory is the second headline done-criterion (« éditer la
// prose seule → advisory »): editing ONLY a behaviour's prose (structure unchanged) keeps
// the verdict GREEN and surfaces a single advisory on the prose plane.
func TestDocMirror_EditProseOnlyIsAdvisory(t *testing.T) {
	s9 := derivedoc.DeriveDoc(checkoutKernel()).S9
	human := humanMatching(s9)

	// Edit ONLY the prose of one behaviour (its ID is unchanged → structurally aligned).
	if len(human.Behaviors) == 0 {
		t.Fatal("fixture must have at least one behaviour")
	}
	human.Behaviors[0].Description = "Une prose totalement réécrite par un humain."

	rep := Compare(human, s9)
	if !rep.Green() {
		t.Fatalf("editing only the prose must NOT block the verdict: %+v", rep.StructuralDivergences)
	}
	if len(rep.StructuralDivergences) != 0 {
		t.Fatalf("prose edit leaked into the structural plane: %+v", rep.StructuralDivergences)
	}
	advisory := false
	for _, d := range rep.ProseAdvisories {
		if d.Plane == PlaneProse && d.Key == human.Behaviors[0].ID {
			advisory = true
		}
	}
	if !advisory {
		t.Fatalf("the prose edit should produce an advisory: %+v", rep.ProseAdvisories)
	}
}

// TestDocMirror_PairingMismatchIsRed: comparing docs that claim different kernels is red.
func TestDocMirror_PairingMismatchIsRed(t *testing.T) {
	s9 := derivedoc.DeriveDoc(checkoutKernel()).S9
	human := humanMatching(s9)
	human.KernelID = "some-other-kernel"
	rep := Compare(human, s9)
	if rep.Green() {
		t.Fatalf("a pairing mismatch must be red")
	}
	if !rep.PairingMismatch {
		t.Fatalf("the mismatch flag should be set")
	}
}

// TestDataMirror_Declared proves the s3 ↔ s7 data-mirror DECLARATION (FKE-1.3): the same
// structural engine over entity/field sets — aligned shapes are green, a field documented
// but absent in the code shape (or vice versa) is red.
func TestDataMirror_Declared(t *testing.T) {
	s3 := []string{"entity:Order", "field:Order.id", "field:Order.total"}
	// Aligned s7 → green.
	if rep := DataMirror("checkout", s3, s3); !rep.Green() {
		t.Fatalf("aligned data-mirror should be green: %+v", rep.StructuralDivergences)
	}
	// s7 missing a field the human documents → red (code_missing).
	s7 := []string{"entity:Order", "field:Order.id"}
	rep := DataMirror("checkout", s3, s7)
	if rep.Green() {
		t.Fatalf("a missing field must turn the data-mirror red")
	}
	found := false
	for _, d := range rep.StructuralDivergences {
		if d.Key == "field:Order.total" && d.Side == SideCodeMissing {
			found = true
		}
	}
	if !found {
		t.Fatalf("the missing field was not reported: %+v", rep.StructuralDivergences)
	}
}

// TestCompare_Deterministic_KernelEmpty: an empty kernel pairs green (well-formed, no
// monsters) — the totality guard.
func TestCompare_Deterministic_KernelEmpty(t *testing.T) {
	s9 := derivedoc.DeriveDoc(derivedoc.Kernel{KernelID: "empty"}).S9
	human := HumanDoc{KernelID: "empty"}
	rep := Compare(human, s9)
	if !rep.Green() {
		t.Fatalf("empty-vs-empty should be green: %+v", rep.StructuralDivergences)
	}
	if rep.Hash == "" {
		t.Fatalf("a green report must still carry a content hash")
	}
}

package derivedoc_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/expr"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/generators/derivedoc"
)

// FK06 fixture mirror: s9 is the LOWER HALF of the doc-mirror — the doc DERIVED from
// the code, structured for the structural comparison FK07 will run against s2 (the
// human-authored upper half). The done-criterion « s9 structurée (concepts du lexique,
// behaviors, erreurs) » means s9 carries three enumerable sections:
//   - Concepts  — the lexicon terms named across the ASTs (operation/control/action
//     names, entities, event names, route refs) — the SET FK07 compares present/absent.
//   - Behaviors — the enumerable behaviours (one per operation, one per control→action
//     binding, one per emitted event).
//   - Errors    — the error surface (typed operation errors, orphan-trigger guards,
//     authorization-denied) — the errors FK07 checks are covered.

// checkoutKernel is the canonical checkout SLICE (the demo cell) as a Kernel bundle.
func checkoutKernel() derivedoc.Kernel {
	return derivedoc.Kernel{
		KernelID: "checkout-slice",
		Operations: []operation.Operation{
			{
				Name:  "createOrder",
				Input: "CreateOrderInput",
				Steps: []operation.Step{
					operation.ValidateStep{Schema: "CreateOrderInput"},
					operation.AuthorizeStep{Policy: "canCheckout"},
					operation.ReadStep{Entity: "Cart", As: "cart"},
					operation.MutateStep{Entity: "Order", Op: operation.MutateCreate, As: "order"},
					operation.MutateStep{Entity: "Cart", Op: operation.MutateClear},
					operation.ReturnStep{Ref: "$.order"},
				},
				Emits: []string{"OrderCreated", "CartCleared"},
			},
		},
		Controls: []control.Control{
			{
				Name:        "checkout-button",
				VisibleWhen: expr.Lit(true),
				EnabledWhen: expr.Lit(true),
				Triggers:    "checkout-submit",
			},
		},
		Actions: []action.Action{
			{
				Name:      "checkout-submit",
				On:        action.On{Kind: action.EventClick, Control: "checkout-button"},
				Invoke:    "createOrder",
				OnSuccess: []action.Effect{{Verb: "navigate"}},
				OnError:   []action.Effect{{Verb: "toast.error"}},
			},
		},
	}
}

func TestDeriveDoc_StructuredSections(t *testing.T) {
	d := derivedoc.DeriveDoc(checkoutKernel())

	var doc derivedoc.S9
	if err := json.Unmarshal(d.Bytes, &doc); err != nil {
		t.Fatalf("s9 bytes do not parse as S9: %v", err)
	}

	// Concepts: lexicon terms named across the ASTs.
	wantConcepts := []string{
		"action:checkout-submit",
		"control:checkout-button",
		"entity:Cart",
		"entity:Order",
		"event:CartCleared",
		"event:OrderCreated",
		"operation:createOrder",
		"policy:canCheckout",
	}
	if !equalStrings(doc.Concepts, wantConcepts) {
		t.Fatalf("concepts mismatch\n got=%v\nwant=%v", doc.Concepts, wantConcepts)
	}

	// Behaviors: one per operation, one per control→action binding, one per emitted event.
	if len(doc.Behaviors) == 0 {
		t.Fatal("expected behaviors")
	}
	joined := strings.Join(behaviorIDs(doc.Behaviors), "\n")
	for _, want := range []string{
		"operation:createOrder",
		"binding:checkout-button->checkout-submit->createOrder",
		"emit:createOrder:OrderCreated",
		"emit:createOrder:CartCleared",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing behavior %q in:\n%s", want, joined)
		}
	}

	// Errors: the error surface FK07 checks for coverage.
	joinedErr := strings.Join(doc.Errors, "\n")
	for _, want := range []string{
		"operation:createOrder:ErrAuthorizationDenied",
		"control:checkout-button:ErrOrphanTrigger",
	} {
		if !strings.Contains(joinedErr, want) {
			t.Fatalf("missing error %q in:\n%s", want, joinedErr)
		}
	}
}

// TestDeriveDoc_SortedSections — every section is sorted (the SET form for FK07).
func TestDeriveDoc_SortedSections(t *testing.T) {
	d := derivedoc.DeriveDoc(checkoutKernel())
	var doc derivedoc.S9
	if err := json.Unmarshal(d.Bytes, &doc); err != nil {
		t.Fatal(err)
	}
	assertSorted(t, "concepts", doc.Concepts)
	assertSorted(t, "errors", doc.Errors)
	ids := behaviorIDs(doc.Behaviors)
	assertSorted(t, "behaviors", ids)
}

// TestDeriveDoc_EmptyKernel — a kernel with no ASTs still derives a well-formed (empty) s9.
func TestDeriveDoc_EmptyKernel(t *testing.T) {
	d := derivedoc.DeriveDoc(derivedoc.Kernel{KernelID: "empty"})
	var doc derivedoc.S9
	if err := json.Unmarshal(d.Bytes, &doc); err != nil {
		t.Fatalf("empty s9 must still parse: %v", err)
	}
	if doc.KernelID != "empty" {
		t.Fatalf("kernel id lost: %q", doc.KernelID)
	}
	if len(doc.Concepts) != 0 || len(doc.Behaviors) != 0 || len(doc.Errors) != 0 {
		t.Fatal("empty kernel should derive empty sections")
	}
}

func behaviorIDs(bs []derivedoc.Behavior) []string {
	out := make([]string, len(bs))
	for i, b := range bs {
		out[i] = b.ID
	}
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

func assertSorted(t *testing.T, name string, xs []string) {
	t.Helper()
	for i := 1; i < len(xs); i++ {
		if xs[i-1] > xs[i] {
			t.Fatalf("%s not sorted at %d: %q > %q", name, i, xs[i-1], xs[i])
		}
	}
}

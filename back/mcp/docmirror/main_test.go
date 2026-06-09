package main

import (
	"context"
	"testing"
)

func checkoutKernelIn() kernelIn {
	return kernelIn{
		KernelID: "checkout",
		Operations: []opIn{{
			Name:  "createOrder",
			Input: "Cart",
			Steps: []stepIn{
				{Kind: "authorize", Policy: "canCheckout"},
				{Kind: "mutate", Entity: "Order"},
			},
			Emits: []string{"OrderCreated"},
		}},
		Controls: []ctlIn{{Name: "checkout-button", Triggers: "checkout-submit"}},
		Actions:  []actIn{{Name: "checkout-submit", Invoke: "createOrder", OnControl: "checkout-button"}},
	}
}

// matchingHuman authors an s2 from the derived s9 (structurally identical, own prose).
func matchingHuman() humanDocIn {
	s9 := toS9(derivedIn{Kernel: ptr(checkoutKernelIn())})
	h := humanDocIn{KernelID: s9.KernelID, Concepts: s9.Concepts, Errors: s9.Errors}
	for _, b := range s9.Behaviors {
		h.Behaviors = append(h.Behaviors, behaviorIn{ID: b.ID, Description: "Humain: " + b.ID})
	}
	return h
}

func ptr(k kernelIn) *kernelIn { return &k }

// TestDocMirror_AlignedGreen — a matching doc-mirror is green.
func TestDocMirror_AlignedGreen(t *testing.T) {
	_, out, err := docMirror(context.Background(), nil, docMirrorIn{
		Human:   matchingHuman(),
		Derived: derivedIn{Kernel: ptr(checkoutKernelIn())},
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Verdict != "green" || !out.Green {
		t.Fatalf("expected green, got %+v", out)
	}
	if out.Hash == "" {
		t.Fatal("empty hash")
	}
}

// TestDocMirror_RemoveBehaviorRed — dropping the emit from the code turns it red.
func TestDocMirror_RemoveBehaviorRed(t *testing.T) {
	reduced := checkoutKernelIn()
	reduced.Operations[0].Emits = nil
	_, out, _ := docMirror(context.Background(), nil, docMirrorIn{
		Human:   matchingHuman(),
		Derived: derivedIn{Kernel: &reduced},
	})
	if out.Verdict != "red" {
		t.Fatalf("expected red, got %+v", out)
	}
	found := false
	for _, d := range out.StructuralDivergences {
		if d.Section == "behaviors" && d.Key == "emit:createOrder:OrderCreated" && d.Side == "code_missing" {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing behaviour not reported: %+v", out.StructuralDivergences)
	}
}

// TestDocMirror_ProseOnlyAdvisory — editing only the prose stays green, yields an advisory.
func TestDocMirror_ProseOnlyAdvisory(t *testing.T) {
	human := matchingHuman()
	human.Behaviors[0].Description = "Une prose réécrite."
	_, out, _ := docMirror(context.Background(), nil, docMirrorIn{
		Human:   human,
		Derived: derivedIn{Kernel: ptr(checkoutKernelIn())},
	})
	if out.Verdict != "green" {
		t.Fatalf("prose-only edit must not block: %+v", out)
	}
	if len(out.ProseAdvisories) == 0 {
		t.Fatalf("expected a prose advisory: %+v", out)
	}
}

// TestDataMirror_Declared — s3↔s7 declared comparator.
func TestDataMirror_Declared(t *testing.T) {
	s3 := []string{"entity:Order", "field:Order.total"}
	_, green, _ := dataMirror(context.Background(), nil, dataMirrorIn{KernelID: "checkout", S3: s3, S7: s3})
	if green.Verdict != "green" {
		t.Fatalf("aligned should be green: %+v", green)
	}
	_, red, _ := dataMirror(context.Background(), nil, dataMirrorIn{KernelID: "checkout", S3: s3, S7: []string{"entity:Order"}})
	if red.Verdict != "red" {
		t.Fatalf("missing field should be red: %+v", red)
	}
}

// TestServer_Builds — the MCP server constructs (both tools registered).
func TestServer_Builds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("nil server")
	}
}

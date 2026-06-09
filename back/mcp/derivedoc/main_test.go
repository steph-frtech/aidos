package main

import (
	"context"
	"strings"
	"testing"
)

func checkoutIn() kernelIn {
	return kernelIn{
		KernelID: "checkout-slice",
		Operations: []opIn{{
			Name:  "createOrder",
			Input: "CreateOrderInput",
			Steps: []stepIn{
				{Kind: "validate"},
				{Kind: "authorize", Policy: "canCheckout"},
				{Kind: "read", Entity: "Cart"},
				{Kind: "mutate", Entity: "Order"},
				{Kind: "return"},
			},
			Emits: []string{"OrderCreated", "CartCleared"},
		}},
		Controls: []ctlIn{{Name: "checkout-button", Triggers: "checkout-submit"}},
		Actions:  []actIn{{Name: "checkout-submit", Invoke: "createOrder", OnControl: "checkout-button"}},
	}
}

// TestDeriveDoc_Structured — the tool returns the structured s9 (concepts, behaviors, errors).
func TestDeriveDoc_Structured(t *testing.T) {
	_, out, err := deriveDoc(context.Background(), nil, checkoutIn())
	if err != nil || !out.OK {
		t.Fatalf("derive errored: %+v err=%v", out, err)
	}
	if out.KernelID != "checkout-slice" {
		t.Fatalf("kernel id lost: %q", out.KernelID)
	}
	if !contains(out.Concepts, "operation:createOrder") ||
		!contains(out.Concepts, "policy:canCheckout") ||
		!contains(out.Concepts, "event:OrderCreated") {
		t.Fatalf("concepts missing lexicon terms: %v", out.Concepts)
	}
	if !contains(out.Errors, "operation:createOrder:ErrAuthorizationDenied") ||
		!contains(out.Errors, "control:checkout-button:ErrOrphanTrigger") {
		t.Fatalf("errors missing surface: %v", out.Errors)
	}
	var foundBinding bool
	for _, b := range out.Behaviors {
		if b.ID == "binding:checkout-button->checkout-submit->createOrder" {
			foundBinding = true
		}
	}
	if !foundBinding {
		t.Fatalf("binding behaviour not enumerated: %+v", out.Behaviors)
	}
	if !strings.Contains(out.Bytes, `"kernel_id":"checkout-slice"`) {
		t.Fatalf("canonical bytes malformed: %s", out.Bytes)
	}
	if out.Hash == "" {
		t.Fatal("empty hash")
	}
}

// TestDeriveDoc_ByteIdentical — same kernel ⇒ byte-identical s9 (the FK06 done-criterion).
func TestDeriveDoc_ByteIdentical(t *testing.T) {
	_, a, _ := deriveDoc(context.Background(), nil, checkoutIn())
	_, b, _ := deriveDoc(context.Background(), nil, checkoutIn())
	if a.Bytes != b.Bytes || a.Hash != b.Hash {
		t.Fatalf("not byte-identical:\nA=%s\nB=%s", a.Bytes, b.Bytes)
	}
}

// TestServer_Builds — the MCP server constructs (the tool is registered).
func TestServer_Builds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("nil server")
	}
}

func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

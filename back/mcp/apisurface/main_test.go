package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/apisurface"
)

func spec() apisurface.ApiSpec {
	return apisurface.ApiSpec{
		Project: "shop",
		Ops: []apisurface.Op{
			{
				Name: "createOrder", Entity: entities.Order(), Verb: apisurface.VerbPost, Authorize: true,
				Input: []entities.Attribute{{Name: "cartId", Type: entities.TypeString, Required: true}},
			},
			{Name: "listOrders", Entity: entities.Order(), Verb: apisurface.VerbGet},
		},
	}
}

// The verify tool reports PASS on all emitted endpoints (the done-criterion door).
func TestVerifyToolAllEndpoints(t *testing.T) {
	_, out, err := verifyTool(context.Background(), nil, specInput{Spec: spec()})
	if err != nil {
		t.Fatalf("verifyTool: %v", err)
	}
	if !out.Pass {
		t.Fatalf("verify did not pass: %s", out.Reason)
	}
}

// The openapi tool is byte-stable across two calls (the determinism door).
func TestOpenAPIToolByteStable(t *testing.T) {
	_, a, err := openapiTool(context.Background(), nil, specInput{Spec: spec()})
	if err != nil || !a.OK {
		t.Fatalf("openapiTool: %v / %v", err, a.Block)
	}
	_, b, _ := openapiTool(context.Background(), nil, specInput{Spec: spec()})
	if a.Bytes != b.Bytes || a.Hash != b.Hash {
		t.Fatalf("openapi not byte-stable across calls")
	}
}

// The pact tool returns one contract per sync op (the suite door).
func TestPactToolOneContractPerOp(t *testing.T) {
	_, out, err := pactTool(context.Background(), nil, specInput{Spec: spec()})
	if err != nil || !out.OK {
		t.Fatalf("pactTool: %v / %v", err, out.Block)
	}
	if len(out.Contracts) != 2 {
		t.Fatalf("want 2 contracts (one per sync op), got %d", len(out.Contracts))
	}
}

// A malformed spec yields a typed Block, never a panic (the wall/honesty).
func TestRouterToolBlocksMalformed(t *testing.T) {
	_, out, err := routerTool(context.Background(), nil, specInput{Spec: apisurface.ApiSpec{Project: "shop"}})
	if err != nil {
		t.Fatalf("routerTool errored instead of blocking: %v", err)
	}
	if out.OK || out.Block == nil {
		t.Fatalf("malformed spec must be blocked")
	}
}

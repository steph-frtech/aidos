package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/domainbind"
)

// The domainbind MCP server is a PURE planner (the wall): these tests prove each tool returns
// deterministically without I/O, mirroring the S97 done-criteria at the MCP boundary.

func sampleReq() domainbind.Request {
	return domainbind.Request{
		Domain:          "shop.acme.com",
		Project:         "shop",
		DeploySubdomain: "d-ab12cd34ef56",
		DeployRoot:      "deploy.aidos.app",
		ServerService:   "shop-server",
	}
}

func TestBindTool(t *testing.T) {
	_, out, err := bindTool(context.Background(), nil, bindInput{Registry: domainbind.Registry{}, Request: sampleReq()})
	if err != nil || !out.OK || out.Plan == nil {
		t.Fatalf("bind failed: ok=%v err=%v", out.OK, err)
	}
	if out.Plan.URL != "https://shop.acme.com" {
		t.Fatalf("bind URL = %q", out.Plan.URL)
	}
	if !domainbind.ServesHTTPS(*out.Plan) {
		t.Fatalf("bind plan does not serve HTTPS")
	}
}

func TestBindToolRefusesAlreadyBound(t *testing.T) {
	reg := domainbind.Registry{Bindings: []domainbind.Binding{{Domain: "shop.acme.com", Project: "other"}}}
	_, out, _ := bindTool(context.Background(), nil, bindInput{Registry: reg, Request: sampleReq()})
	if out.OK || out.Block == nil || out.Block.Code != "DOMAIN_ALREADY_BOUND" {
		t.Fatalf("a domain owned by another project not refused DOMAIN_ALREADY_BOUND: %+v", out)
	}
}

func TestBindToolIdempotentSameProject(t *testing.T) {
	reg := domainbind.Registry{Bindings: []domainbind.Binding{{Domain: "shop.acme.com", Project: "shop"}}}
	_, out, _ := bindTool(context.Background(), nil, bindInput{Registry: reg, Request: sampleReq()})
	if !out.OK || out.Plan == nil {
		t.Fatalf("re-binding to the same project must be permitted: %+v", out)
	}
}

func TestServesHTTPSTool(t *testing.T) {
	_, b, _ := bindTool(context.Background(), nil, bindInput{Registry: domainbind.Registry{}, Request: sampleReq()})
	_, out, _ := servesHTTPSTool(context.Background(), nil, servesHTTPSInput{Plan: *b.Plan})
	if !out.OK || !out.Serves {
		t.Fatalf("serves_https must be true for a fresh bind: %+v", out)
	}
}

func TestInjectiveTool(t *testing.T) {
	good := []domainbind.Binding{{Domain: "a.com", Project: "x"}, {Domain: "b.com", Project: "y"}}
	_, out, _ := injectiveTool(context.Background(), nil, injectiveInput{Bindings: good})
	if !out.Injective {
		t.Fatalf("distinct domains must be injective")
	}
	bad := []domainbind.Binding{{Domain: "a.com", Project: "x"}, {Domain: "a.com", Project: "y"}}
	_, out2, _ := injectiveTool(context.Background(), nil, injectiveInput{Bindings: bad})
	if out2.Injective {
		t.Fatalf("a domain on two projects must NOT be injective")
	}
}

func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("nil server")
	}
}

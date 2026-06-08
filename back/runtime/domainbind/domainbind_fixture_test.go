package domainbind_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/domainbind"
)

// Workflow mirror (N2): registry+request → BindPlan|BlockReason fixtures. reflects=runtime.
// domainbind · test_kind=fixture · cert_language=go · authority=above · liveness=live. Each case
// pins one binding outcome — an OK bind or a typed refusal. Bind writes nothing (the wall).

func okReq() domainbind.Request {
	return domainbind.Request{
		Domain:          "shop.acme.com",
		Project:         "shop",
		DeploySubdomain: "d-ab12cd34ef56",
		DeployRoot:      "deploy.aidos.app",
		ServerService:   "shop-server",
	}
}

func TestDomainBindFixtures(t *testing.T) {
	cases := []struct {
		name     string
		reg      domainbind.Registry
		req      domainbind.Request
		wantOK   bool
		wantCode blockreason.Code
	}{
		// --- 3 OK binds ---
		{
			name:   "free domain binds",
			reg:    domainbind.Registry{},
			req:    okReq(),
			wantOK: true,
		},
		{
			name:   "re-binding same domain to same project is idempotent (not a conflict)",
			reg:    domainbind.Registry{Bindings: []domainbind.Binding{{Domain: "shop.acme.com", Project: "shop"}}},
			req:    okReq(),
			wantOK: true,
		},
		{
			name:   "a different free domain binds alongside an existing one",
			reg:    domainbind.Registry{Bindings: []domainbind.Binding{{Domain: "other.acme.com", Project: "other"}}},
			req:    okReq(),
			wantOK: true,
		},
		// --- refusals / guarantees ---
		{
			name:     "domain already bound to another project (the done-criteria conflict)",
			reg:      domainbind.Registry{Bindings: []domainbind.Binding{{Domain: "shop.acme.com", Project: "other"}}},
			req:      okReq(),
			wantOK:   false,
			wantCode: blockreason.CodeDomainAlreadyBound,
		},
		{
			name:     "domain conflict is case/dot-insensitive (normalized match)",
			reg:      domainbind.Registry{Bindings: []domainbind.Binding{{Domain: "Shop.Acme.com.", Project: "other"}}},
			req:      okReq(),
			wantOK:   false,
			wantCode: blockreason.CodeDomainAlreadyBound,
		},
		{
			name:     "empty domain refused",
			reg:      domainbind.Registry{},
			req:      func() domainbind.Request { r := okReq(); r.Domain = ""; return r }(),
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
		{
			name:     "domain with no dot refused",
			reg:      domainbind.Registry{},
			req:      func() domainbind.Request { r := okReq(); r.Domain = "localhost"; return r }(),
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
		{
			name:     "domain with whitespace refused",
			reg:      domainbind.Registry{},
			req:      func() domainbind.Request { r := okReq(); r.Domain = "not a domain"; return r }(),
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
		{
			name:     "empty project refused",
			reg:      domainbind.Registry{},
			req:      func() domainbind.Request { r := okReq(); r.Project = ""; return r }(),
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
		{
			name:     "missing deploy host refused",
			reg:      domainbind.Registry{},
			req:      func() domainbind.Request { r := okReq(); r.DeploySubdomain = ""; return r }(),
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
		{
			name:     "missing server service refused",
			reg:      domainbind.Registry{},
			req:      func() domainbind.Request { r := okReq(); r.ServerService = ""; return r }(),
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
		{
			name: "registry already non-injective is rejected as a fault",
			reg: domainbind.Registry{Bindings: []domainbind.Binding{
				{Domain: "dup.acme.com", Project: "a"},
				{Domain: "dup.acme.com", Project: "b"},
			}},
			req:      okReq(),
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			plan, br := domainbind.Bind(tc.reg, tc.req)
			if tc.wantOK {
				if br != nil {
					t.Fatalf("expected OK, got refusal %s: %s", br.Code, br.Explanation)
				}
				if plan.ID == "" {
					t.Fatalf("OK bind produced no plan id")
				}
				if !domainbind.ServesHTTPS(plan) {
					t.Fatalf("OK bind does not serve HTTPS: %+v", plan.Labels)
				}
				return
			}
			if br == nil {
				t.Fatalf("expected refusal %s, got OK plan %s", tc.wantCode, plan.ID)
			}
			if br.Code != tc.wantCode {
				t.Fatalf("refusal code = %q, want %q (%s)", br.Code, tc.wantCode, br.Explanation)
			}
			if len(br.HowToFix) == 0 {
				t.Fatalf("refusal %s has empty how_to_fix (a prison)", br.Code)
			}
		})
	}
}

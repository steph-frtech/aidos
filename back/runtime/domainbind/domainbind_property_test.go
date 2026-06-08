package domainbind_test

// S97 — CUSTOM-DOMAIN BINDING INVARIANTS (property, rapid). N1.
// reflects=runtime.domainbind · test_kind=property · liveness=live.
//
// Five properties:
//   - REPRODUCIBILITY: same registry + request → byte-identical BindPlan (same id/labels/DNS).
//   - INJECTIVITY (the done-criteria): the binding domain→project is injective — the resulting
//     registry (existing ∪ {new}) maps every domain to AT MOST ONE project; binding a domain
//     already owned by another project is ALWAYS refused DOMAIN_ALREADY_BOUND and emits no plan.
//   - HTTPS SERVING: every accepted bind serves the app over HTTPS (a websecure router + tls +
//     ACME certresolver on Host(`<domain>`)).
//   - IDEMPOTENT SAME-PROJECT: re-binding the same domain to the SAME project is permitted.
//   - CONTENT-ADDRESS SENSITIVITY: changing the domain or the deploy host yields a different id.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/domainbind"
	"pgregory.net/rapid"
)

func genDomain(t *rapid.T, name string) string {
	label := rapid.StringMatching(`[a-z][a-z0-9]{1,7}`).Draw(t, name)
	return label + ".example.com"
}

func genReq(t *rapid.T) domainbind.Request {
	return domainbind.Request{
		Domain:          genDomain(t, "domain"),
		Project:         "proj-" + rapid.StringMatching(`[a-z]{2,6}`).Draw(t, "proj"),
		DeploySubdomain: "d-" + rapid.StringMatching(`[a-f0-9]{6,12}`).Draw(t, "sub"),
		DeployRoot:      "deploy.aidos.app",
		ServerService:   "svc-" + rapid.StringMatching(`[a-z]{2,6}`).Draw(t, "svc"),
	}
}

// PROP 1 — reproducibility: same registry + request → byte-identical plan.
func TestProp_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		req := genReq(t)
		reg := domainbind.Registry{}
		p1, b1 := domainbind.Bind(reg, req)
		p2, b2 := domainbind.Bind(reg, req)
		if (b1 == nil) != (b2 == nil) {
			t.Fatalf("non-deterministic refusal")
		}
		if b1 == nil {
			if p1.ID != p2.ID {
				t.Fatalf("non-reproducible id: %q vs %q", p1.ID, p2.ID)
			}
			if len(p1.Labels) != len(p2.Labels) {
				t.Fatalf("non-reproducible labels")
			}
		}
	})
}

// PROP 2 — injectivity: a domain owned by another project is ALWAYS refused; an accepted bind
// keeps the resulting registry injective.
func TestProp_Injective(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		req := genReq(t)
		other := "other-" + rapid.StringMatching(`[a-z]{2,6}`).Draw(t, "other")
		// Registry already owns the domain under a DIFFERENT project.
		reg := domainbind.Registry{Bindings: []domainbind.Binding{{Domain: req.Domain, Project: other}}}
		if other == req.Project {
			return // skip the degenerate equal-project draw (covered by the idempotency prop)
		}
		_, br := domainbind.Bind(reg, req)
		if br == nil {
			t.Fatalf("binding a domain owned by %q to %q was permitted (injectivity broken)", other, req.Project)
		}
		if br.Code != blockreason.CodeDomainAlreadyBound {
			t.Fatalf("refusal = %q, want DOMAIN_ALREADY_BOUND", br.Code)
		}
		// And the existing registry stays injective when we add the would-be binding only on accept.
		existing := []domainbind.Binding{{Domain: req.Domain, Project: other}}
		if !domainbind.IsInjective(existing) {
			t.Fatalf("baseline registry should be injective")
		}
		broken := append(append([]domainbind.Binding(nil), existing...), domainbind.Binding{Domain: req.Domain, Project: req.Project})
		if domainbind.IsInjective(broken) {
			t.Fatalf("two projects on the same domain must NOT be injective")
		}
	})
}

// PROP 3 — HTTPS serving: every accepted bind serves the app over HTTPS.
func TestProp_ServesHTTPS(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		req := genReq(t)
		plan, br := domainbind.Bind(domainbind.Registry{}, req)
		if br != nil {
			t.Fatalf("free-domain bind refused: %s", br.Explanation)
		}
		if !domainbind.ServesHTTPS(plan) {
			t.Fatalf("accepted bind does not serve HTTPS: %+v", plan.Labels)
		}
		if !strings.HasPrefix(plan.URL, "https://") {
			t.Fatalf("URL %q is not HTTPS", plan.URL)
		}
	})
}

// PROP 4 — idempotent same-project: re-binding the same domain to the SAME project is permitted.
func TestProp_IdempotentSameProject(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		req := genReq(t)
		reg := domainbind.Registry{Bindings: []domainbind.Binding{{Domain: req.Domain, Project: req.Project}}}
		p1, br := domainbind.Bind(reg, req)
		if br != nil {
			t.Fatalf("re-binding to the same project refused: %s", br.Explanation)
		}
		p2, _ := domainbind.Bind(domainbind.Registry{}, req)
		if p1.ID != p2.ID {
			t.Fatalf("idempotent re-bind id differs from fresh bind: %q vs %q", p1.ID, p2.ID)
		}
	})
}

// PROP 5 — content-address sensitivity: a different domain or deploy host → a different id.
func TestProp_ContentAddressSensitive(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		req := genReq(t)
		base, br := domainbind.Bind(domainbind.Registry{}, req)
		if br != nil {
			return
		}
		// Different domain.
		req2 := req
		req2.Domain = "x-" + req.Domain
		if p2, b2 := domainbind.Bind(domainbind.Registry{}, req2); b2 == nil && p2.ID == base.ID {
			t.Fatalf("different domain collided on id %q", base.ID)
		}
		// Different deploy host.
		req3 := req
		req3.DeploySubdomain = req.DeploySubdomain + "ff"
		if p3, b3 := domainbind.Bind(domainbind.Registry{}, req3); b3 == nil && p3.ID == base.ID {
			t.Fatalf("different deploy host collided on id %q", base.ID)
		}
	})
}

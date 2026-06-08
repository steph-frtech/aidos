package domainbind_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/runtime/domainbind"
)

// Acceptance mirror runner (Godog, N0): drives tests/runtime/domainbind.feature against the
// in-process custom-domain binding. reflects=runtime.domainbind · test_kind=gherkin ·
// cert_language=godog · authority=above · liveness=live. Bind writes nothing (the wall): it
// returns a BindPlan or a typed BlockReason.

type bindState struct {
	reg   domainbind.Registry
	req   domainbind.Request
	plan  domainbind.BindPlan
	plan2 domainbind.BindPlan
	block *struct{ code, expl string }
}

func TestDomainBindBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "domainbind",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &bindState{}

			sc.Step(`^an empty domain registry$`, func() error {
				st.reg = domainbind.Registry{}
				return nil
			})
			sc.Step(`^a registry where "([^"]*)" is bound to project "([^"]*)"$`, func(domain, project string) error {
				st.reg = domainbind.Registry{Bindings: []domainbind.Binding{{Domain: domain, Project: project}}}
				return nil
			})
			sc.Step(`^a deploy of project "([^"]*)" at "([^"]*)" serving service "([^"]*)"$`,
				func(project, host, service string) error {
					sub, root, ok := strings.Cut(host, ".")
					if !ok {
						return fmt.Errorf("deploy host %q has no root", host)
					}
					st.req = domainbind.Request{
						Project:         project,
						DeploySubdomain: sub,
						DeployRoot:      root,
						ServerService:   service,
					}
					return nil
				})

			bindOnce := func(domain, project string) error {
				st.req.Domain = domain
				st.req.Project = project
				plan, br := domainbind.Bind(st.reg, st.req)
				if br != nil {
					st.block = &struct{ code, expl string }{string(br.Code), br.Explanation}
					return nil
				}
				st.block = nil
				st.plan = plan
				return nil
			}

			sc.Step(`^the domain "([^"]*)" is bound to project "([^"]*)"$`, func(domain, project string) error {
				return bindOnce(domain, project)
			})
			sc.Step(`^the domain "([^"]*)" is bound to project "([^"]*)" twice$`, func(domain, project string) error {
				if err := bindOnce(domain, project); err != nil {
					return err
				}
				p2, br := domainbind.Bind(st.reg, st.req)
				if br != nil {
					return fmt.Errorf("second bind refused: %s", br.Explanation)
				}
				st.plan2 = p2
				return nil
			})

			sc.Step(`^the bind is permitted$`, func() error {
				if st.block != nil {
					return fmt.Errorf("bind was refused: %s", st.block.expl)
				}
				if st.plan.ID == "" {
					return fmt.Errorf("bind emitted no plan")
				}
				return nil
			})
			sc.Step(`^the app is served over HTTPS on "([^"]*)"$`, func(domain string) error {
				if st.plan.URL != "https://"+domain {
					return fmt.Errorf("URL = %q, want https://%s", st.plan.URL, domain)
				}
				if !domainbind.ServesHTTPS(st.plan) {
					return fmt.Errorf("plan does not serve HTTPS")
				}
				return nil
			})
			sc.Step(`^the bind emits a websecure Traefik router with TLS and an ACME certresolver$`, func() error {
				var hasWebsecure, hasTLS, hasResolver bool
				for _, l := range st.plan.Labels {
					if strings.HasSuffix(l.Label, ".entrypoints") && l.Value == "websecure" {
						hasWebsecure = true
					}
					if strings.HasSuffix(l.Label, ".tls") && l.Value == "true" {
						hasTLS = true
					}
					if strings.HasSuffix(l.Label, ".tls.certresolver") && l.Value != "" {
						hasResolver = true
					}
				}
				if !hasWebsecure || !hasTLS || !hasResolver {
					return fmt.Errorf("labels missing HTTPS/TLS/certresolver: %+v", st.plan.Labels)
				}
				return nil
			})
			sc.Step(`^the bind emits a CNAME of "([^"]*)" to "([^"]*)"$`, func(name, value string) error {
				if st.plan.DNS.Type != "CNAME" || st.plan.DNS.Name != name || st.plan.DNS.Value != value {
					return fmt.Errorf("DNS = %+v, want CNAME %s -> %s", st.plan.DNS, name, value)
				}
				return nil
			})
			sc.Step(`^the bind is refused with code "([^"]*)"$`, func(code string) error {
				if st.block == nil {
					return fmt.Errorf("bind was not refused")
				}
				if st.block.code != code {
					return fmt.Errorf("refusal code = %q, want %q", st.block.code, code)
				}
				return nil
			})
			sc.Step(`^the refusal names the owning project "([^"]*)"$`, func(project string) error {
				if st.block == nil || !strings.Contains(st.block.expl, project) {
					return fmt.Errorf("refusal %v does not name owner %q", st.block, project)
				}
				return nil
			})
			sc.Step(`^both binds share the same id$`, func() error {
				if st.plan.ID != st.plan2.ID {
					return fmt.Errorf("bind ids differ: %q vs %q", st.plan.ID, st.plan2.ID)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../tests/runtime/domainbind.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("domainbind acceptance mirror failed")
	}
}

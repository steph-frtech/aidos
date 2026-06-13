package domainbind_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/domainbind"
)

// DP27 acceptance mirror runner (Godog, N0): drives tests/runtime/envdomain.feature against the
// in-process env-domain cabling. reflects=runtime.domainbind · test_kind=gherkin ·
// cert_language=godog · authority=above · liveness=live. ResolveInEnvironment writes nothing (the
// wall); ProposeEnvironmentDomain stages a DRAFT ChangeSet (DP24), never an APPLIED write.

type envDomainState struct {
	binding   domainbind.Binding
	resolved  domainbind.EnvDomainBinding
	cs        changeset.ChangeSet
	resolveOK bool
	proposeOK bool
}

func TestEnvDomainBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "envdomain",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &envDomainState{}

			sc.Step(`^the custom domain "([^"]*)" of project "([^"]*)"$`, func(domain, project string) error {
				st.binding = domainbind.Binding{Domain: domain, Project: project}
				return nil
			})
			sc.Step(`^the domain is cabled into environment "([^"]*)"$`, func(env string) error {
				eb, br := domainbind.ResolveInEnvironment(st.binding, scope.Environment(env))
				st.resolveOK = br == nil
				st.resolved = eb
				return nil
			})
			sc.Step(`^the cabling is permitted$`, func() error {
				if !st.resolveOK {
					return fmt.Errorf("the cabling was refused")
				}
				return nil
			})
			sc.Step(`^the cabling is refused$`, func() error {
				if st.resolveOK {
					return fmt.Errorf("the cabling was permitted; expected a refusal")
				}
				return nil
			})
			sc.Step(`^the app is served over HTTPS on "([^"]*)" in that environment$`, func(domain string) error {
				if st.resolved.URL != "https://"+domain {
					return fmt.Errorf("URL = %q, want https://%s", st.resolved.URL, domain)
				}
				if !domainbind.EnvServesHTTPS(st.resolved) {
					return fmt.Errorf("env binding does not serve HTTPS")
				}
				return nil
			})
			sc.Step(`^the cabling emits a websecure Traefik router with TLS and an ACME certresolver$`, func() error {
				var ws, tls, resolver bool
				for _, l := range st.resolved.Labels {
					if strings.HasSuffix(l.Label, ".entrypoints") && l.Value == "websecure" {
						ws = true
					}
					if strings.HasSuffix(l.Label, ".tls") && l.Value == "true" {
						tls = true
					}
					if strings.HasSuffix(l.Label, ".tls.certresolver") && l.Value != "" {
						resolver = true
					}
				}
				if !ws || !tls || !resolver {
					return fmt.Errorf("labels missing HTTPS/TLS/certresolver: %+v", st.resolved.Labels)
				}
				return nil
			})
			sc.Step(`^the cabling emits an HTTP to HTTPS redirect$`, func() error {
				var hasWeb, hasRedirect bool
				for _, l := range st.resolved.Labels {
					if strings.HasSuffix(l.Label, "-http.entrypoints") && l.Value == "web" {
						hasWeb = true
					}
					if strings.HasSuffix(l.Label, ".redirectscheme.scheme") && l.Value == "https" {
						hasRedirect = true
					}
				}
				if !hasWeb || !hasRedirect {
					return fmt.Errorf("labels missing HTTP→HTTPS redirect: %+v", st.resolved.Labels)
				}
				return nil
			})
			sc.Step(`^the env-domain is proposed for environment "([^"]*)"$`, func(env string) error {
				cs, err := domainbind.ProposeEnvironmentDomain(st.binding, scope.Environment(env))
				st.proposeOK = err == nil
				st.cs = cs
				return nil
			})
			sc.Step(`^a DRAFT ChangeSet is proposed carrying a spec and its mirror$`, func() error {
				if !st.proposeOK {
					return fmt.Errorf("the propose was refused")
				}
				if st.cs.Status != changeset.StatusDraft {
					return fmt.Errorf("status = %q, want DRAFT", st.cs.Status)
				}
				if st.cs.SpecDelta == nil || st.cs.MirrorDelta == nil {
					return fmt.Errorf("the envelope must carry a spec_delta AND its mirror_delta (no monster)")
				}
				if br := changeset.SpecHasMirror(st.cs); br != nil {
					return fmt.Errorf("incomplete envelope (a monster): %s", br.Explanation)
				}
				return nil
			})
			sc.Step(`^the proposed ChangeSet is reproducible$`, func() error {
				again, err := domainbind.ProposeEnvironmentDomain(st.binding, scope.EnvProd)
				if err != nil {
					return fmt.Errorf("second propose refused: %v", err)
				}
				if again.ID != st.cs.ID {
					return fmt.Errorf("proposed ChangeSet id not reproducible: %q vs %q", again.ID, st.cs.ID)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../tests/runtime/envdomain.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("env-domain acceptance mirror failed")
	}
}

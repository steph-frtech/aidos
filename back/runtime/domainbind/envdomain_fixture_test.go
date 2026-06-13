package domainbind_test

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/domainbind"
)

// DP27 — CABLAGE DU DOMAINE CUSTOM DANS L'ENVIRONNEMENT (DP06) (fixture, N2).
// reflects=runtime.domainbind · test_kind=fixture · cert_language=go · authority=above ·
// liveness=live. ResolveInEnvironment cables a custom domain into ONE DP06 environment and emits
// the Traefik HTTPS labels (DP03, reused — never a 2nd jeu). It writes nothing (the wall): it
// returns an EnvDomainBinding or a typed refusal. The truth-write path (the domain IN the
// Environment) goes through ProposeEnvironmentDomain → a DRAFT ChangeSet (DP24 pattern), never a
// direct write.

func okBinding() domainbind.Binding {
	return domainbind.Binding{Domain: "shop.acme.com", Project: "shop"}
}

func TestResolveInEnvironment_Fixtures(t *testing.T) {
	cases := []struct {
		name        string
		binding     domainbind.Binding
		env         scope.Environment
		wantOK      bool
		wantBlock   blockreasonCode
		wantTLS     bool
		wantManaged bool
	}{
		{
			name:    "prod cables the custom domain over HTTPS (TLS via certresolver)",
			binding: okBinding(),
			env:     scope.EnvProd,
			wantOK:  true,
			wantTLS: true,
		},
		{
			name:    "staging cables the custom domain over HTTPS too",
			binding: okBinding(),
			env:     scope.EnvStaging,
			wantOK:  true,
			wantTLS: true,
		},
		{
			name:        "future_cloud (managed) cables the custom domain over HTTPS",
			binding:     okBinding(),
			env:         scope.EnvFutureCloud,
			wantOK:      true,
			wantTLS:     true,
			wantManaged: true,
		},
		{
			name:    "local has no TLS — a custom domain over HTTPS is refused (env serves http only)",
			binding: okBinding(),
			env:     scope.EnvLocal,
			wantOK:  false,
		},
		{
			name:    "an unknown environment is refused (fail-closed)",
			binding: okBinding(),
			env:     scope.Environment("staging-eu"),
			wantOK:  false,
		},
		{
			name:    "an empty domain is refused (reuses the S97 validation)",
			binding: domainbind.Binding{Domain: "", Project: "shop"},
			env:     scope.EnvProd,
			wantOK:  false,
		},
		{
			name:    "an empty project is refused",
			binding: domainbind.Binding{Domain: "shop.acme.com", Project: ""},
			env:     scope.EnvProd,
			wantOK:  false,
		},
		{
			name:    "a malformed domain is refused (no dot)",
			binding: domainbind.Binding{Domain: "localhost", Project: "shop"},
			env:     scope.EnvProd,
			wantOK:  false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, br := domainbind.ResolveInEnvironment(tc.binding, tc.env)
			if tc.wantOK {
				if br != nil {
					t.Fatalf("expected OK, got refusal %s: %s", br.Code, br.Explanation)
				}
				// (a) the resolved domain for that env.
				if got.Domain != "shop.acme.com" {
					t.Fatalf("resolved domain = %q, want shop.acme.com", got.Domain)
				}
				if got.Environment != tc.env {
					t.Fatalf("environment = %q, want %q", got.Environment, tc.env)
				}
				// (b) the Traefik HTTPS labels emitted (DP03 reused).
				if !domainbind.EnvServesHTTPS(got) {
					t.Fatalf("env binding does not serve HTTPS: %+v", got.Labels)
				}
				if got.URL != "https://shop.acme.com" {
					t.Fatalf("URL = %q, want https://shop.acme.com", got.URL)
				}
				if got.TLS != tc.wantTLS {
					t.Fatalf("TLS = %v, want %v", got.TLS, tc.wantTLS)
				}
				if got.Managed != tc.wantManaged {
					t.Fatalf("Managed = %v, want %v", got.Managed, tc.wantManaged)
				}
				// The DP03 HTTPS vocabulary is present.
				assertHasLabel(t, got.Labels, ".entrypoints", "websecure")
				assertHasLabel(t, got.Labels, ".tls", "true")
				assertHasLabelSuffix(t, got.Labels, ".tls.certresolver")
				assertHasLabelSuffix(t, got.Labels, "-http.entrypoints") // the HTTP→HTTPS redirect companion
				return
			}
			if br == nil {
				t.Fatalf("expected refusal, got OK binding %+v", got)
			}
			if len(br.HowToFix) == 0 {
				t.Fatalf("refusal %s has empty how_to_fix (a prison)", br.Code)
			}
		})
	}
}

// blockreasonCode is a tiny alias so the fixture table need not import blockreason for cases that
// only check wantOK=false (the code is asserted in the BDD mirror).
type blockreasonCode = string

func assertHasLabel(t *testing.T, labels []domainbind.Label, suffix, value string) {
	t.Helper()
	for _, l := range labels {
		if strings.HasSuffix(l.Label, suffix) && l.Value == value {
			return
		}
	}
	t.Fatalf("no label ending %q with value %q in %+v", suffix, value, labels)
}

func assertHasLabelSuffix(t *testing.T, labels []domainbind.Label, suffix string) {
	t.Helper()
	for _, l := range labels {
		if strings.HasSuffix(l.Label, suffix) {
			return
		}
	}
	t.Fatalf("no label ending %q in %+v", suffix, labels)
}

// DP27 — the PROPOSE path: the domain IN the Environment is an environment truth, so it moves
// through propose → ChangeSet (DP24 pattern), never a direct write. ProposeEnvironmentDomain
// returns a DRAFT ChangeSet whose spec+mirror are complete (no monster), content-addressed.
func TestProposeEnvironmentDomain_Fixtures(t *testing.T) {
	binding := okBinding()

	t.Run("a valid env-domain proposes a complete DRAFT ChangeSet", func(t *testing.T) {
		cs, err := domainbind.ProposeEnvironmentDomain(binding, scope.EnvProd)
		if err != nil {
			t.Fatalf("propose refused: %v", err)
		}
		if cs.Status != changeset.StatusDraft {
			t.Fatalf("status = %q, want DRAFT (the agent never reaches APPLIED — the wall)", cs.Status)
		}
		if cs.AppliedAt != nil {
			t.Fatalf("an un-applied envelope has no commit stamp")
		}
		if cs.SpecDelta == nil || cs.MirrorDelta == nil {
			t.Fatalf("the envelope must carry a spec_delta AND its mirror_delta (no monster)")
		}
		if br := changeset.SpecHasMirror(cs); br != nil {
			t.Fatalf("the proposed envelope is incomplete (a monster): %s", br.Explanation)
		}
		if cs.ID == "" {
			t.Fatalf("the proposed ChangeSet is not content-addressed")
		}
	})

	t.Run("the same env-domain proposes a byte-identical ChangeSet (reproducible)", func(t *testing.T) {
		a, e1 := domainbind.ProposeEnvironmentDomain(binding, scope.EnvProd)
		b, e2 := domainbind.ProposeEnvironmentDomain(binding, scope.EnvProd)
		if e1 != nil || e2 != nil {
			t.Fatalf("propose refused: %v / %v", e1, e2)
		}
		if a.ID != b.ID {
			t.Fatalf("non-reproducible proposed ChangeSet id: %q vs %q", a.ID, b.ID)
		}
	})

	t.Run("an invalid env-domain proposes NOTHING (no DRAFT for a monster)", func(t *testing.T) {
		_, err := domainbind.ProposeEnvironmentDomain(domainbind.Binding{Domain: "localhost", Project: "shop"}, scope.EnvProd)
		if err == nil {
			t.Fatalf("expected a refusal for a malformed env-domain")
		}
	})

	t.Run("a no-TLS environment (local) proposes NOTHING (https not servable)", func(t *testing.T) {
		_, err := domainbind.ProposeEnvironmentDomain(binding, scope.EnvLocal)
		if err == nil {
			t.Fatalf("expected a refusal: local has no TLS, an HTTPS custom domain is not servable")
		}
	})
}

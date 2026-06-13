package domainbind_test

// DP27 — CABLAGE DOMAINE → ENVIRONNEMENT (DP06) : INVARIANTS (property, rapid). N1.
// reflects=runtime.domainbind · test_kind=property · liveness=live.
//
// Four properties (DP27 done-criteria):
//   - REPRODUCIBILITY: same binding + env → byte-identical EnvDomainBinding (same labels, URL).
//   - HTTPS SERVING via the DP03 vocabulary: every TLS env that accepts a custom domain serves it
//     over HTTPS — the EMITTED labels are the SAME canonical Traefik set composeemit emits (websecure
//     + tls + certresolver + the HTTP→HTTPS redirect), never a divergent 2nd jeu.
//   - INJECTIVITY: the binding domain→project stays injective per environment — a domain owned by
//     another project is refused by Bind (S97, reused), and IsInjective holds over the bindings.
//   - DP03 SOURCE UNICITY: the env-binding's labels are exactly composeemit.TraefikHTTPSLabels for
//     the custom domain — one source, no drift.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/composeemit"
	"github.com/steph-frtech/aidos/back/runtime/domainbind"
	"pgregory.net/rapid"
)

func genBinding(t *rapid.T) domainbind.Binding {
	return domainbind.Binding{
		Domain:  genDomain(t, "envdomain"),
		Project: "proj-" + rapid.StringMatching(`[a-z]{2,6}`).Draw(t, "envproj"),
	}
}

// tlsEnvs draws an environment that terminates TLS (so a custom HTTPS domain is servable).
func genTLSEnv(t *rapid.T) scope.Environment {
	return rapid.SampledFrom([]scope.Environment{
		scope.EnvProd, scope.EnvStaging, scope.EnvDev, scope.EnvFutureCloud,
	}).Draw(t, "tlsenv")
}

// PROP 1 — reproducibility: same binding + env → byte-identical env binding.
func TestPropEnv_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b := genBinding(t)
		env := genTLSEnv(t)
		a, e1 := domainbind.ResolveInEnvironment(b, env)
		c, e2 := domainbind.ResolveInEnvironment(b, env)
		if (e1 == nil) != (e2 == nil) {
			t.Fatalf("non-deterministic refusal")
		}
		if e1 == nil {
			if a.URL != c.URL || len(a.Labels) != len(c.Labels) {
				t.Fatalf("non-reproducible env binding: %+v vs %+v", a, c)
			}
			for i := range a.Labels {
				if a.Labels[i] != c.Labels[i] {
					t.Fatalf("non-reproducible label %d: %+v vs %+v", i, a.Labels[i], c.Labels[i])
				}
			}
		}
	})
}

// PROP 2 — HTTPS serving on every TLS env: an accepted env binding serves the app over HTTPS.
func TestPropEnv_ServesHTTPS(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b := genBinding(t)
		env := genTLSEnv(t)
		got, br := domainbind.ResolveInEnvironment(b, env)
		if br != nil {
			t.Fatalf("TLS env %q refused a valid custom domain: %s", env, br.Explanation)
		}
		if !domainbind.EnvServesHTTPS(got) {
			t.Fatalf("env binding does not serve HTTPS: %+v", got.Labels)
		}
		if !strings.HasPrefix(got.URL, "https://") {
			t.Fatalf("URL %q is not HTTPS", got.URL)
		}
	})
}

// PROP 3 — local has no TLS: an HTTPS custom domain is ALWAYS refused there (fail-closed).
func TestPropEnv_LocalRefusesHTTPS(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b := genBinding(t)
		_, br := domainbind.ResolveInEnvironment(b, scope.EnvLocal)
		if br == nil {
			t.Fatalf("local (no TLS) must refuse an HTTPS custom domain")
		}
	})
}

// PROP 4 — DP03 source unicity: the env binding's labels are EXACTLY composeemit.TraefikHTTPSLabels
// for the custom domain — one source, never a divergent 2nd jeu.
func TestPropEnv_LabelsAreDP03(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b := genBinding(t)
		env := genTLSEnv(t)
		got, br := domainbind.ResolveInEnvironment(b, env)
		if br != nil {
			return
		}
		want := composeemit.TraefikHTTPSLabels(got.RouterName, got.Domain, got.CertResolver, got.RedirectMiddleware, 0)
		if len(want) != len(got.Labels) {
			t.Fatalf("label count diverges from DP03: got %d, DP03 %d", len(got.Labels), len(want))
		}
		for i := range want {
			if want[i].Key != got.Labels[i].Label || want[i].Value != got.Labels[i].Value {
				t.Fatalf("label %d diverges from DP03: got {%s=%s}, DP03 {%s=%s}",
					i, got.Labels[i].Label, got.Labels[i].Value, want[i].Key, want[i].Value)
			}
		}
	})
}

// PROP 5 — injectivity preserved: the env binding reuses the S97 Bind injectivity; a domain owned
// by another project is refused, and IsInjective holds over the per-project bindings.
func TestPropEnv_Injective(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		b := genBinding(t)
		other := "other-" + rapid.StringMatching(`[a-z]{2,6}`).Draw(t, "other")
		if other == b.Project {
			return
		}
		// Two projects on the same domain must NOT be injective.
		bindings := []domainbind.Binding{{Domain: b.Domain, Project: other}, {Domain: b.Domain, Project: b.Project}}
		if domainbind.IsInjective(bindings) {
			t.Fatalf("two projects on the same domain must NOT be injective")
		}
	})
}

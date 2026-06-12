package envbindings_test

// Property mirror (∀ N1) for DP06 — the per-environment connection-binding
// PROJECTION (below-the-line) over the WIDENED closed environment set.
// reflects=runtime.envbindings, test_kind=property, cert_language=rapid,
// liveness=live. Written FIRST and red (no non-test Go files → compile fail),
// then green — the red IS the /goal (CLAUDE.md §6).
//
// The laws (ADR 0065 — addendum ADR 0006 + Amendements A1/A6 of
// ROADMAP-provisioning-deploy.md, authority = docs/plan/SPEC-stack-2026.md
// verbatim: « PostgreSQL = la prod. Doltgres = hors prod uniquement. » and
// « stack{environments local/dev/staging/prod/future_cloud, …} »):
//
//   1. FIVE ENVIRONMENTS, CLOSED. Bindings() covers EXACTLY scope.Environments()
//      (now 5: prod, staging, dev + the DP06 additive local, future_cloud), in
//      canonical order — one binding per environment, never more, never fewer.
//   2. REPRODUCIBILITY (determinism-first). Same environment → same Binding;
//      CanonicalBindings()/HashBindings() are byte-identical across runs
//      (Example ×100) and pinned to the Go-authoritative address consumed by
//      the TS twin + the Playwright e2e.
//   3. THE A1 GATE (fail-closed). ValidateDatastore(prod, doltgres) is REFUSED
//      with the closed code DOLTGRES_NOT_ALLOWED_IN_PROD — gravable ONLY
//      because the ADR-addendum 0065 to 0006 is accepted beforehand. Every
//      NON-prod known environment admits doltgres (opt-in, ADR 0006 verbatim).
//   4. FAIL-CLOSED ON THE UNKNOWN. An out-of-set environment or datastore is
//      REFUSED (UNKNOWN_ENVIRONMENT / UNKNOWN_DATASTORE), never guessed.
//   5. ALLOWED ⇔ VALIDATE. ∀ known (env, ds): ValidateDatastore(env, ds) == nil
//      ⇔ ds ∈ AllowedDatastores(env) — the table and the gate never diverge.
//   6. ${VAR} REFERENCES, NEVER VALUES. Every URLPattern carries at least one
//      ${VAR} reference and NO literal domain value (no sagedesk/.fr/.com —
//      the DP03–DP05 law extended to the bindings projection).
//   7. S15 STAYS FAIL-CLOSED ∧ ADDITIVE. An active truth scoped to ANY of the
//      5 environments passes scope.Validate; an active scope-less truth is
//      still rejected (the widening loosened NOTHING).

import (
	"bytes"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
	"pgregory.net/rapid"
)

// goBindingsHash is the Go-AUTHORITATIVE content address of the canonical
// bindings projection — the byte-for-byte pin the TS twin
// (front/web/lib/environments.ts) and the Playwright e2e reproduce.
const goBindingsHash = "aaca11ab05812777fbac50c18f6f38f5ad72030a67439f83ed32b002a519a419"

// drawKnownEnv draws one of the five closed environments.
func drawKnownEnv(rt *rapid.T) scope.Environment {
	envs := scope.Environments()
	return envs[rapid.IntRange(0, len(envs)-1).Draw(rt, "env")]
}

// TestFiveEnvironmentsClosed — law 1: one binding per environment, in the
// canonical scope.Environments() order, exactly five.
func TestFiveEnvironmentsClosed(t *testing.T) {
	bindings := envbindings.Bindings()
	envs := scope.Environments()
	if len(envs) != 5 {
		t.Fatalf("scope.Environments() must now carry 5 members (ADR 0065), got %d", len(envs))
	}
	if len(bindings) != len(envs) {
		t.Fatalf("Bindings() must cover the closed set: got %d bindings for %d environments", len(bindings), len(envs))
	}
	for i, b := range bindings {
		if b.Environment != envs[i] {
			t.Fatalf("bindings[%d].Environment = %q, want canonical order %q", i, b.Environment, envs[i])
		}
	}
}

// TestBindingsReproducible — law 2: same environment → same binding; the
// canonical projection is byte-identical across 100 runs and hashes to the
// pinned Go-authoritative address.
func TestBindingsReproducible(t *testing.T) {
	first, err := envbindings.CanonicalBindings()
	if err != nil {
		t.Fatalf("CanonicalBindings: %v", err)
	}
	for i := 0; i < 100; i++ {
		again, err := envbindings.CanonicalBindings()
		if err != nil {
			t.Fatalf("CanonicalBindings run %d: %v", i, err)
		}
		if !bytes.Equal(first, again) {
			t.Fatalf("CanonicalBindings must be byte-identical (run %d diverged)", i)
		}
	}
	hash, err := envbindings.HashBindings()
	if err != nil {
		t.Fatalf("HashBindings: %v", err)
	}
	if hash != records.Hash(first) {
		t.Fatalf("HashBindings must equal records.Hash(CanonicalBindings): %q vs %q", hash, records.Hash(first))
	}
	if hash != goBindingsHash {
		t.Fatalf("the Go-authoritative bindings address moved: got %q want %q (the TS twin + e2e pin this byte-for-byte)", hash, goBindingsHash)
	}
	rapid.Check(t, func(rt *rapid.T) {
		env := drawKnownEnv(rt)
		a, errA := envbindings.BindingsFor(env)
		b, errB := envbindings.BindingsFor(env)
		if (errA == nil) != (errB == nil) {
			rt.Fatalf("BindingsFor(%q) error-ness diverged: %v vs %v", env, errA, errB)
		}
		if a.Environment != b.Environment || a.DefaultDatastore != b.DefaultDatastore ||
			a.URLPattern != b.URLPattern || a.TLS != b.TLS || a.Network != b.Network || a.Managed != b.Managed {
			rt.Fatalf("BindingsFor(%q) must be deterministic: %+v vs %+v", env, a, b)
		}
	})
}

// TestProdRefusesDoltgres — law 3 (Amendement A1, gravable because ADR 0065 is
// accepted): prod + doltgres is REFUSED with DOLTGRES_NOT_ALLOWED_IN_PROD;
// every non-prod known environment admits doltgres (opt-in).
func TestProdRefusesDoltgres(t *testing.T) {
	err := envbindings.ValidateDatastore(scope.EnvProd, envbindings.DatastoreDoltgres)
	if err == nil {
		t.Fatalf("prod + doltgres MUST be refused (SPEC-stack-2026: « PostgreSQL = la prod. Doltgres = hors prod uniquement. »)")
	}
	var ref *envbindings.Refusal
	if !envbindings.AsRefusal(err, &ref) || ref.Code != envbindings.CodeDoltgresNotAllowedInProd {
		t.Fatalf("the refusal must carry the closed code %s, got %v", envbindings.CodeDoltgresNotAllowedInProd, err)
	}
	// prod + postgres passes (the prod default).
	if err := envbindings.ValidateDatastore(scope.EnvProd, envbindings.DatastorePostgres); err != nil {
		t.Fatalf("prod + postgres must pass, got %v", err)
	}
	rapid.Check(t, func(rt *rapid.T) {
		env := drawKnownEnv(rt)
		if env == scope.EnvProd {
			return // the refusal case, asserted above
		}
		if err := envbindings.ValidateDatastore(env, envbindings.DatastoreDoltgres); err != nil {
			rt.Fatalf("doltgres must be admitted in non-prod %q (ADR 0006/0065 opt-in), got %v", env, err)
		}
	})
}

// TestUnknownRefused — law 4: an out-of-set environment or datastore is
// refused with its closed code, never guessed.
func TestUnknownRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		raw := rapid.StringMatching(`[a-z_]{1,20}`).Draw(rt, "rawEnv")
		env := scope.Environment(raw)
		if scope.IsKnownEnvironment(env) {
			return // drew a real member; not the case under test
		}
		if _, err := envbindings.BindingsFor(env); err == nil {
			rt.Fatalf("BindingsFor(%q) must refuse an unknown environment", env)
		} else {
			var ref *envbindings.Refusal
			if !envbindings.AsRefusal(err, &ref) || ref.Code != envbindings.CodeUnknownEnvironment {
				rt.Fatalf("unknown environment must carry %s, got %v", envbindings.CodeUnknownEnvironment, err)
			}
		}
		if err := envbindings.ValidateDatastore(env, envbindings.DatastorePostgres); err == nil {
			rt.Fatalf("ValidateDatastore(%q, postgres) must refuse an unknown environment", env)
		}
	})
	rapid.Check(t, func(rt *rapid.T) {
		raw := rapid.StringMatching(`[a-z]{1,20}`).Draw(rt, "rawDs")
		ds := envbindings.Datastore(raw)
		if envbindings.IsKnownDatastore(ds) {
			return
		}
		err := envbindings.ValidateDatastore(scope.EnvDev, ds)
		if err == nil {
			rt.Fatalf("ValidateDatastore(dev, %q) must refuse an unknown datastore", ds)
		}
		var ref *envbindings.Refusal
		if !envbindings.AsRefusal(err, &ref) || ref.Code != envbindings.CodeUnknownDatastore {
			rt.Fatalf("unknown datastore must carry %s, got %v", envbindings.CodeUnknownDatastore, err)
		}
	})
}

// TestAllowedIffValidates — law 5: the AllowedDatastores table and the
// ValidateDatastore gate never diverge.
func TestAllowedIffValidates(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		env := drawKnownEnv(rt)
		b, err := envbindings.BindingsFor(env)
		if err != nil {
			rt.Fatalf("BindingsFor(%q): %v", env, err)
		}
		for _, ds := range envbindings.Datastores() {
			allowed := false
			for _, a := range b.AllowedDatastores {
				if a == ds {
					allowed = true
				}
			}
			pass := envbindings.ValidateDatastore(env, ds) == nil
			if allowed != pass {
				rt.Fatalf("env %q ds %q: allowed-table says %v but the gate says %v — they must never diverge", env, ds, allowed, pass)
			}
		}
	})
}

// TestURLPatternsAreReferences — law 6: every URLPattern carries a ${VAR}
// reference and no literal domain value.
func TestURLPatternsAreReferences(t *testing.T) {
	for _, b := range envbindings.Bindings() {
		if !strings.Contains(b.URLPattern, "${") {
			t.Fatalf("env %q URLPattern %q must carry a ${VAR} reference, never a bare value", b.Environment, b.URLPattern)
		}
		for _, leak := range []string{"sagedesk", ".fr", ".com", "http://1", "https://1"} {
			if strings.Contains(b.URLPattern, leak) {
				t.Fatalf("env %q URLPattern %q leaks a literal value (%q) — references only", b.Environment, b.URLPattern, leak)
			}
		}
	}
	// prod & future_cloud default to postgres; the non-prod trio defaults to doltgres (ADR 0065).
	for _, b := range envbindings.Bindings() {
		wantPostgres := b.Environment == scope.EnvProd || b.Environment == scope.EnvFutureCloud
		if wantPostgres && b.DefaultDatastore != envbindings.DatastorePostgres {
			t.Fatalf("env %q must default to postgres (ADR 0065), got %q", b.Environment, b.DefaultDatastore)
		}
		if !wantPostgres && b.DefaultDatastore != envbindings.DatastoreDoltgres {
			t.Fatalf("non-prod env %q defaults to doltgres (ADR 0065 git-for-data), got %q", b.Environment, b.DefaultDatastore)
		}
	}
}

// TestScopeStaysFailClosedOverFiveEnvs — law 7 (the DP06 done criterion on
// S15): an active truth scoped to ANY of the five environments passes
// scope.Validate; an active scope-less truth is STILL rejected — the additive
// widening loosened nothing.
func TestScopeStaysFailClosedOverFiveEnvs(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		env := drawKnownEnv(rt)
		rec := scope.Record{
			Status: scope.StatusActive,
			Scope:  scope.TruthScope{Environment: env},
		}
		if err := scope.Validate(rec); err != nil {
			rt.Fatalf("an active truth scoped to %q must pass (additive widening), got %v", env, err)
		}
	})
	// fail-closed intact: active + scope-less is still rejected.
	err := scope.Validate(scope.Record{Status: scope.StatusActive})
	if err == nil {
		t.Fatalf("an active scope-less truth must STILL be rejected (S15 fail-closed, unchanged by DP06)")
	}
	var re *scope.RejectedError
	if !scope.AsRejected(err, &re) || re.Code != scope.CodeActiveTruthWithoutScope {
		t.Fatalf("the rejection must stay %q, got %v", scope.CodeActiveTruthWithoutScope, err)
	}
}

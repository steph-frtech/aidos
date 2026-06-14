package bootstrap_test

// Property mirror (∀ N1) for DP32 — BRANCHER S91 sur le provisioning : le secret
// store par projet alimente le .env CONCRET au boot par variables d'environnement.
// reflects=runtime.bootstrap (DP32), test_kind=property, cert_language=rapid,
// liveness=live. Written FIRST and red (MergeBootEnv does not exist yet → compile
// fail), then green — the red IS the /goal (CLAUDE.md §6, determinism-first §8).
//
// The laws (DP32 done-criteria) :
//
//  1. ORDRE DE MERGE PUR & REPRODUCTIBLE. MergeBootEnv(env, store, proj, overrides)
//     is a PURE function of its inputs — same inputs → byte-identical concrete env,
//     every time (la fonction d'ordre de merge est GRAVÉE, déterministe).
//  2. ISOLATION CROSS-PROJET. A secret Set under project A NEVER resolves under
//     project B : a B-scoped boot that needs the same reference key fails closed
//     (scopeKey + AES-GCM AAD bind, S55 RLS at the persistence layer).
//  3. RÉFÉRENCE MANQUANTE ⇒ FAIL-CLOSED. A required secret reference with no value
//     (neither store nor override) ⇒ MISSING_SECRET_AT_BOOT (actionable how_to_fix
//     ≥ 1) and NO concrete env — never a partial boot with a blank credential.
//  4. OVERRIDE WINS LAST. An environment override of any key is the LAST engraved
//     layer : the merged value equals the override, whatever the store held.
//  5. NO SECRET IN THE EMITTED SOURCE. The .env.example carries ONLY references —
//     the deterministic ScanEmission (S91, code never an LLM) over the emission
//     finds no store VALUE, for any seeded store.

import (
	"sort"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
	"github.com/steph-frtech/aidos/back/runtime/envemit"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
	"pgregory.net/rapid"
)

// drawDP32Bundle draws a well-formed minimal bundle (server + datastore + edge)
// with a random number of declared connector scopes (each adds one APP_SECRET_<S>
// reference to the .env.example).
func drawDP32Bundle(rt *rapid.T) stackmanifest.StackManifest {
	nScopes := rapid.IntRange(0, 3).Draw(rt, "nScopes")
	seen := map[string]bool{}
	scopes := make([]string, 0, nScopes)
	for i := 0; i < nScopes; i++ {
		s := rapid.StringMatching(`[a-z]{2,8}`).Draw(rt, "scope")
		if seen[s] {
			continue
		}
		seen[s] = true
		scopes = append(scopes, s)
	}
	return stackmanifest.StackManifest{
		AppName: rapid.StringMatching(`[a-z][a-z0-9-]{0,10}`).Draw(rt, "app"),
		Services: []stackmanifest.Service{
			{Name: "server", Role: stackmanifest.RoleServer, InternalPort: 3000, Profile: stackmanifest.ProfileCore},
			{Name: "db", Role: stackmanifest.RoleDatastore, Image: "postgres:17", InternalPort: 5432, Profile: stackmanifest.ProfileCore},
			{Name: "edge", Role: stackmanifest.RoleObservability, Image: "traefik:v3", InternalPort: 80, Profile: stackmanifest.ProfileCore},
		},
		Network:         stackmanifest.Network{Name: "traefik_default", External: true},
		ConnectorScopes: scopes,
	}
}

// secretRefKeys returns the .env.example KEYS that carry the secret placeholder —
// the references MergeBootEnv must resolve from the store/overrides.
func secretRefKeys(env []byte) []string {
	out := []string{}
	for _, line := range strings.Split(string(env), "\n") {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		if eq := strings.IndexByte(t, '='); eq > 0 {
			if t[eq+1:] == envemit.SecretPlaceholder {
				out = append(out, t[:eq])
			}
		}
	}
	sort.Strings(out)
	return out
}

// seedFull seeds a store with a deterministic value for every secret reference of
// the .env.example under proj, so the boot may proceed. Returns the value map.
func seedFull(rt *rapid.T, env []byte, proj string) (*secretstore.SecretStore, map[string]string) {
	st, err := secretstore.New(secretstore.DeriveKey("dp32-prop"))
	if err != nil {
		rt.Fatalf("New store: %v", err)
	}
	values := map[string]string{}
	for i, k := range secretRefKeys(env) {
		v := "VALUE-" + itoa(i) + "-" + rapid.StringMatching(`[A-Za-z0-9]{12,20}`).Draw(rt, "val")
		st.Set(proj, k, v)
		values[k] = v
	}
	return st, values
}

// TestProp_DP32_MergeIsDeterministic — law 1 : same inputs → same concrete env.
func TestProp_DP32_MergeIsDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bundle := drawDP32Bundle(rt)
		out, br := envemit.Emit(bundle)
		if br != nil {
			rapid.Check(t, func(*rapid.T) {})
			return
		}
		env := out.EnvExample.Bytes
		proj := "p_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(rt, "proj")
		st, _ := seedFull(rt, env, proj)

		a, brA := bootstrap.MergeBootEnv(env, st, proj, nil)
		b, brB := bootstrap.MergeBootEnv(env, st, proj, nil)
		if (brA == nil) != (brB == nil) {
			t.Fatalf("non-deterministic block: %v vs %v", brA, brB)
		}
		if brA != nil {
			return
		}
		if !sameEnv(a, b) {
			t.Fatalf("MergeBootEnv is non-deterministic:\n %v\n %v", a, b)
		}
	})
}

// TestProp_DP32_CrossProjectIsolation — law 2 : A's secrets never resolve for B.
func TestProp_DP32_CrossProjectIsolation(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bundle := drawDP32Bundle(rt)
		out, br := envemit.Emit(bundle)
		if br != nil {
			return
		}
		env := out.EnvExample.Bytes
		if len(secretRefKeys(env)) == 0 {
			return // no reference to isolate
		}
		projA := "a_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(rt, "a")
		projB := "b_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(rt, "b")
		if projA == projB {
			return
		}
		// seed A fully; B holds nothing.
		st, _ := seedFull(rt, env, projA)
		// A boots.
		if _, brA := bootstrap.MergeBootEnv(env, st, projA, nil); brA != nil {
			t.Fatalf("project A could not boot with its own secrets: %q", brA.Code)
		}
		// B fails closed — A's secrets are invisible under B's scope.
		mergedB, brB := bootstrap.MergeBootEnv(env, st, projB, nil)
		if brB == nil {
			t.Fatal("ISOLATION VIOLATION: project B booted off project A's secrets")
		}
		if brB.Code != blockreason.CodeMissingSecretAtBoot {
			t.Fatalf("project B block = %q, want MISSING_SECRET_AT_BOOT", brB.Code)
		}
		if mergedB != nil {
			t.Fatal("a blocked boot returns no env")
		}
	})
}

// TestProp_DP32_MissingReferenceFailsClosed — law 3.
func TestProp_DP32_MissingReferenceFailsClosed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bundle := drawDP32Bundle(rt)
		out, br := envemit.Emit(bundle)
		if br != nil {
			return
		}
		env := out.EnvExample.Bytes
		refs := secretRefKeys(env)
		if len(refs) == 0 {
			return // nothing to omit
		}
		proj := "p_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(rt, "proj")
		st, _ := seedFull(rt, env, proj)
		// drop one required reference from the store (rotate it away is not enough —
		// we build a fresh store missing exactly one key).
		drop := refs[rapid.IntRange(0, len(refs)-1).Draw(rt, "drop")]
		st2, _ := secretstore.New(secretstore.DeriveKey("dp32-prop"))
		for _, k := range refs {
			if k == drop {
				continue
			}
			st2.Set(proj, k, "v-"+k+"-abcdef012345")
		}
		merged, brBoot := bootstrap.MergeBootEnv(env, st2, proj, nil)
		if brBoot == nil {
			t.Fatalf("a missing reference (%s) MUST fail closed", drop)
		}
		if brBoot.Code != blockreason.CodeMissingSecretAtBoot {
			t.Fatalf("missing-reference block = %q, want MISSING_SECRET_AT_BOOT", brBoot.Code)
		}
		if len(brBoot.HowToFix) == 0 {
			t.Fatal("an empty how_to_fix is a prison (KRD §44.5)")
		}
		if !strings.Contains(brBoot.Explanation, drop) {
			t.Fatalf("the missing reference %q must be NAMED in the explanation: %s", drop, brBoot.Explanation)
		}
		if merged != nil {
			t.Fatal("a blocked boot returns no env")
		}
		_ = st
	})
}

// TestProp_DP32_OverrideWinsLast — law 4.
func TestProp_DP32_OverrideWinsLast(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bundle := drawDP32Bundle(rt)
		out, br := envemit.Emit(bundle)
		if br != nil {
			return
		}
		env := out.EnvExample.Bytes
		proj := "p_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(rt, "proj")
		st, _ := seedFull(rt, env, proj)

		// pick any key of the .env.example and override it — the override must win.
		keys := envemit.Keys(env)
		if len(keys) == 0 {
			return
		}
		k := keys[rapid.IntRange(0, len(keys)-1).Draw(rt, "k")]
		want := "OVERRIDE-" + rapid.StringMatching(`[A-Za-z0-9]{8,16}`).Draw(rt, "ov")
		merged, brBoot := bootstrap.MergeBootEnv(env, st, proj, map[string]string{k: want})
		if brBoot != nil {
			t.Fatalf("override boot blocked: %q", brBoot.Code)
		}
		if merged[k] != want {
			t.Fatalf("override of %q did not win last: got %q want %q", k, merged[k], want)
		}
	})
}

// TestProp_DP32_NoSecretInEmittedSource — law 5 : ∀ seeded store, the .env.example
// emission carries NO store value (references only), the scan is green.
func TestProp_DP32_NoSecretInEmittedSource(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bundle := drawDP32Bundle(rt)
		out, br := envemit.Emit(bundle)
		if br != nil {
			return
		}
		env := out.EnvExample.Bytes
		proj := "p_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(rt, "proj")
		_, values := seedFull(rt, env, proj)

		known := make([]string, 0, len(values))
		for _, v := range values {
			known = append(known, v)
		}
		if !secretstore.IsClean(string(env), known) {
			t.Fatalf("the .env.example leaks a secret VALUE: %v", secretstore.ScanEmission(string(env), known))
		}
		// every secret reference is the placeholder, never a value.
		for _, line := range strings.Split(string(env), "\n") {
			tline := strings.TrimSpace(line)
			if tline == "" || strings.HasPrefix(tline, "#") {
				continue
			}
			eq := strings.IndexByte(tline, '=')
			if eq <= 0 {
				continue
			}
			val := tline[eq+1:]
			for _, sv := range known {
				if sv != "" && val == sv {
					t.Fatalf("the .env.example carries a raw secret value: %s", tline)
				}
			}
		}
	})
}

// sameEnv reports whether two concrete env maps are byte-identical.
func sameEnv(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

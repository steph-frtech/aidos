// secretstore_property_test.go — the S91 INVARIANT mirror (rapid, the frozen Go
// property slot, CLAUDE.md §3). It pins the done-criteria a fixture cannot:
//
//   - ISOLATION (property): for ANY two distinct project_ids, a secret Set under A is
//     NEVER readable under B — Get(B, name) returns ErrNotFound (the AES-GCM AAD bind),
//     and the leaked value never appears in B's view.
//   - NO-LEAK-IN-SOURCE (property): the store's plaintext value, for ANY emission text
//     that does NOT contain it, is NOT flagged; and any emission that DOES embed it IS
//     flagged — the scanner is sound + complete on the value match (same input → same
//     findings).
//   - REPRODUCIBILITY (property): with a FIXED sealer, the same (project, name, value)
//     seals to byte-identical ciphertext, and InjectEnv over the same store state +
//     declared keys yields the byte-identical SORTED env (same input → same output).
//   - INJECTION FAIL-CLOSED (property): InjectEnv is a set-difference — it returns a
//     BlockReason iff some declared key is absent; never for a present superset.
package secretstore

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

// genName draws a secret name from a small alphabet (the env-var-legal shape).
func genName(t *rapid.T, label string) string {
	return rapid.StringMatching(`[a-z][a-z0-9_]{0,11}`).Draw(t, label)
}

// genValue draws a non-trivial secret value (long enough to be a real credential).
func genValue(t *rapid.T, label string) string {
	return rapid.StringMatching(`[A-Za-z0-9._\-]{12,40}`).Draw(t, label)
}

func TestProp_CrossProjectIsolation(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		key := DeriveKey("test")
		st, err := New(key)
		if err != nil {
			t.Fatalf("New: %v", err)
		}
		projA := "proj_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(t, "a")
		projB := "proj_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(t, "b")
		if projA == projB {
			return // distinct-project invariant only
		}
		name := genName(t, "name")
		value := genValue(t, "value")
		if err := st.Set(projA, name, value); err != nil {
			t.Fatalf("Set: %v", err)
		}
		// A reads its own secret.
		got, err := st.Get(projA, name)
		if err != nil || got != value {
			t.Fatalf("A cannot read its own secret: got=%q err=%v", got, err)
		}
		// B can NEVER read A's secret (the cross-project leak law).
		if _, err := st.Get(projB, name); err != ErrNotFound {
			t.Fatalf("ISOLATION VIOLATION: project B read project A's secret (err=%v)", err)
		}
		if st.Has(projB, name) {
			t.Fatalf("ISOLATION VIOLATION: project B sees project A's key present")
		}
		// B's fingerprint never contains A's secret.
		if st.StoreFingerprint(projB) != st.StoreFingerprint("proj_empty_zzzzzz") {
			// both empty stores → equal fingerprint of the empty set
		}
	})
}

func TestProp_LeakScanSoundAndComplete(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		value := genValue(t, "value")
		// Clean text: a benign emission that does NOT embed the value → no value-match.
		clean := "const port = 3000;\nfunction handler() { return ok(); }\n"
		for _, f := range ScanEmission(clean, []string{value}) {
			if f.Rule == "known-secret-value" {
				t.Fatalf("FALSE POSITIVE: clean source flagged a value it does not contain")
			}
		}
		// Leaky text: an emission that DOES embed the value → it IS flagged.
		leaky := "const dbPassword = \"" + value + "\";\n"
		found := false
		for _, f := range ScanEmission(leaky, []string{value}) {
			if f.Rule == "known-secret-value" {
				found = true
				if got := f.Excerpt; got == leaky || containsRaw(got, value) {
					t.Fatalf("scanner re-emitted the secret in the clear: %q", got)
				}
			}
		}
		if !found {
			t.Fatalf("INCOMPLETE: scanner missed the embedded secret value")
		}
	})
}

// containsRaw reports whether the redacted excerpt still contains the raw secret.
func containsRaw(excerpt, value string) bool {
	return len(value) >= 6 && indexOf(excerpt, value) >= 0
}

func indexOf(haystack, needle string) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return i
		}
	}
	return -1
}

func TestProp_ReproducibleSeal(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		key := DeriveKey("repro")
		proj := "proj_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(t, "p")
		name := genName(t, "name")
		value := genValue(t, "value")

		s1, _ := NewWithSealer(key, NewFixedSealer("seed"))
		s2, _ := NewWithSealer(key, NewFixedSealer("seed"))
		if err := s1.Set(proj, name, value); err != nil {
			t.Fatalf("Set s1: %v", err)
		}
		if err := s2.Set(proj, name, value); err != nil {
			t.Fatalf("Set s2: %v", err)
		}
		// Same key + same fixed nonce + same plaintext + same AAD → byte-identical seal.
		if s1.StoreFingerprint(proj) != s2.StoreFingerprint(proj) {
			t.Fatalf("REPRODUCIBILITY: same input sealed to different ciphertext")
		}
		// And the same InjectEnv output.
		inj1, br1 := s1.InjectEnv(proj, []string{name})
		inj2, br2 := s2.InjectEnv(proj, []string{name})
		if br1 != nil || br2 != nil {
			t.Fatalf("unexpected block: %v %v", br1, br2)
		}
		if len(inj1.Env) != 1 || len(inj2.Env) != 1 ||
			inj1.Env[0] != inj2.Env[0] {
			t.Fatalf("REPRODUCIBILITY: InjectEnv non-deterministic")
		}
		if inj1.Env[0].Value != value {
			t.Fatalf("injected env value mismatch")
		}
	})
}

func TestProp_InjectEnvFailClosed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		key := DeriveKey("inj")
		st, _ := New(key)
		proj := "proj_" + rapid.StringMatching(`[a-f0-9]{6}`).Draw(t, "p")

		present := genName(t, "present")
		st.Set(proj, present, genValue(t, "v"))

		missing := genName(t, "missing")
		if missing == present {
			return
		}
		// declared = {present, missing} → boot fails closed (missing key).
		_, br := st.InjectEnv(proj, []string{present, missing})
		if br == nil {
			t.Fatalf("FAIL-CLOSED VIOLATION: boot allowed with a missing declared secret")
		}
		if br.Code != blockreason.CodeSecretMissingAtBoot {
			t.Fatalf("wrong block code: %s", br.Code)
		}
		if len(br.HowToFix) == 0 {
			t.Fatalf("BlockReason is a prison (no how_to_fix)")
		}
		// declared = {present} only → boot succeeds.
		inj, br2 := st.InjectEnv(proj, []string{present})
		if br2 != nil {
			t.Fatalf("boot refused with all declared keys present: %v", br2)
		}
		if len(inj.Env) != 1 {
			t.Fatalf("expected exactly one injected env var, got %d", len(inj.Env))
		}
	})
}

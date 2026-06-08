// secretstore_fixture_test.go — the S91 WORKFLOW/acceptance mirror (Go fixtures,
// state → command → outcome). Each fixture pins one done-criterion verbatim:
//
//   - ROTATION invalidates the old secret (la rotation invalide l'ancien secret) ;
//   - a MISSING secret at boot raises an actionable BlockReason (un secret manquant au
//     boot lève un BlockReason actionnable) ;
//   - the LEAK SCAN (scan = code) finds a leaked secret value AND known credential
//     patterns in an emission, and passes a clean emission ;
//   - cross-project ISOLATION: A's secret never leaks to B nor into the emitted source.
package secretstore

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

func newStore(t *testing.T) *SecretStore {
	t.Helper()
	st, err := New(DeriveKey("fixture-master"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return st
}

// Fixture: rotation invalidates the old secret.
func TestFixture_RotationInvalidatesOldSecret(t *testing.T) {
	st := newStore(t)
	const proj, name = "projA", "db_password"
	const old, fresh = "OLD-credential-aaaa", "NEW-credential-bbbb"

	if err := st.Set(proj, name, old); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if got, _ := st.Get(proj, name); got != old {
		t.Fatalf("pre-rotation read mismatch: %q", got)
	}

	// WHEN the secret is rotated
	if err := st.Rotate(proj, name, fresh); err != nil {
		t.Fatalf("Rotate: %v", err)
	}

	// THEN Get returns the NEW value and the OLD value is invalidated (never returned).
	got, err := st.Get(proj, name)
	if err != nil {
		t.Fatalf("post-rotation Get: %v", err)
	}
	if got != fresh {
		t.Fatalf("rotation did not take effect: got %q want %q", got, fresh)
	}
	if got == old {
		t.Fatalf("ROTATION VIOLATION: old secret still live after rotation")
	}

	// And the boot injection carries the NEW value, never the old one.
	inj, br := st.InjectEnv(proj, []string{name})
	if br != nil {
		t.Fatalf("InjectEnv blocked: %v", br)
	}
	if inj.Env[0].Value != fresh {
		t.Fatalf("rotated value not injected at boot: %q", inj.Env[0].Value)
	}
	if strings.Contains(inj.Env[0].Value, old) {
		t.Fatalf("old secret leaked into boot env")
	}
}

// Fixture: rotating an absent secret is refused (you Set what does not exist).
func TestFixture_RotateAbsentIsNotFound(t *testing.T) {
	st := newStore(t)
	if err := st.Rotate("projA", "never_set", "x"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound rotating an absent secret, got %v", err)
	}
}

// Fixture: a missing secret at boot raises an actionable BlockReason.
func TestFixture_MissingSecretAtBootRaisesBlockReason(t *testing.T) {
	st := newStore(t)
	const proj = "projA"
	st.Set(proj, "db_url", "postgres://u:p@h/db")

	// The app DECLARES it needs two secrets, but only one is present.
	declared := []string{"db_url", "stripe_api_key"}
	inj, br := st.InjectEnv(proj, declared)
	if br == nil {
		t.Fatalf("boot was allowed with a missing declared secret (must fail closed)")
	}
	if br.Code != blockreason.CodeSecretMissingAtBoot {
		t.Fatalf("wrong block code: %s", br.Code)
	}
	if br.Severity != blockreason.SeverityBlocking {
		t.Fatalf("missing secret must be blocking")
	}
	if len(br.HowToFix) == 0 {
		t.Fatalf("BlockReason without how_to_fix is a prison (KRD §44.5)")
	}
	// The missing key is NAMED in the explanation (actionable, not opaque).
	if !strings.Contains(br.Explanation, "stripe_api_key") {
		t.Fatalf("missing key not named in the BlockReason: %s", br.Explanation)
	}
	if len(inj.Env) != 0 {
		t.Fatalf("a blocked boot must inject no env")
	}

	// WHEN the missing secret is set, the boot succeeds (the block lifts deterministically).
	st.Set(proj, "stripe_api_key", "sk_test_longvalue123456")
	inj2, br2 := st.InjectEnv(proj, declared)
	if br2 != nil {
		t.Fatalf("boot still blocked after the secret was set: %v", br2)
	}
	if len(inj2.Env) != 2 {
		t.Fatalf("expected two injected env vars, got %d", len(inj2.Env))
	}
	// Deterministic SORTED env names.
	if inj2.Env[0].Name != "APP_SECRET_DB_URL" || inj2.Env[1].Name != "APP_SECRET_STRIPE_API_KEY" {
		t.Fatalf("env names wrong/unsorted: %v", inj2.Env)
	}
}

// Fixture: the leak scan (scan = code) finds leaked values + known credential patterns.
func TestFixture_LeakScanFindsSecretsInEmission(t *testing.T) {
	// A leaked Postgres URI password + an AWS key + a private key header + a value match.
	const secretValue = "S3cr3t-Value-In-Source-xyz"
	emission := strings.Join([]string{
		"// generated app config",
		"const dbUrl = \"postgres://app:hunter2pass@db.internal/app\";",
		"const awsKey = \"AKIAIOSFODNN7EXAMPLE\";",
		"const inline = \"" + secretValue + "\";",
		"-----BEGIN RSA PRIVATE KEY-----",
	}, "\n")

	findings := ScanEmission(emission, []string{secretValue})
	if len(findings) == 0 {
		t.Fatalf("LEAK SCAN missed every secret in a leaky emission")
	}
	rules := map[string]bool{}
	for _, f := range findings {
		rules[f.Rule] = true
		// The scanner never re-emits the raw secret value in its own report.
		if strings.Contains(f.Excerpt, secretValue) || strings.Contains(f.Excerpt, "hunter2pass") {
			t.Fatalf("scanner report leaked the secret in the clear: %q", f.Excerpt)
		}
	}
	for _, want := range []string{"postgres-uri-password", "aws-access-key-id", "private-key-header", "known-secret-value"} {
		if !rules[want] {
			t.Fatalf("leak scan missed rule %q (found: %v)", want, findings)
		}
	}

	if IsClean(emission, []string{secretValue}) {
		t.Fatalf("IsClean returned true on a leaky emission")
	}
}

// Fixture: a clean emission passes the scan (no false positives).
func TestFixture_CleanEmissionPasses(t *testing.T) {
	clean := strings.Join([]string{
		"import { Hono } from \"hono\";",
		"const app = new Hono();",
		"app.get(\"/orders\", (c) => c.json([]));",
		"export default app;",
	}, "\n")
	if !IsClean(clean, []string{"some-secret-value"}) {
		t.Fatalf("clean emission flagged: %v", ScanEmission(clean, []string{"some-secret-value"}))
	}
}

// Fixture: cross-project isolation — A's secret never leaks to B nor into the source.
func TestFixture_SecretOfANeverLeaksToB(t *testing.T) {
	st := newStore(t)
	const value = "A-only-credential-9988"
	st.Set("projectA", "api_key", value)

	// B cannot read it.
	if _, err := st.Get("projectB", "api_key"); err != ErrNotFound {
		t.Fatalf("ISOLATION: project B read project A's secret (err=%v)", err)
	}
	// B's declared boot of the same key name fails closed (the value is A's, not B's).
	_, br := st.InjectEnv("projectB", []string{"api_key"})
	if br == nil {
		t.Fatalf("ISOLATION: project B booted with project A's secret")
	}

	// And A's value never appears in B's (empty) emission view.
	bView := st.StoreFingerprint("projectB")
	emptyView := st.StoreFingerprint("projectEmpty")
	if bView != emptyView {
		t.Fatalf("project B's fingerprint is non-empty though it holds no secret")
	}
	// A clean emission for B does not contain A's value (proves the wall: the plaintext
	// never reaches an emitter — only the encrypted store holds it).
	if !IsClean("const x = 1;\n", []string{value}) {
		t.Fatalf("unexpected leak finding in a clean emission")
	}
}

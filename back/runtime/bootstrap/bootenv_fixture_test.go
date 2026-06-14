package bootstrap_test

// Fixture mirror (N2 state → command → events) for DP32 — BRANCHER S91 sur le
// provisioning : le SECRET STORE PAR PROJET alimente le .env CONCRET au boot.
//
// reflects=runtime.bootstrap (DP32), test_kind=fixture, cert_language=fixture,
// liveness=live. Written FIRST and red (MergeBootEnv / RotateSecret do not exist
// yet → compile fail), then green — the red IS the /goal (CLAUDE.md §6).
//
// DP32 BRANCHE S91 PLEINEMENT dans DP12 : là où DP12 prenait l'ensemble des clés
// de secret PRÉSENTES comme donnée (SecretsState{Present}), DP32 consomme le VRAI
// secretstore.SecretStore (chiffré au repos, scopé project_id) et MERGE le .env
// CONCRET au boot par l'ordre GRAVÉ :
//
//	.env.example (références DP04, ${VAR}/<<from-secret-store>>) →
//	secret store (valeurs S91 Get, scopées project_id) →
//	overrides d'environnement
//
// THE STATE → COMMAND → OUTCOME contract (DP32 done-criteria) :
//
//	A un .env.example + un store qui couvre chaque référence requise →
//	  l'env concret mergé, valeurs S91, ordre gravé respecté
//	B une référence requise SANS valeur (ni store ni override) →
//	  MISSING_SECRET_AT_BOOT (actionable)
//	C la rotation (S91 Rotate) invalide l'ancien secret + décision enregistrée
//	  (append-only) → le boot suivant injecte la NOUVELLE valeur
//	D le source émis (.env.example + émission) ne porte AUCUN secret en clair
//	  (secretstore.ScanEmission déterministe), le .env.example = références only
//	E le secret du projet A n'est JAMAIS visible depuis B (scopeKey isolation)
//
// Le mur : les secrets vivent dans le store chiffré au boot, JAMAIS dans le
// truth-store / git / source émis (below the line). Le scan = code (gitleaks /
// ScanEmission), jamais un LLM. L'ordre de merge = fonction PURE gravée.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
	"github.com/steph-frtech/aidos/back/runtime/envemit"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
)

// dp32Manifest is the representative emitted bundle: a server + a postgres
// datastore + a traefik edge, one bind volume and one declared connector scope
// (so the .env.example carries one APP_SECRET_<SCOPE> reference, plus the global
// PAT reference) — the same nominal shape DP12's fixtures use.
func dp32Manifest() stackmanifest.StackManifest {
	return stackmanifest.StackManifest{
		AppName: "demo",
		Services: []stackmanifest.Service{
			{Name: "server", Role: stackmanifest.RoleServer, InternalPort: 3000, Profile: stackmanifest.ProfileCore},
			{Name: "db", Role: stackmanifest.RoleDatastore, Image: "postgres:17", InternalPort: 5432, Profile: stackmanifest.ProfileCore},
			{Name: "edge", Role: stackmanifest.RoleObservability, Image: "traefik:v3", InternalPort: 80, Profile: stackmanifest.ProfileCore},
		},
		Volumes:         []stackmanifest.Volume{{Name: "data", DeviceVar: "APP_DATA_PATH"}},
		Network:         stackmanifest.Network{Name: "traefik_default", External: true},
		ConnectorScopes: []string{"crm"},
	}
}

// dp32EnvExample renders the DP04 .env.example bytes for the manifest (the
// references the boot merges over). It is the REAL DP04 emission, not a stub —
// DP32 reuses envemit, it does not fork it.
func dp32EnvExample(t *testing.T) []byte {
	t.Helper()
	bundle, br := envemit.Emit(dp32Manifest())
	if br != nil {
		t.Fatalf("DP04 envemit blocked unexpectedly: %s", blockreason.Render(*br))
	}
	return bundle.EnvExample.Bytes
}

// dp32Store builds a project-scoped store seeded with a value for every secret
// reference the .env.example requires (the global PAT + the per-scope key), so
// the nominal boot may proceed. Returns the store and the project id.
func dp32Store(t *testing.T) (*secretstore.SecretStore, string) {
	t.Helper()
	st, err := secretstore.New(secretstore.DeriveKey("dp32-master"))
	if err != nil {
		t.Fatalf("New store: %v", err)
	}
	const proj = "demo"
	// The two secret references the DP04 .env.example carries: the host-global PAT
	// and one APP_SECRET_<SCOPE> per declared connector scope. DP32's MergeBootEnv
	// resolves each reference KEY to its store value under the project scope.
	st.Set(proj, "GITHUB_PERSONAL_ACCESS_TOKEN", "ghp_demoPATvalue0123456789abcdef")
	st.Set(proj, "APP_SECRET_CRM", "crm-bearer-9f8e7d6c5b4a39281706")
	return st, proj
}

// --- Row A: the engraved merge yields the concrete env, references resolved ---

func TestDP32_A_MergeResolvesReferencesInEngravedOrder(t *testing.T) {
	env := dp32EnvExample(t)
	store, proj := dp32Store(t)

	merged, br := bootstrap.MergeBootEnv(env, store, proj, nil)
	if br != nil {
		t.Fatalf("row A: nominal merge blocked unexpectedly: %s", blockreason.Render(*br))
	}
	// every key of the .env.example survives into the concrete env.
	for _, k := range envemit.Keys(env) {
		if _, ok := merged[k]; !ok {
			t.Fatalf("row A: merged env dropped the .env.example key %q", k)
		}
	}
	// the secret references are RESOLVED to their store VALUES (no placeholder left).
	if got := merged["APP_SECRET_CRM"]; got != "crm-bearer-9f8e7d6c5b4a39281706" {
		t.Fatalf("row A: APP_SECRET_CRM = %q, want the S91 store value", got)
	}
	if got := merged["GITHUB_PERSONAL_ACCESS_TOKEN"]; got != "ghp_demoPATvalue0123456789abcdef" {
		t.Fatalf("row A: PAT = %q, want the S91 store value", got)
	}
	// no resolved value is left as a placeholder reference.
	for k, v := range merged {
		if v == envemit.SecretPlaceholder {
			t.Fatalf("row A: key %q still carries the secret placeholder after merge", k)
		}
	}
}

// --- Row A bis: overrides win last (the engraved last layer) ---

func TestDP32_A_OverridesWinLast(t *testing.T) {
	env := dp32EnvExample(t)
	store, proj := dp32Store(t)

	// an environment override for a deploy-time key AND for a secret key — the
	// engraved order is references → store → overrides, so the override wins last.
	overrides := map[string]string{
		"DOMAIN":         "set-by-environment",
		"APP_SECRET_CRM": "rotated-by-environment-override",
	}
	merged, br := bootstrap.MergeBootEnv(env, store, proj, overrides)
	if br != nil {
		t.Fatalf("override merge blocked: %s", blockreason.Render(*br))
	}
	if merged["DOMAIN"] != "set-by-environment" {
		t.Fatalf("override of DOMAIN did not win: %q", merged["DOMAIN"])
	}
	if merged["APP_SECRET_CRM"] != "rotated-by-environment-override" {
		t.Fatalf("override of a secret key must win over the store value: %q", merged["APP_SECRET_CRM"])
	}
}

// --- Row B: a required reference with no value fails closed at boot ---

func TestDP32_B_MissingSecretBlocksBoot(t *testing.T) {
	env := dp32EnvExample(t)
	// a store that holds the PAT but NOT the per-scope secret → the APP_SECRET_CRM
	// reference is required but unresolvable.
	st, err := secretstore.New(secretstore.DeriveKey("dp32-master"))
	if err != nil {
		t.Fatalf("New store: %v", err)
	}
	const proj = "demo"
	st.Set(proj, "GITHUB_PERSONAL_ACCESS_TOKEN", "ghp_only_the_pat_is_present_00")

	merged, br := bootstrap.MergeBootEnv(env, st, proj, nil)
	if br == nil {
		t.Fatal("row B: a required secret reference with no value MUST block, never boot with a blank credential")
	}
	if br.Code != blockreason.CodeMissingSecretAtBoot {
		t.Fatalf("row B: block code = %q, want MISSING_SECRET_AT_BOOT", br.Code)
	}
	if len(br.HowToFix) == 0 {
		t.Fatal("row B: a BlockReason with an empty how_to_fix is a prison (KRD §44.5)")
	}
	if !strings.Contains(br.Explanation, "APP_SECRET_CRM") {
		t.Fatalf("row B: the missing key must be NAMED in the explanation (actionable): %s", br.Explanation)
	}
	if merged != nil {
		t.Fatalf("row B: a blocked boot returns no env, got %d keys", len(merged))
	}
}

// --- Row C: rotation invalidates the old secret + records an append-only decision ---

func TestDP32_C_RotationInvalidatesOldSecretAndRecordsDecision(t *testing.T) {
	env := dp32EnvExample(t)
	store, proj := dp32Store(t)
	const old = "crm-bearer-9f8e7d6c5b4a39281706" // seeded by dp32Store
	const fresh = "crm-bearer-ROTATED-aabbccddeeff00112233"

	// pre-rotation: the boot injects the OLD value.
	pre, br := bootstrap.MergeBootEnv(env, store, proj, nil)
	if br != nil {
		t.Fatalf("pre-rotation merge blocked: %s", blockreason.Render(*br))
	}
	if pre["APP_SECRET_CRM"] != old {
		t.Fatalf("pre-rotation env = %q, want the old value", pre["APP_SECRET_CRM"])
	}

	// WHEN the secret is rotated through the DP32 door (S91 Rotate + recorded decision)
	dec, err := bootstrap.RotateSecret(store, proj, "APP_SECRET_CRM", fresh)
	if err != nil {
		t.Fatalf("RotateSecret: %v", err)
	}
	// the decision is APPEND-ONLY and records the rotation (never the values in clear).
	if dec.ProjectID != proj || dec.Name != "APP_SECRET_CRM" {
		t.Fatalf("rotation decision mis-scoped: %+v", dec)
	}
	if dec.NewFingerprint == dec.OldFingerprint {
		t.Fatalf("rotation decision must record a CHANGED fingerprint (old≠new)")
	}
	if strings.Contains(dec.NewFingerprint, fresh) || strings.Contains(dec.OldFingerprint, old) {
		t.Fatalf("rotation decision leaked a secret VALUE in its fingerprint")
	}

	// THEN the next boot injects the NEW value and the old one is invalidated.
	post, br := bootstrap.MergeBootEnv(env, store, proj, nil)
	if br != nil {
		t.Fatalf("post-rotation merge blocked: %s", blockreason.Render(*br))
	}
	if post["APP_SECRET_CRM"] != fresh {
		t.Fatalf("post-rotation env = %q, want the rotated value", post["APP_SECRET_CRM"])
	}
	if post["APP_SECRET_CRM"] == old {
		t.Fatal("ROTATION VIOLATION: old secret still injected after rotation")
	}
}

// --- Row C bis: rotating an absent secret is refused (you Set what does not exist) ---

func TestDP32_C_RotateAbsentIsRefused(t *testing.T) {
	store, proj := dp32Store(t)
	if _, err := bootstrap.RotateSecret(store, proj, "APP_SECRET_NEVER", "x"); err == nil {
		t.Fatal("rotating an absent secret must be refused")
	}
}

// --- Row D: the emitted source carries ONLY references (zero secret value) ---

func TestDP32_D_EmittedSourceIsReferencesOnly_ScanGreen(t *testing.T) {
	env := dp32EnvExample(t)
	store, proj := dp32Store(t)

	// the actual secret VALUES the store holds — they must NEVER appear in the emission.
	knownValues := []string{
		"ghp_demoPATvalue0123456789abcdef",
		"crm-bearer-9f8e7d6c5b4a39281706",
	}

	// the .env.example carries ONLY references — the deterministic gitleaks-style
	// scan (S91 ScanEmission, code never an LLM) is GREEN over the emission.
	if !secretstore.IsClean(string(env), knownValues) {
		t.Fatalf("DP04 .env.example leaks a secret VALUE: %v", secretstore.ScanEmission(string(env), knownValues))
	}
	// every secret-bearing key in the .env.example is a REFERENCE, never a value.
	for k, v := range parseEnvLines(env) {
		if strings.HasPrefix(k, "APP_SECRET_") || k == "GITHUB_PERSONAL_ACCESS_TOKEN" {
			if v != envemit.SecretPlaceholder {
				t.Fatalf("the .env.example key %q must be a reference (%q), got %q",
					k, envemit.SecretPlaceholder, v)
			}
		}
		// no emitted value is ever one of the store's actual secret values.
		for _, sv := range knownValues {
			if v == sv {
				t.Fatalf("the .env.example key %q carries a raw secret value", k)
			}
		}
	}

	// MergeBootEnv resolves the references in MEMORY only — the concrete env is the
	// appliance-only boot material; it never goes back into the .env.example bytes.
	merged, br := bootstrap.MergeBootEnv(env, store, proj, nil)
	if br != nil {
		t.Fatalf("merge blocked: %s", blockreason.Render(*br))
	}
	// the in-memory concrete env DOES hold the resolved value (that is its purpose),
	// but the EMITTED bytes (env) are untouched and stay references-only.
	if merged["APP_SECRET_CRM"] == envemit.SecretPlaceholder {
		t.Fatal("the concrete boot env must resolve the reference, not keep the placeholder")
	}
	if !secretstore.IsClean(string(env), knownValues) {
		t.Fatal("the merge mutated the emitted .env.example bytes (it must not — references only)")
	}
}

// --- Row E: a secret of A never leaks to B (scopeKey isolation via the store) ---

func TestDP32_E_SecretOfANeverLeaksToB(t *testing.T) {
	env := dp32EnvExample(t)
	st, err := secretstore.New(secretstore.DeriveKey("dp32-master"))
	if err != nil {
		t.Fatalf("New store: %v", err)
	}
	// project A holds the full secret set; project B holds nothing.
	st.Set("alpha", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghp_alpha_only_value_00000000")
	st.Set("alpha", "APP_SECRET_CRM", "alpha-only-crm-secret-112233")

	// A boots fine.
	if _, br := bootstrap.MergeBootEnv(env, st, "alpha", nil); br != nil {
		t.Fatalf("project A could not boot with its own secrets: %s", blockreason.Render(*br))
	}
	// B CANNOT boot off A's secrets — the references are unresolvable under B's scope.
	mergedB, brB := bootstrap.MergeBootEnv(env, st, "beta", nil)
	if brB == nil {
		t.Fatal("ISOLATION VIOLATION: project B booted using project A's secrets")
	}
	if brB.Code != blockreason.CodeMissingSecretAtBoot {
		t.Fatalf("project B's block code = %q, want MISSING_SECRET_AT_BOOT", brB.Code)
	}
	if mergedB != nil {
		t.Fatal("a blocked boot returns no env")
	}
}

// --- Row F: the fully-branched store path replaces DP12's mock at boot ---

func TestDP32_F_BootstrapConsumesTheRealStore(t *testing.T) {
	m := dp32Manifest() // declares the `crm` connector scope → needs APP_SECRET_CRM
	const proj = "demo"

	// a REAL store that holds the required secret under the project scope.
	st, err := secretstore.New(secretstore.DeriveKey("dp32-master"))
	if err != nil {
		t.Fatalf("New store: %v", err)
	}
	st.Set(proj, secretstore.EnvVar("crm"), "crm-bearer-real-store-998877")

	// the present-set is DERIVED from the live store (no mock list passed).
	derived := bootstrap.SecretsStateFromStore(m, st, proj)
	if len(derived.Present) != 1 || derived.Present[0] != secretstore.EnvVar("crm") {
		t.Fatalf("present-set derived from the real store = %v, want [APP_SECRET_CRM]", derived.Present)
	}

	// the fully-branched emitter boots off the real store (clean host).
	seq, br := bootstrap.EmitBootstrapSequenceWithStore(m, cleanHost(), st, proj)
	if br != nil {
		t.Fatalf("row F: bootstrap with the real store blocked: %s", blockreason.Render(*br))
	}
	if len(seq.Events) != len(bootstrap.Kinds()) {
		t.Fatalf("row F: got %d events, want the closed set of %d", len(seq.Events), len(bootstrap.Kinds()))
	}

	// an EMPTY store (the secret absent) fails closed at the secrets-checked rung —
	// the real store replaces the mock AND keeps the MISSING_SECRET_AT_BOOT law.
	empty, _ := secretstore.New(secretstore.DeriveKey("dp32-master"))
	_, brEmpty := bootstrap.EmitBootstrapSequenceWithStore(m, cleanHost(), empty, proj)
	if brEmpty == nil {
		t.Fatal("row F: an empty store must fail closed (the real store replaces the mock, not the law)")
	}
	if brEmpty.Code != blockreason.CodeMissingSecretAtBoot {
		t.Fatalf("row F: empty-store block = %q, want MISSING_SECRET_AT_BOOT", brEmpty.Code)
	}

	// ISOLATION: a store that holds the secret under a DIFFERENT project fails
	// closed for `demo` — the real store enforces the project scope (S91/S55).
	other, _ := secretstore.New(secretstore.DeriveKey("dp32-master"))
	other.Set("not-demo", secretstore.EnvVar("crm"), "another-projects-secret")
	_, brOther := bootstrap.EmitBootstrapSequenceWithStore(m, cleanHost(), other, proj)
	if brOther == nil {
		t.Fatal("row F: a secret held under another project must NOT satisfy demo's boot (isolation)")
	}
}

// --- Row G: the branched path is reproducible (same store-state → same sequence) ---

func TestDP32_G_BranchedBootstrapIsReproducible(t *testing.T) {
	m := dp32Manifest()
	const proj = "demo"
	st, _ := secretstore.New(secretstore.DeriveKey("dp32-master"))
	st.Set(proj, secretstore.EnvVar("crm"), "crm-bearer-repro-112233")

	a, brA := bootstrap.EmitBootstrapSequenceWithStore(m, cleanHost(), st, proj)
	b, brB := bootstrap.EmitBootstrapSequenceWithStore(m, cleanHost(), st, proj)
	if brA != nil || brB != nil {
		t.Fatalf("reproducible branched boot blocked: %v %v", brA, brB)
	}
	if a.Hash() != b.Hash() {
		t.Fatalf("branched bootstrap is non-deterministic: %s vs %s", a.Hash(), b.Hash())
	}
}

// parseEnvLines is a tiny KEY=VALUE parser for the fixture's expectations (the
// production parse is envemit.Keys; this returns the values too).
func parseEnvLines(env []byte) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(string(env), "\n") {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		if eq := strings.IndexByte(t, '='); eq > 0 {
			out[t[:eq]] = t[eq+1:]
		}
	}
	return out
}

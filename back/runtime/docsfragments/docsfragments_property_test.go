package docsfragments_test

// Invariant mirror (rapid property test, ∀ N1) — WRITTEN FIRST (RED→GREEN).
// reflects=dp30-docs-substrate-fragments+emitted-docs-projection ·
// test_kind=property · cert_language=rapid · liveness=live ·
// authority=above-the-line-source(stack_manifest + api_surface S90) projected below.
//
// DP30 (EPIC G) — the THREE docs-substrate fragments (Fumadocs + Scalar + Pagefind)
// of the EMITTED app's PROFILE-DOCS site, PLUS the emitted DOCS PROJECTION (a PURE
// projection of the Kernel + the S90 OpenAPI: the Scalar config consuming the emitted
// OpenAPI, the Fumadocs domain-concept pages, the Pagefind index — DATA, never Go
// runtime code). The docs are a PROJECTION, NEVER a truth. DISTINCT des docs Mintlify
// d'AIDOS (le build journal). The laws:
//
//   L1 byte-identique : ∀ (projectID, env) légaux, SubstrateDocsFragments rend des
//      fragments dont le body canonique (records.Canonicalize) est BYTE-IDENTIQUE à
//      chaque appel — même projectID + même env ⇒ mêmes octets (déterminisme-first).
//   L2 palette close : EXACTEMENT 3 fragments (fumadocs, scalar, pagefind), chacun
//      portant image + port interne + volume bind + healthcheck + profile DOCS +
//      project_id — jamais deviné, le jeu est clos. Tous role=docs, profile=docs.
//   L3 pas de gate env : aucun fragment docs n'est interdit par environnement — seul
//      un environnement HORS-ENSEMBLE échoue (UNKNOWN_ENVIRONMENT).
//   L4 isolation : project A ≠ project B ⇒ chaque fragment porte un project_id distinct
//      ET un nom de volume isolé ; A ne réutilise jamais l'octet de B.
//   L5 token partagé : le token d'isolation est CELUI de DP15 (datafragments.
//      IsolationToken), pas un schéma forké — même seed ⇒ même token sur les couches.
//   L6 LA PROPRIÉTÉ CAPITALE — les docs N'ÉCRIVENT AUCUNE VÉRITÉ : aucun fragment ne
//      porte une capacité d'écriture-vérité (kernel/mirrors/fitness) ; la projection
//      émise est PURE et une PROJECTION (jamais une vérité). WritesTruth() est TOUJOURS
//      false (∀ fragment, ∀ projection).
//   L7 LA PROPRIÉTÉ DOCS CAPITALE — même Kernel ⇒ mêmes docs : ∀ ApiSpec S90, la
//      projection (Scalar + Fumadocs + Pagefind) est BYTE-IDENTIQUE à chaque émission
//      (la ré-émission est stable). C'est une fonction PURE du Kernel + l'OpenAPI.
//   L8 Scalar consomme l'OpenAPI émis : CHAQUE Op (sync) de l'ApiSpec S90 est présent
//      dans la projection Scalar — un endpoint manquant est une régression.
//   L9 Pagefind indexe : chaque page Fumadocs émise est indexée (un terme du domaine →
//      un résultat) ; l'index couvre le set des pages, jamais moins.

import (
	"bytes"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/apisurface"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/docsfragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
	"pgregory.net/rapid"
)

func genProjectID(rt *rapid.T, label string) string {
	return rapid.StringMatching(`[a-z][a-z0-9-]{0,15}`).Draw(rt, label)
}

func genEnv(rt *rapid.T, label string) scope.Environment {
	envs := scope.Environments()
	return envs[rapid.IntRange(0, len(envs)-1).Draw(rt, label)]
}

func canonOf(t *testing.T, f docsfragments.ServiceFragment) []byte {
	t.Helper()
	b, err := docsfragments.CanonicalFragment(f)
	if err != nil {
		t.Fatalf("CanonicalFragment: %v", err)
	}
	return b
}

// customerEntity is a second domain entity (the S90 example set carries only Order()),
// so the generated spec spans more than one entity/page.
func customerEntity() entities.Entity {
	return entities.Entity{
		Name: "Customer",
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeString, Required: true, Identifier: true},
			{Name: "email", Type: entities.TypeString, Required: true},
			{Name: "verified", Type: entities.TypeBool},
		},
	}
}

// genSpec draws a small but realistic S90 ApiSpec (1..4 ops over a couple of entities).
func genSpec(rt *rapid.T, project string) apisurface.ApiSpec {
	n := rapid.IntRange(1, 4).Draw(rt, "nops")
	ents := []entities.Entity{entities.Order(), customerEntity()}
	verbs := []apisurface.Verb{apisurface.VerbPost, apisurface.VerbGet}
	ops := make([]apisurface.Op, 0, n)
	seen := map[string]bool{}
	for i := 0; i < n; i++ {
		name := rapid.StringMatching(`[a-z][a-zA-Z0-9]{2,12}`).Draw(rt, "opname")
		if seen[name] {
			continue
		}
		seen[name] = true
		ops = append(ops, apisurface.Op{
			Name:      name,
			Entity:    ents[rapid.IntRange(0, len(ents)-1).Draw(rt, "ent")],
			Verb:      verbs[rapid.IntRange(0, len(verbs)-1).Draw(rt, "verb")],
			Authorize: rapid.Bool().Draw(rt, "authz"),
			Async:     rapid.Bool().Draw(rt, "async"),
		})
	}
	if len(ops) == 0 {
		ops = append(ops, apisurface.Op{Name: "createOrder", Entity: entities.Order(), Verb: apisurface.VerbPost})
	}
	return apisurface.ApiSpec{Project: project, Ops: ops}
}

// TestL1ByteIdentique — same (projectID, env) ⇒ byte-identical fragments, ×100.
func TestL1ByteIdentique(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")

		a, errA := docsfragments.SubstrateDocsFragments(pid, env)
		b, errB := docsfragments.SubstrateDocsFragments(pid, env)
		if errA != nil || errB != nil {
			t.Fatalf("legal (%q,%q) must not error: %v / %v", pid, env, errA, errB)
		}
		if len(a) != len(b) {
			t.Fatalf("non-deterministic fragment count: %d vs %d", len(a), len(b))
		}
		for i := range a {
			if !bytes.Equal(canonOf(t, a[i]), canonOf(t, b[i])) {
				t.Fatalf("fragment %d not byte-identical across calls", i)
			}
		}
	})
}

// TestL2PaletteClose — exactly 3 fragments (fumadocs, scalar, pagefind), each role=docs,
// profile=docs, with image + internal port + bind volume + healthcheck + project_id.
func TestL2PaletteClose(t *testing.T) {
	frags, err := docsfragments.SubstrateDocsFragments("shop", scope.EnvProd)
	if err != nil {
		t.Fatalf("fragments: %v", err)
	}
	if len(frags) != 3 {
		t.Fatalf("want 3 docs fragments, got %d", len(frags))
	}
	wantKeys := map[string]bool{"fumadocs": false, "scalar": false, "pagefind": false}
	for _, f := range frags {
		if _, ok := wantKeys[f.Key]; !ok {
			t.Fatalf("unexpected fragment key %q (palette is closed)", f.Key)
		}
		wantKeys[f.Key] = true
		if f.Service.Role != stackmanifest.RoleDocs {
			t.Fatalf("fragment %q role: want docs, got %q", f.Key, f.Service.Role)
		}
		if f.Service.Profile != stackmanifest.ProfileDocs {
			t.Fatalf("fragment %q profile: want docs, got %q", f.Key, f.Service.Profile)
		}
		if f.Service.InternalPort == 0 {
			t.Fatalf("fragment %q must pin an internal port", f.Key)
		}
		if f.Service.Healthcheck == "" {
			t.Fatalf("fragment %q must pin a healthcheck", f.Key)
		}
		if f.ProjectID != "shop" {
			t.Fatalf("fragment %q project: want shop, got %q", f.Key, f.ProjectID)
		}
		if len(f.Volumes) == 0 {
			t.Fatalf("fragment %q must carry a per-project bind volume", f.Key)
		}
	}
	for k, seen := range wantKeys {
		if !seen {
			t.Fatalf("missing docs fragment %q", k)
		}
	}
	if got := docsfragments.Keys(); len(got) != 3 {
		t.Fatalf("Keys() must list the closed palette of 3, got %v", got)
	}
}

// TestL3NoEnvGate — no docs fragment is env-gated; only an UNKNOWN env fails.
func TestL3NoEnvGate(t *testing.T) {
	for _, env := range scope.Environments() {
		if _, err := docsfragments.SubstrateDocsFragments("shop", env); err != nil {
			t.Fatalf("docs fragments must be legal in every known env %q, got %v", env, err)
		}
	}
	_, err := docsfragments.SubstrateDocsFragments("shop", scope.Environment("mars"))
	if err == nil {
		t.Fatalf("an unknown environment must be refused")
	}
	var ref *envbindings.Refusal
	if !envbindings.AsRefusal(err, &ref) || ref.Code != envbindings.CodeUnknownEnvironment {
		t.Fatalf("unknown environment must carry %s, got %v", envbindings.CodeUnknownEnvironment, err)
	}
}

// TestL4Isolation — project A ≠ project B ⇒ distinct project_id + distinct volume names.
func TestL4Isolation(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		a := genProjectID(rt, "a")
		b := genProjectID(rt, "b")
		if a == b {
			return
		}
		fa, err := docsfragments.SubstrateDocsFragments(a, scope.EnvProd)
		if err != nil {
			t.Fatalf("frags A: %v", err)
		}
		fb, err := docsfragments.SubstrateDocsFragments(b, scope.EnvProd)
		if err != nil {
			t.Fatalf("frags B: %v", err)
		}
		volA := map[string]bool{}
		for _, f := range fa {
			if f.ProjectID != a {
				t.Fatalf("fragment %q must be isolated to project %q, got %q", f.Key, a, f.ProjectID)
			}
			for _, v := range f.Volumes {
				volA[v.Name] = true
			}
		}
		for _, f := range fb {
			if f.ProjectID != b {
				t.Fatalf("fragment %q must be isolated to project %q, got %q", f.Key, b, f.ProjectID)
			}
			for _, v := range f.Volumes {
				if volA[v.Name] {
					t.Fatalf("volume %q bleeds across projects A↔B (isolation broken)", v.Name)
				}
			}
		}
	})
}

// TestL5SharedToken — the isolation token IS DP15's (datafragments.IsolationToken).
func TestL5SharedToken(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		token := datafragments.IsolationToken(pid)
		frags, err := docsfragments.SubstrateDocsFragments(pid, scope.EnvProd)
		if err != nil {
			t.Fatalf("frags: %v", err)
		}
		for _, f := range frags {
			found := false
			for _, v := range f.Volumes {
				if strings.HasSuffix(v.Name, token) {
					found = true
				}
			}
			if !found {
				t.Fatalf("fragment %q volume must carry the DP15 token %q, got %+v", f.Key, token, f.Volumes)
			}
		}
	})
}

// TestL6WritesNoTruth — CAPITAL: no docs fragment writes any truth.
func TestL6WritesNoTruth(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")
		frags, err := docsfragments.SubstrateDocsFragments(pid, env)
		if err != nil {
			return // unknown env handled by L3
		}
		for _, f := range frags {
			if f.WritesTruth() {
				t.Fatalf("fragment %q must write NO truth (the wall §2)", f.Key)
			}
			for _, c := range f.Capabilities() {
				if docsfragments.IsTruthWriteCapability(c) {
					t.Fatalf("fragment %q carries truth-write capability %q (forbidden)", f.Key, c)
				}
			}
		}
	})
}

// TestL7SameKernelSameDocs — CAPITAL: same Kernel ⇒ byte-identical docs projection.
func TestL7SameKernelSameDocs(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		spec := genSpec(rt, pid)

		a, errA := docsfragments.EmittedDocs(spec)
		b, errB := docsfragments.EmittedDocs(spec)
		if errA != nil || errB != nil {
			t.Fatalf("EmittedDocs must not error on a valid spec: %v / %v", errA, errB)
		}
		ca, err := docsfragments.CanonicalDocs(a)
		if err != nil {
			t.Fatalf("CanonicalDocs a: %v", err)
		}
		cb, err := docsfragments.CanonicalDocs(b)
		if err != nil {
			t.Fatalf("CanonicalDocs b: %v", err)
		}
		if !bytes.Equal(ca, cb) {
			t.Fatalf("docs projection not byte-identical across emissions (non-deterministic)")
		}
		if a.DocsID != b.DocsID {
			t.Fatalf("DocsID not stable: %q vs %q", a.DocsID, b.DocsID)
		}
		if a.WritesTruth() {
			t.Fatalf("the docs projection must write NO truth (a projection, never a verity)")
		}
		if a.WroteKernel {
			t.Fatalf("the docs projection must never set WroteKernel")
		}
	})
}

// TestL8ScalarConsumesEveryEndpoint — CAPITAL: every SYNC Op of the S90 ApiSpec is present
// in the Scalar projection (a missing endpoint is a regression).
func TestL8ScalarConsumesEveryEndpoint(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		spec := genSpec(rt, pid)
		docs, err := docsfragments.EmittedDocs(spec)
		if err != nil {
			t.Fatalf("EmittedDocs: %v", err)
		}
		// Build the expected set of sync operationIds from the spec.
		want := map[string]bool{}
		for _, op := range spec.Ops {
			if !op.Async {
				want[op.Name] = true
			}
		}
		got := map[string]bool{}
		for _, e := range docs.Scalar.Endpoints {
			got[e.OperationID] = true
		}
		for name := range want {
			if !got[name] {
				t.Fatalf("Scalar projection missing endpoint %q (must consume EVERY S90 sync op)", name)
			}
		}
		// And no invented endpoint: every Scalar endpoint maps a real sync op.
		for name := range got {
			if !want[name] {
				t.Fatalf("Scalar projection invented endpoint %q (honesty: render only what the source pins)", name)
			}
		}
		// The Scalar config references the emitted OpenAPI artifact path (it CONSUMES it).
		if docs.Scalar.OpenAPIPath == "" {
			t.Fatalf("Scalar must reference the emitted OpenAPI document path")
		}
	})
}

// TestL9PagefindIndexesEveryPage — every Fumadocs page is indexed; index never undercounts.
func TestL9PagefindIndexesEveryPage(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		spec := genSpec(rt, pid)
		docs, err := docsfragments.EmittedDocs(spec)
		if err != nil {
			t.Fatalf("EmittedDocs: %v", err)
		}
		if len(docs.Fumadocs.Pages) == 0 {
			t.Fatalf("Fumadocs must render ≥1 domain-concept page")
		}
		indexed := map[string]bool{}
		for _, rec := range docs.Pagefind.Records {
			indexed[rec.PagePath] = true
		}
		for _, p := range docs.Fumadocs.Pages {
			if !indexed[p.Path] {
				t.Fatalf("Pagefind must index Fumadocs page %q (an unindexed page is a search hole)", p.Path)
			}
		}
		if len(docs.Pagefind.Records) != len(docs.Fumadocs.Pages) {
			t.Fatalf("Pagefind index count %d ≠ Fumadocs page count %d", len(docs.Pagefind.Records), len(docs.Fumadocs.Pages))
		}
	})
}

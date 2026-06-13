package docsfragments_test

// docsfragments_fixture_test.go — the ACCEPTANCE (Godog-class, state→command→events)
// mirror for DP30 (ROADMAP-provisioning-deploy EPIC G, palette DP14 docs row). It proves
// the headline done-criteria as deterministic Given/When/Then fixtures (the CLAUDE.md §6
// bootstrap exception: the mirrors Postgres schema persists this later; the test IS the
// red→green proof now). DETERMINISTIC: no clock, no RNG.
//
//	Given un projet émis « shop » dont le Kernel épingle des operations (S90 ApiSpec)
//	When  on émet les fragments docs ET la projection docs (Scalar/Fumadocs/Pagefind)
//	Then  trois services (Fumadocs + Scalar + Pagefind, profile docs) sont émis ;
//	      Scalar consomme l'OpenAPI émis (chaque endpoint S90 présent) ;
//	      Fumadocs rend les concepts du domaine du user ;
//	      Pagefind indexe et TROUVE (un terme du domaine → un résultat) ;
//	      le thème ccup (ADR 0010) est hérité, l'i18n est bilingue FR par défaut (ADR 0011) ;
//	      ET — propriété capitale — les docs sont une PROJECTION, jamais une vérité
//	      (WritesTruth()=false partout). Les docs par app ≠ les docs Mintlify d'AIDOS.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/apisurface"
	"github.com/steph-frtech/aidos/back/runtime/docsfragments"
)

// shopSpec is the anchored S90 ApiSpec the docs projection consumes: createOrder (POST,
// authorize), listOrders (GET), and an async op (no sync route, excluded from the surface).
func shopSpec() apisurface.ApiSpec {
	return apisurface.ApiSpec{
		Project: "shop",
		Ops: []apisurface.Op{
			{Name: "createOrder", Entity: entities.Order(), Verb: apisurface.VerbPost, Authorize: true},
			{Name: "listOrders", Entity: entities.Order(), Verb: apisurface.VerbGet},
			{Name: "archiveOrder", Entity: entities.Order(), Verb: apisurface.VerbPost, Async: true},
		},
	}
}

// Given a project / When emitting / Then the three docs services exist with the measured
// contracts, profile docs.
func TestFixture_AppEmitsDocsSubstrate(t *testing.T) {
	const app = "shop"
	frags, err := docsfragments.SubstrateDocsFragments(app, scope.EnvProd)
	if err != nil {
		t.Fatalf("prod docs fragments: %v", err)
	}
	if len(frags) != 3 {
		t.Fatalf("want 3 docs fragments, got %d", len(frags))
	}
	byKey := map[string]docsfragments.ServiceFragment{}
	for _, f := range frags {
		byKey[f.Key] = f
	}

	fuma, ok := byKey["fumadocs"]
	if !ok {
		t.Fatalf("missing fumadocs fragment")
	}
	if fuma.Service.Role != stackmanifest.RoleDocs {
		t.Fatalf("fumadocs role: want docs, got %q", fuma.Service.Role)
	}
	if len(fuma.Volumes) == 0 {
		t.Fatalf("fumadocs must carry a per-project bind volume (the built doc site)")
	}

	scalar, ok := byKey["scalar"]
	if !ok {
		t.Fatalf("missing scalar fragment")
	}
	if scalar.Service.Profile != stackmanifest.ProfileDocs {
		t.Fatalf("scalar profile: want docs, got %q", scalar.Service.Profile)
	}

	pf, ok := byKey["pagefind"]
	if !ok {
		t.Fatalf("missing pagefind fragment")
	}
	// Pagefind is a static search index — distinct internal port from the others.
	if pf.Service.InternalPort == fuma.Service.InternalPort || pf.Service.InternalPort == scalar.Service.InternalPort {
		t.Fatalf("pagefind must not collide on internal port (%d)", pf.Service.InternalPort)
	}
}

// Given the project's S90 operations / When projecting the docs / Then Scalar consumes the
// emitted OpenAPI — EVERY sync endpoint present, the async one excluded.
func TestFixture_ScalarRendersEverySyncEndpoint(t *testing.T) {
	docs, err := docsfragments.EmittedDocs(shopSpec())
	if err != nil {
		t.Fatalf("EmittedDocs: %v", err)
	}
	got := map[string]docsfragments.ScalarEndpoint{}
	for _, e := range docs.Scalar.Endpoints {
		got[e.OperationID] = e
	}
	// createOrder + listOrders present (sync); archiveOrder excluded (async).
	if _, ok := got["createOrder"]; !ok {
		t.Fatalf("Scalar must render createOrder (a sync POST endpoint)")
	}
	if _, ok := got["listOrders"]; !ok {
		t.Fatalf("Scalar must render listOrders (a sync GET endpoint)")
	}
	if _, ok := got["archiveOrder"]; ok {
		t.Fatalf("Scalar must NOT render the async op archiveOrder (no synchronous route)")
	}
	// The endpoint carries the REST path + verb the S90 emitter pins (it CONSUMES the spec).
	create := got["createOrder"]
	if create.Method != "POST" {
		t.Fatalf("createOrder verb: want POST, got %q", create.Method)
	}
	if create.Path != "/orders" {
		t.Fatalf("createOrder path: want /orders (the S90 PathOf), got %q", create.Path)
	}
	// The Scalar config references the emitted OpenAPI artifact (the S90 byte-stable doc).
	if !strings.HasSuffix(docs.Scalar.OpenAPIPath, "openapi.json") {
		t.Fatalf("Scalar must consume the emitted OpenAPI document, got path %q", docs.Scalar.OpenAPIPath)
	}
	// And the source hash equals the S90 SourceHash — the projection is keyed on the SAME Kernel cut.
	wantHash, err := apisurface.SourceHash(shopSpec())
	if err != nil {
		t.Fatalf("apisurface.SourceHash: %v", err)
	}
	if docs.SourceHash != wantHash {
		t.Fatalf("docs SourceHash must equal the S90 spec hash: got %q want %q", docs.SourceHash, wantHash)
	}
}

// Given the project's domain / When projecting the docs / Then Fumadocs renders a concept
// page per domain entity, themed ccup (ADR 0010) + bilingual FR-default (ADR 0011).
func TestFixture_FumadocsRendersDomainConcepts(t *testing.T) {
	docs, err := docsfragments.EmittedDocs(shopSpec())
	if err != nil {
		t.Fatalf("EmittedDocs: %v", err)
	}
	if len(docs.Fumadocs.Pages) == 0 {
		t.Fatalf("Fumadocs must render the domain's concept pages")
	}
	// The Order entity has a concept page.
	hasOrder := false
	for _, p := range docs.Fumadocs.Pages {
		if strings.Contains(strings.ToLower(p.Path), "order") {
			hasOrder = true
		}
	}
	if !hasOrder {
		t.Fatalf("Fumadocs must render the Order concept page (the domain of the user)")
	}
	// Theme ccup inherited (ADR 0010) — a class hook, never a hardcoded hex.
	if docs.Theme != docsfragments.ThemeCcup {
		t.Fatalf("docs must inherit the ccup theme (ADR 0010), got %q", docs.Theme)
	}
	// i18n bilingue, FR par défaut (ADR 0011).
	if docs.DefaultLocale != "fr" {
		t.Fatalf("docs default locale must be fr (ADR 0011), got %q", docs.DefaultLocale)
	}
	foundFr, foundEn := false, false
	for _, l := range docs.Locales {
		if l == "fr" {
			foundFr = true
		}
		if l == "en" {
			foundEn = true
		}
	}
	if !foundFr || !foundEn {
		t.Fatalf("docs must be bilingual fr+en (ADR 0011), got %v", docs.Locales)
	}
}

// Given the indexed docs / When searching a domain term / Then Pagefind FINDS a result.
func TestFixture_PagefindIndexesAndFinds(t *testing.T) {
	docs, err := docsfragments.EmittedDocs(shopSpec())
	if err != nil {
		t.Fatalf("EmittedDocs: %v", err)
	}
	// A domain term ("order") returns ≥1 result.
	hits := docsfragments.SearchIndex(docs.Pagefind, "order")
	if len(hits) == 0 {
		t.Fatalf("Pagefind must FIND the domain term 'order' (the index is live)")
	}
	// An off-domain term returns nothing (the index is honest, not a catch-all).
	if miss := docsfragments.SearchIndex(docs.Pagefind, "zzzznotaword"); len(miss) != 0 {
		t.Fatalf("Pagefind must NOT fabricate a hit for an off-domain term, got %v", miss)
	}
}

// THE CAPITAL FIXTURE — end-to-end, the docs are a PROJECTION, never a truth. Neither a
// fragment nor the projection carries a write-truth capability; the docs by app are
// DISTINCT from the AIDOS Mintlify build journal (a different artifact entirely).
func TestFixture_DocsAreAProjectionNeverATruth(t *testing.T) {
	const app = "shop"
	frags, err := docsfragments.SubstrateDocsFragments(app, scope.EnvProd)
	if err != nil {
		t.Fatalf("fragments: %v", err)
	}
	for _, f := range frags {
		if f.WritesTruth() {
			t.Fatalf("fragment %q must write NO truth (the wall §2 — docs are a projection)", f.Key)
		}
		for _, c := range f.Capabilities() {
			if docsfragments.IsTruthWriteCapability(c) {
				t.Fatalf("fragment %q carries truth-write capability %q (forbidden)", f.Key, c)
			}
		}
	}
	docs, err := docsfragments.EmittedDocs(shopSpec())
	if err != nil {
		t.Fatalf("EmittedDocs: %v", err)
	}
	if docs.WritesTruth() {
		t.Fatalf("the emitted docs projection must write NO truth (a projection, never a verity)")
	}
	if !docs.IsProjection {
		t.Fatalf("the emitted docs must declare themselves a projection (never a truth)")
	}
	// A truth-write capability is correctly DETECTED when present (the predicate is not
	// vacuously false) — fault-injection of the oracle itself.
	if !docsfragments.IsTruthWriteCapability("write:kernel") {
		t.Fatalf("IsTruthWriteCapability must catch write:kernel (else the wall guard is dead)")
	}
	if docsfragments.IsTruthWriteCapability("docs:render-concept") {
		t.Fatalf("IsTruthWriteCapability must NOT flag a read-only docs capability")
	}
}

// A malformed spec is a typed refusal at the boundary (never a panic, never invented docs).
func TestFixture_MalformedSpecRefused(t *testing.T) {
	_, err := docsfragments.EmittedDocs(apisurface.ApiSpec{Project: "", Ops: nil})
	if err == nil {
		t.Fatalf("an empty spec must be refused (no project, no ops)")
	}
}

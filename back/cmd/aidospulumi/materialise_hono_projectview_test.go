package main

// materialise_hono_projectview_test.go — LE MIROIR du défaut corrigé (la dernière marche) : la vue web
// ET les routes serveur projettent les ENTITÉS DU PROJET, plus la démo gold codée en dur.
//
// Intention (utilisatrice, 2026-06-15) : « la vue web déployée par projet HARDCODAIT Order/checkout (la
// démo gold) alors que la couche donnée suivait les --entities du projet — mismatch : une app de
// 'Page' listait 'Order' → /entities/order = 500. La vue web et les routes serveur DOIVENT projeter les
// entités du projet. » Ce miroir épingle la projection corrigée : un projet [Page{id,title}] → la vue
// liste Page (pas Order), aucun bouton checkout ; le serveur a la route /entities/page ; le tag
// content-adressé BOUGE avec les entités ; ents vide → le fallback gold documenté (rétro-compat).
//
// DÉTERMINISME-FIRST / LE MUR (§2/§6/§8/§9). Les fonctions sous test (entitySourceToEntity, projectWebSpec,
// projectServerSpec, projectServerImageTag) sont PURES, byte-stables, sans horloge ni RNG ni disque ; elles
// n'écrivent AUCUNE vérité (projection below-the-line). Aucune ré-émission : on réutilise EmitWebApp /
// EmitServerScaffold verbatim.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// pageEntitySource is the project's OWN entity (the "Page" cut that surfaced the bug — a CMS-shaped app
// whose data is Page, not Order). Its fields exercise the type translation: text→string, int→int.
func pageEntitySource() generators.EntitySource {
	return generators.EntitySource{
		Kind: generators.KindEntity,
		Name: "Page",
		Fields: []generators.Field{
			{Name: "id", Type: "int"},
			{Name: "title", Type: "text"},
			{Name: "body", Type: "text"},
		},
	}
}

// TestEntitySourceToEntity_ByteCoherentWithAttributeSet — the PURE converter maps a schema source (the
// --entities catalogue vocabulary: text/numeric/int/bool/timestamptz) to the kernel entity AST, byte-
// coherent with AttributeSet (the columns the list view lists, IN SOURCE ORDER) and translating the type
// tokens of the closed set (text→string, numeric→decimal, int/bool/timestamptz pass-through).
func TestEntitySourceToEntity_ByteCoherentWithAttributeSet(t *testing.T) {
	es := generators.EntitySource{
		Kind: generators.KindEntity,
		Name: "Page",
		Fields: []generators.Field{
			{Name: "id", Type: "int"},
			{Name: "title", Type: "text"},
			{Name: "price", Type: "numeric"},
			{Name: "published", Type: "bool"},
			{Name: "placed_at", Type: "timestamptz"},
		},
	}
	got := entitySourceToEntity(es)

	if got.Name != "Page" {
		t.Fatalf("converted entity name = %q, want Page", got.Name)
	}
	// The column NAMES carry over verbatim IN SOURCE ORDER — byte-coherent with what the list view lists.
	wantCols := []string{"id", "title", "price", "published", "placed_at"}
	gotCols := entities.AttributeSet(got)
	if strings.Join(gotCols, ",") != strings.Join(wantCols, ",") {
		t.Fatalf("AttributeSet = %v, want %v (names verbatim, source order)", gotCols, wantCols)
	}
	// The type tokens are translated through the closed-set inverse map (text→string, numeric→decimal).
	wantTypes := []entities.ScalarType{
		entities.TypeInt, entities.TypeString, entities.TypeDecimal, entities.TypeBool, entities.TypeTimestamptz,
	}
	for i, a := range got.Attributes {
		if a.Type != wantTypes[i] {
			t.Fatalf("attr %q type = %q, want %q (closed-set token map)", a.Name, a.Type, wantTypes[i])
		}
	}
	// The converted entity is PROJECTABLE (entities.Validate green) — the web/server emitters accept it.
	if err := entities.Validate(got); err != nil {
		t.Fatalf("converted Page entity is not projectable: %v", err)
	}
}

// TestProjectWebSpec_ListsProjectEntities_NotDemo — THE FIX (web side). projectWebSpec(project, ents) with
// the project's entities lists THOSE entities (Page), carries NO demo button (the checkout button is gone),
// and the emitted React view materialises PageList.tsx — never OrderList.tsx / CheckoutButton.tsx.
func TestProjectWebSpec_ListsProjectEntities_NotDemo(t *testing.T) {
	ents := []entities.Entity{entitySourceToEntity(pageEntitySource())}
	web := projectWebSpec("cms", ents)

	if len(web.Entities) != 1 || web.Entities[0].Name != "Page" {
		t.Fatalf("web spec entities = %v, want exactly [Page]", web.Entities)
	}
	// A generic project declares no operations/controls yet → NO demo button (read-only view, no headless
	// checkout on data that has no checkout op).
	if web.Buttons != nil {
		t.Fatalf("web spec carries %d button(s); a generic project must list read-only (no demo checkout)", len(web.Buttons))
	}

	// The EMITTED view (EmitWebApp reused verbatim) materialises the Page list, NOT Order/checkout.
	arts, br := honoemit.EmitWebApp(web)
	if br != nil {
		t.Fatalf("EmitWebApp(cms): %s", br.Explanation)
	}
	paths := artifactPaths(arts)
	if !hasSuffix(paths, "PageList.tsx") {
		t.Fatalf("emitted view does not list Page (no PageList.tsx): %v", paths)
	}
	if hasSuffix(paths, "OrderList.tsx") {
		t.Fatalf("emitted view STILL lists Order (the gold demo leaked into a Page app): %v", paths)
	}
	if hasSuffix(paths, "CheckoutButton.tsx") {
		t.Fatalf("emitted view STILL carries the checkout button on a Page app: %v", paths)
	}
}

// TestProjectServerSpec_ReadsProjectEntities — THE FIX (server side). projectServerSpec(project, ents)
// routes the READ verb GET /entities/page (the project's entity), NOT /entities/order — so the sidecar
// queries the table that EXISTS (the 500 the user reported was THIS read mismatch). The server reads what
// the view lists (one source). The WRITE op cut stays the createOrder anchor (the Hono server emitter
// refuses a spec with zero ops — ErrNoOps — until the kernel.operation projection lands); that POST route
// is unused by the read-only Page view (no button is bound to it), so it is never a wrong button on screen.
func TestProjectServerSpec_ReadsProjectEntities(t *testing.T) {
	ents := []entities.Entity{entitySourceToEntity(pageEntitySource())}
	server := projectServerSpec("cms", ents)

	if len(server.Entities) != 1 || server.Entities[0] != "page" {
		t.Fatalf("server spec entities = %v, want [page] (lowercased project entity)", server.Entities)
	}

	scaffold, br := honoemit.EmitServerScaffold(server)
	if br != nil {
		t.Fatalf("EmitServerScaffold(cms): %s", br.Explanation)
	}
	serverTS := readArtifact(scaffold, "server.ts")
	// THE FIX: the READ route follows the project entity — never /entities/order on a Page app.
	if !strings.Contains(serverTS, `app.get("/entities/page"`) {
		t.Fatalf("server.ts does not read the project entity (/entities/page):\n%s", serverTS)
	}
	if strings.Contains(serverTS, `app.get("/entities/order"`) {
		t.Fatalf("server.ts STILL reads /entities/order on a Page app (the gold demo READ leaked):\n%s", serverTS)
	}
}

// TestProjectServerImageTag_MovesWithEntities — the CONTENT ADDRESS tracks the project's view. The tag for
// a Page-cut app differs from the gold Order-cut tag (so Pulumi recreates the container with the project's
// own view), AND the same entity cut yields the SAME tag (reproducibility). Never the mutable :latest.
func TestProjectServerImageTag_MovesWithEntities(t *testing.T) {
	pageEnts := []entities.Entity{entitySourceToEntity(pageEntitySource())}

	goldTag := projectServerImageTag("cms", nil, nil)
	pageTag := projectServerImageTag("cms", pageEnts, nil)

	if pageTag == goldTag {
		t.Fatalf("the Page-cut tag equals the gold Order-cut tag (%q) — the tag does NOT follow the project entities", pageTag)
	}
	// Reproducible: same entity cut → same tag.
	if again := projectServerImageTag("cms", pageEnts, nil); again != pageTag {
		t.Fatalf("projectServerImageTag is not deterministic for the same cut: %q vs %q", pageTag, again)
	}
	// Content-addressed, never the mutable :latest.
	if strings.HasSuffix(pageTag, ":latest") {
		t.Fatalf("the Page-cut tag is still :latest (mutable): %q", pageTag)
	}
	if !strings.HasPrefix(pageTag, "cms-hono:") {
		t.Fatalf("the Page-cut tag is not <project>-hono:<hash>: %q", pageTag)
	}
}

// TestProjectWebSpec_EmptyEntities_GoldFallback — the documented FALLBACK (rétro-compat): ents EMPTY →
// the gold/zero-entities cut is restored (Order + the checkout button), byte-identical to the proven gold
// form so every existing mirror (imagetag/found/materialise) stays green. The LEAST-surprising fallback:
// an empty WebAppSpec would be REFUSED by EmitWebApp (validateWebApp: no entity ∧ no button), and the gold
// form is what every prior mirror pins.
func TestProjectWebSpec_EmptyEntities_GoldFallback(t *testing.T) {
	web := projectWebSpec("shop", nil)

	if len(web.Entities) != 1 || web.Entities[0].Name != "Order" {
		t.Fatalf("empty-entities fallback web entities = %v, want the gold [Order]", web.Entities)
	}
	if len(web.Buttons) != 1 {
		t.Fatalf("empty-entities fallback carries %d button(s), want the 1 gold checkout button", len(web.Buttons))
	}
	// The fallback view is projectable (it is the proven gold cut — EmitWebApp accepts it).
	if _, br := honoemit.EmitWebApp(web); br != nil {
		t.Fatalf("gold fallback view refused by EmitWebApp: %s", br.Explanation)
	}
	// The server fallback reads the gold Order entity (GET /entities/order) and keeps the createOrder op
	// (the emitter requires ≥1 op) — view ≡ server on the gold path.
	server := projectServerSpec("shop", nil)
	if len(server.Ops) != 1 {
		t.Fatalf("gold server carries %d op(s), want the 1 createOrder op (the emitter requires ≥1)", len(server.Ops))
	}
	if len(server.Entities) != 1 || server.Entities[0] != "order" {
		t.Fatalf("empty-entities server fallback entities = %v, want [order]", server.Entities)
	}
}

// artifactPaths / hasSuffix / readArtifact — tiny pure helpers over the emitted artifacts.
func artifactPaths(arts []honoemit.Artifact) []string {
	out := make([]string, 0, len(arts))
	for _, a := range arts {
		out = append(out, a.Path)
	}
	return out
}

func hasSuffix(paths []string, base string) bool {
	for _, p := range paths {
		if strings.HasSuffix(p, "/"+base) || p == base {
			return true
		}
	}
	return false
}

func readArtifact(arts []honoemit.Artifact, base string) string {
	for _, a := range arts {
		if strings.HasSuffix(a.Path, "/"+base) || a.Path == base {
			return string(a.Bytes)
		}
	}
	return ""
}

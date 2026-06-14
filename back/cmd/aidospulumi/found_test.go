package main

// found_test.go — le MIROIR de `aidospulumi found` (l'artefact → recompilation BYTE-IDENTIQUE).
//
// Intention (utilisatrice, 2026-06-14) : « on peut faire un EXPORT de tout le projet et le REFONDER
// avec une sorte de COMPILATEUR ». L'export rassemble l'ARBRE (le génome) ; le FOUND recompile TOUT
// le code depuis cet arbre — schéma + serveur Hono + vue MAÎTRE + 3 enfants (web/mobile/desktop) +
// programme Pulumi — en RÉUTILISANT les émetteurs existants, sans rien re-dériver.
//
// LA PROPRIÉTÉ CAPITALE (le théorème du compilateur). found(export(P)) produit une émission
// BYTE-IDENTIQUE à l'émission DIRECTE de P : recompiler depuis le génome == émettre depuis les
// sources, byte pour byte, pour chacune des six familles d'artefacts. C'est la preuve que le génome
// est une SOURCE complète et fidèle — le code est sa projection régénérable.
//
// DÉTERMINISME-FIRST / le mur (§2/§6/§8). FoundProject est une FONCTION PURE, byte-stable : même
// artefact → même gen/ ; aucune horloge, aucun RNG, aucun ordre d'entrée qui fuit. Aucune écriture de
// vérité (l'artefact EST l'arbre ; le gen/ est sa projection below-the-line). Anti-overwrite §9 :
// found ré-applique les adaptations capitalisées via ReproduceWithCapitalised — il ne re-dérive RIEN.

import (
	"bytes"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/appdata"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// TestFoundProject_ByteIdenticalToDirectEmission — LE THÉORÈME DU COMPILATEUR. found(export(shop))
// recompile une émission BYTE-IDENTIQUE à l'émission DIRECTE de shop : pour CHAQUE artefact (schéma,
// serveur, maître, 3 enfants, programme Pulumi), les octets recompilés depuis le génome == les octets
// émis depuis les sources. Le génome est donc une source complète et fidèle ; le code est sa projection.
func TestFoundProject_ByteIdenticalToDirectEmission(t *testing.T) {
	const project = "shop"

	// (a) L'émission DIRECTE de P — exactement ce qu'un matérialiseur produit depuis les sources.
	want := directEmission(t, project)

	// (b) FOUND depuis l'artefact exporté : exporter l'arbre puis le recompiler.
	tree := ExportProject(project)
	got, err := FoundProject(tree, t.TempDir())
	if err != nil {
		t.Fatalf("FoundProject: %v", err)
	}

	gotFiles := foundFilesByPath(got)
	if len(gotFiles) != len(want) {
		t.Fatalf("found emitted %d files, direct emission has %d:\n found=%v\n want=%v",
			len(gotFiles), len(want), keys(gotFiles), keys(want))
	}
	for path, wantBytes := range want {
		gotBytes, ok := gotFiles[path]
		if !ok {
			t.Fatalf("found is missing artefact %q (direct emission has it)", path)
		}
		if !bytes.Equal(gotBytes, wantBytes) {
			t.Fatalf("artefact %q differs byte-for-byte:\n found=%q\n want=%q", path, gotBytes, wantBytes)
		}
	}
}

// TestFoundProject_Deterministic — FoundProject est PUR : deux recompilations du MÊME artefact, dans
// deux dirs distincts, rendent un gen/ byte-identique. C'est la reproductibilité (§6) : la projection
// ne dépend que de l'artefact, jamais d'une horloge ni d'un RNG ni du chemin de sortie.
func TestFoundProject_Deterministic(t *testing.T) {
	tree := ExportProject("shop")

	a, err := FoundProject(tree, t.TempDir())
	if err != nil {
		t.Fatalf("FoundProject a: %v", err)
	}
	b, err := FoundProject(tree, t.TempDir())
	if err != nil {
		t.Fatalf("FoundProject b: %v", err)
	}

	fa, fb := foundFilesByPath(a), foundFilesByPath(b)
	if len(fa) != len(fb) {
		t.Fatalf("two founds differ in file count: %d != %d", len(fa), len(fb))
	}
	for path, ba := range fa {
		bb, ok := fb[path]
		if !ok {
			t.Fatalf("second found is missing %q", path)
		}
		if !bytes.Equal(ba, bb) {
			t.Fatalf("found is not byte-stable for %q", path)
		}
	}
}

// TestFoundProject_RoundTrip — LE ROUND-TRIP COMPLET : exporter shop → sérialiser l'artefact → le relire
// → FOUND. Le code recompilé depuis l'artefact SÉRIALISÉ-PUIS-RELU est byte-identique au code recompilé
// depuis l'arbre original. C'est la portabilité de bout en bout : l'artefact écrit sur disque puis relu
// reconstruit EXACTEMENT le même code que l'arbre en mémoire (le génome est la source unique transportable).
func TestFoundProject_RoundTrip(t *testing.T) {
	orig := ExportProject("shop")

	raw, err := Serialise(orig)
	if err != nil {
		t.Fatalf("Serialise: %v", err)
	}
	back, err := Deserialise(raw)
	if err != nil {
		t.Fatalf("Deserialise: %v", err)
	}
	if !reflect.DeepEqual(orig, back) {
		t.Fatalf("round-trip is not the identity before found")
	}

	fromOrig, err := FoundProject(orig, t.TempDir())
	if err != nil {
		t.Fatalf("FoundProject(orig): %v", err)
	}
	fromBack, err := FoundProject(back, t.TempDir())
	if err != nil {
		t.Fatalf("FoundProject(back): %v", err)
	}

	fo, fb := foundFilesByPath(fromOrig), foundFilesByPath(fromBack)
	if len(fo) != len(fb) {
		t.Fatalf("found from the round-tripped artefact differs in file count: %d != %d", len(fo), len(fb))
	}
	for path, bo := range fo {
		bb, ok := fb[path]
		if !ok {
			t.Fatalf("found-from-round-tripped is missing %q", path)
		}
		if !bytes.Equal(bo, bb) {
			t.Fatalf("found-from-round-tripped artefact %q differs from found-from-original", path)
		}
	}
}

// TestFoundProject_AllSixFamilies — found écrit les SIX familles d'artefacts (schéma, serveur, maître,
// web, mobile, desktop, programme Pulumi) : aucune famille silencieusement omise. L'arbre recompile
// l'app ENTIÈRE, pas un sous-ensemble.
func TestFoundProject_AllSixFamilies(t *testing.T) {
	tree := ExportProject("shop")
	res, err := FoundProject(tree, t.TempDir())
	if err != nil {
		t.Fatalf("FoundProject: %v", err)
	}

	files := foundFilesByPath(res)
	wantDirs := map[string]bool{
		"server":  false, // le serveur Hono émis (scaffold)
		"web":     false, // le web child
		"mobile":  false, // le mobile child
		"desktop": false, // le desktop child
		"infra":   false, // le programme Pulumi
	}
	sawSchema := false
	sawMaster := false
	for path := range files {
		if path == "schema.sql" {
			sawSchema = true
		}
		if path == "master-view.json" {
			sawMaster = true
		}
		// gen/<project>/<dir>/<file> — la deuxième composante est la famille.
		parts := splitPath(path)
		if len(parts) >= 3 && parts[0] == "gen" {
			if _, ok := wantDirs[parts[2]]; ok {
				wantDirs[parts[2]] = true
			}
		}
	}
	if !sawSchema {
		t.Fatalf("found emitted no schema.sql (the data source is missing)")
	}
	if !sawMaster {
		t.Fatalf("found emitted no master-view.json (the canonical parent node is missing)")
	}
	for dir, saw := range wantDirs {
		if !saw {
			t.Fatalf("found emitted no %s/ family (an artefact family is missing): %v", dir, keys(files))
		}
	}
}

// TestFoundProject_AppliesCapitalisedAdaptation — found ré-applique les adaptations CAPITALISÉES via
// ReproduceWithCapitalised : un génome portant une adaptation mobile validée (AppName) recompile un
// mobile child qui DIFFÈRE du canonique (l'override est reproduit), tandis qu'un génome SANS adaptation
// recompile le mobile canonique byte-identique. C'est le loopback : l'adaptation validée n'est pas
// perdue, le recompile la reproduit.
func TestFoundProject_AppliesCapitalisedAdaptation(t *testing.T) {
	base := ExportProject("shop")

	// Le mobile child canonique (sans adaptation).
	canon, err := FoundProject(base, t.TempDir())
	if err != nil {
		t.Fatalf("FoundProject base: %v", err)
	}

	// Le même arbre AVEC une adaptation mobile capitalisée (AppName), parentée à la maître.
	master, br := honoemit.EmitMasterView(base.WebAppSpec)
	if br != nil {
		t.Fatalf("EmitMasterView: %s", br.Explanation)
	}
	adapted := base
	adapted.Adaptations = []honoemit.ViewAdaptation{{
		ChildTarget: honoemit.ChildMobile,
		ParentID:    master.Hash(),
		Override:    honoemit.AdaptationOverride{AppName: "Boutique"},
		Validated:   true,
		By:          "human",
	}}
	withAdapt, err := FoundProject(adapted, t.TempDir())
	if err != nil {
		t.Fatalf("FoundProject adapted: %v", err)
	}

	canonFiles := foundFilesByPath(canon)
	adaptFiles := foundFilesByPath(withAdapt)

	// app.json mobile porte l'override : il DOIT différer du canonique (l'adaptation est reproduite).
	const appJSON = "gen/shop/mobile/app.json"
	cb, ok := canonFiles[appJSON]
	if !ok {
		t.Fatalf("canonical found is missing %q", appJSON)
	}
	ab, ok := adaptFiles[appJSON]
	if !ok {
		t.Fatalf("adapted found is missing %q", appJSON)
	}
	if bytes.Equal(cb, ab) {
		t.Fatalf("the capitalised mobile adaptation was NOT reproduced: %q is byte-identical with and without the override", appJSON)
	}
	if !bytes.Contains(ab, []byte("Boutique")) {
		t.Fatalf("the reproduced mobile app.json does not carry the capitalised AppName override")
	}

	// Le desktop child, lui, reste byte-identique (l'adaptation ciblait mobile uniquement).
	const desktopMain = "gen/shop/desktop/main.js"
	if cd, ok := canonFiles[desktopMain]; ok {
		if ad, ok := adaptFiles[desktopMain]; ok && !bytes.Equal(cd, ad) {
			t.Fatalf("a MOBILE adaptation leaked into the desktop child %q (the provenance frontier broke)", desktopMain)
		}
	}
}

// --- helpers du miroir (PURS, déterministes) ---

// directEmission produces the artefacts the matérialiseurs emit DIRECTLY from the project sources —
// the reference `found` must reproduce byte-for-byte. It mirrors exactly what FoundProject does, but
// reading the SOURCES the export gathered from (the demo cut), so the two paths share no code (a true
// oracle, not a tautology): the same emitters, fed the same cut, must land the same bytes.
func directEmission(t *testing.T, project string) map[string][]byte {
	t.Helper()
	out := map[string][]byte{}

	// (1) Le schéma — depuis les entités du web spec (la même source que l'export dérive).
	web := projectWebSpec(project)
	schema, _, err := appdata.EmitProjectData(project, entitiesToSchemaSource(web.Entities))
	if err != nil {
		t.Fatalf("direct EmitProjectData: %v", err)
	}
	out["schema.sql"] = schema

	// (2) Le serveur Hono émis (scaffold) — depuis le ServerSpec du projet.
	scaffold, br := honoemit.EmitServerScaffold(projectServerSpec(project))
	if br != nil {
		t.Fatalf("direct EmitServerScaffold: %s", br.Explanation)
	}
	for _, a := range scaffold {
		out[a.Path] = a.Bytes
	}

	// (3) La vue maître (le nœud parent canonique).
	master, br := honoemit.EmitMasterView(web)
	if br != nil {
		t.Fatalf("direct EmitMasterView: %s", br.Explanation)
	}
	out["master-view.json"] = masterViewArtifact(t, master)

	// (4) Le web child.
	webChild, br := honoemit.EmitWebChild(web)
	if br != nil {
		t.Fatalf("direct EmitWebChild: %s", br.Explanation)
	}
	for _, a := range webChild.Artifacts {
		out[a.Path] = a.Bytes
	}

	// (5) Le mobile child (canonique — pas d'adaptation pour le cut démo).
	mobile, vbr := honoemit.ReproduceWithCapitalised(master, honoemit.ChildMobile, nil)
	if vbr != nil {
		t.Fatalf("direct mobile reproduce: %s", vbr.Explanation)
	}
	for _, a := range mobile.Artifacts {
		out[a.Path] = a.Bytes
	}

	// (6) Le desktop child (canonique).
	desktop, vbr := honoemit.ReproduceWithCapitalised(master, honoemit.ChildDesktop, nil)
	if vbr != nil {
		t.Fatalf("direct desktop reproduce: %s", vbr.Explanation)
	}
	for _, a := range desktop.Artifacts {
		out[a.Path] = a.Bytes
	}

	// (7) Le programme Pulumi (les 3 conteneurs câblés).
	infra, br := honoemit.EmitPulumiStackHono(project, foundEnv, honoDefaultManifest(project), honoemit.StackHonoOpts{HonoImage: honoServerImageTag(project)})
	if br != nil {
		t.Fatalf("direct EmitPulumiStackHono: %s", br.Explanation)
	}
	for _, a := range infra {
		out[a.Path] = a.Bytes
	}

	return out
}

// masterViewArtifact renders the master view's canonical JSON exactly as FoundProject persists it
// (the same masterViewArtifactBytes the executor calls) — so the oracle compares the same bytes.
func masterViewArtifact(t *testing.T, m honoemit.MasterView) []byte {
	t.Helper()
	b, err := masterViewArtifactBytes(m)
	if err != nil {
		t.Fatalf("master view artifact bytes: %v", err)
	}
	return b
}

// foundFilesByPath reads the FoundResult into a path→bytes map keyed by the RELATIVE artefact path
// (under outRoot), so the oracle and the found output compare on the same coordinates.
func foundFilesByPath(r FoundResult) map[string][]byte {
	out := make(map[string][]byte, len(r.Files))
	for _, f := range r.Files {
		out[f.Path] = f.Bytes
	}
	return out
}

func keys(m map[string][]byte) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// splitPath splits an artefact path on slashes (the emitter Paths are slash-relative,
// gen/<project>/<dir>/<file>) so the family-coverage test reads the directory component.
func splitPath(p string) []string {
	return strings.Split(filepath.ToSlash(p), "/")
}

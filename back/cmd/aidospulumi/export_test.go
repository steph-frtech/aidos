package main

// export_test.go — le MIROIR de `aidospulumi export` (l'ARBRE du projet → artefact portable).
//
// Intention (utilisatrice, 2026-06-14) : « on peut faire un EXPORT de tout le projet et le REFONDER
// avec une sorte de COMPILATEUR ». Le projet = son ARBRE content-adressé (le génome) ; le code est une
// projection RÉGÉNÉRABLE ; le compilateur (les émetteurs) le reproduit byte-identique. Ce miroir prouve
// le PREMIER demi (EXPORT) : rassembler l'arbre en UN artefact portable, déterministe, content-adressé.
//
// DÉTERMINISME-FIRST. ExportProject + Serialise sont des fonctions PURES, byte-stable : même projet →
// même artefact byte-identique (content-adressé via records.Hash) ; le round-trip Serialise→Deserialise
// est l'identité. Aucune écriture de vérité (l'artefact EST l'arbre ; le code est sa projection).

import (
	"bytes"
	"reflect"
	"testing"
)

// TestExportProject_Deterministic — ExportProject est PUR : deux exports du MÊME projet rendent un arbre
// byte-identique (même artefact sérialisé, même Hash). C'est la propriété de reproductibilité (§6) : un
// génome content-adressé ne dépend que du projet, jamais d'une horloge ni d'un RNG.
func TestExportProject_Deterministic(t *testing.T) {
	a := ExportProject("shop")
	b := ExportProject("shop")

	ba, err := Serialise(a)
	if err != nil {
		t.Fatalf("Serialise a: %v", err)
	}
	bb, err := Serialise(b)
	if err != nil {
		t.Fatalf("Serialise b: %v", err)
	}
	if !bytes.Equal(ba, bb) {
		t.Fatalf("ExportProject is not byte-stable:\n a=%s\n b=%s", ba, bb)
	}
	ha, err := a.Hash()
	if err != nil {
		t.Fatalf("Hash a: %v", err)
	}
	hb, err := b.Hash()
	if err != nil {
		t.Fatalf("Hash b: %v", err)
	}
	if ha != hb {
		t.Fatalf("Hash is not deterministic: %q != %q", ha, hb)
	}
	if ha == "" {
		t.Fatalf("Hash is empty")
	}
}

// TestExportProject_DistinctProjects — deux projets DIFFÉRENTS rendent des génomes DIFFÉRENTS (le hash
// est content-adressé au projet, pas à une constante). L'anti-faux-positif du déterminisme : un export
// qui rend le même hash pour tout projet ne porterait aucune information.
func TestExportProject_DistinctProjects(t *testing.T) {
	ha, err := ExportProject("shop").Hash()
	if err != nil {
		t.Fatalf("Hash shop: %v", err)
	}
	hb, err := ExportProject("blog").Hash()
	if err != nil {
		t.Fatalf("Hash blog: %v", err)
	}
	if ha == hb {
		t.Fatalf("distinct projects share a genome hash %q — the export is not content-addressed to the project", ha)
	}
}

// TestExportProject_SixParts — l'artefact contient les SIX parties du génome (name, manifest, entités,
// opérations, webappspec, adaptations). Le génome est la SOURCE unique dont tout le code se régénère ;
// une partie manquante = un arbre incomplet, refoundable en moins que l'app entière.
func TestExportProject_SixParts(t *testing.T) {
	tree := ExportProject("shop")

	if tree.Name != "shop" {
		t.Fatalf("(1) Name = %q, want %q", tree.Name, "shop")
	}
	if tree.StackManifest.App == "" || len(tree.StackManifest.Services) == 0 {
		t.Fatalf("(2) StackManifest is empty: %+v", tree.StackManifest)
	}
	if len(tree.Entities) == 0 {
		t.Fatalf("(3) Entities is empty — the schema source is missing")
	}
	if len(tree.Operations) == 0 {
		t.Fatalf("(4) Operations (the cut) is empty — the server source is missing")
	}
	if tree.WebAppSpec.Project == "" || len(tree.WebAppSpec.Entities) == 0 {
		t.Fatalf("(5) WebAppSpec is empty — the views source is missing: %+v", tree.WebAppSpec)
	}
	// (6) Adaptations is the capitalised soft-spec band — legitimately EMPTY for the demo cut (no
	// validated override yet), but the FIELD must exist and serialise (a nil slice round-trips to nil).
	if tree.Adaptations == nil {
		// nil is acceptable for the demo; the round-trip test proves the field survives serialisation.
		_ = tree.Adaptations
	}
}

// TestExport_RoundTrip — Serialise→Deserialise est l'IDENTITÉ : le génome désérialisé est égal à
// l'original (toutes les six parties survivent), et il porte le MÊME hash. C'est la garantie de
// portabilité : l'artefact écrit sur disque puis relu reconstruit EXACTEMENT l'arbre — la source dont
// `found` recompile tout.
func TestExport_RoundTrip(t *testing.T) {
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
		t.Fatalf("round-trip is not the identity:\n orig=%+v\n back=%+v", orig, back)
	}

	// The reconstructed genome re-serialises byte-identically (the artefact is canonical & stable).
	raw2, err := Serialise(back)
	if err != nil {
		t.Fatalf("Serialise(back): %v", err)
	}
	if !bytes.Equal(raw, raw2) {
		t.Fatalf("re-serialised artefact differs from the original bytes")
	}

	// And it carries the same content address.
	ho, err := orig.Hash()
	if err != nil {
		t.Fatalf("Hash orig: %v", err)
	}
	hb, err := back.Hash()
	if err != nil {
		t.Fatalf("Hash back: %v", err)
	}
	if ho != hb {
		t.Fatalf("round-trip lost the content address: %q != %q", ho, hb)
	}
}

// TestSerialise_Canonical — Serialise produit un JSON CANONIQUE (clés triées, byte-stable) : le hash de
// l'artefact sérialisé == ProjectTree.Hash(). Le génome est content-adressé À SES OCTETS — c'est ce qui
// permet de stocker l'artefact dans le content-store (S01) sous son propre hash.
func TestSerialise_Canonical(t *testing.T) {
	tree := ExportProject("shop")

	raw, err := Serialise(tree)
	if err != nil {
		t.Fatalf("Serialise: %v", err)
	}
	want, err := tree.Hash()
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	got := hashBytes(raw)
	if got != want {
		t.Fatalf("Serialise bytes hash %q != ProjectTree.Hash() %q — the artefact is not the hashed canonical form", got, want)
	}
}

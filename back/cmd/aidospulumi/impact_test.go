package main

// impact_test.go — le MIROIR de la VAGUE DE ROUGE sur l'arbre (ImpactOf) + du FOUND INCRÉMENTAL.
//
// Intention (utilisatrice, 2026-06-14, gravée) : UNE vague de rouge à chaque grain — changer UN
// requirement → la vague (S22) propage l'impact à tout ce qui en dépend → on re-compile les nœuds
// rouges, jamais à la main. Au grain de l'ARBRE (le ProjectTree, le génome) : un nœud changé → les
// FAMILLES affectées → recompile INCRÉMENTAL (on ne refonde QUE les familles touchées).
//
// LES PROPRIÉTÉS CAPITALES (le miroir) :
//   (a) ImpactOf est déterministe + correct : entité → {schema + les vues} ; opération → {server + les
//       vues des boutons qui la déclenchent} ; control → {les 3 vues} ; master → {3 enfants} ; manifest
//       → {infra}. Réutilise la vague de rouge S22 (redwave.Impact), ne la ré-implémente pas.
//   (b) FoundIncremental(tree, change) recompile EXACTEMENT les familles rouges, BYTE-IDENTIQUES au full
//       FoundProject pour ces familles (incrémental ⊆ complet, byte pour byte).
//   (c) une famille NON touchée n'est PAS dans la sortie incrémentale.
//   (d) FoundProject + les tests existants restent verts (anti-overwrite §9).
//
// DÉTERMINISME-FIRST / le mur. ImpactOf est PUR : même (arbre, nœud) → mêmes familles, ordre canonique.
// FoundIncremental est PUR sauf l'écriture disque gatée ; aucune écriture de vérité.

import (
	"bytes"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// familiesEqual compares two family slices for set+order equality.
func familiesEqual(got, want []Family) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

// famSet renders a family slice as a sorted string for error messages.
func famSet(fs []Family) string {
	ss := make([]string, len(fs))
	for i, f := range fs {
		ss[i] = string(f)
	}
	return "[" + strings.Join(ss, " ") + "]"
}

// TestImpactOf_EntityReddensSchemaAndViews — une ENTITÉ changée reddens {schema, master, web, mobile,
// desktop} (le schéma + les TROIS vues qui la montrent, via la maître). Le serveur et l'infra ne sont PAS
// touchés (ils ne dérivent pas d'une entité). C'est la propagation de la prompt, calculée par la vague.
func TestImpactOf_EntityReddensSchemaAndViews(t *testing.T) {
	tree := ExportProject("shop")

	got := ImpactOf(tree, "Order") // a bare entity name
	want := []Family{FamilySchema, FamilyMaster, FamilyWeb, FamilyMobile, FamilyDesktop}

	if !familiesEqual(got, want) {
		t.Fatalf("an entity change must redden schema + the 3 views (via master), got %s want %s", famSet(got), famSet(want))
	}
	// The server and infra families must NOT be reddened by an entity change.
	for _, f := range got {
		if f == FamilyServer || f == FamilyInfra {
			t.Fatalf("an entity change must NOT redden %q (it does not derive from an entity)", f)
		}
	}
}

// TestImpactOf_OperationReddensServerAndButtonViews — une OPÉRATION changée reddens {server, + les vues
// portant les boutons qui la déclenchent}. La démo : createOrder est déclenchée par checkout-button (sur
// la maître), donc l'opération reddens server + master + web/mobile/desktop. Le schéma et l'infra non.
func TestImpactOf_OperationReddensServerAndButtonViews(t *testing.T) {
	tree := ExportProject("shop")

	got := ImpactOf(tree, "createOrder")
	want := []Family{FamilyServer, FamilyMaster, FamilyWeb, FamilyMobile, FamilyDesktop}

	if !familiesEqual(got, want) {
		t.Fatalf("an operation change must redden server + the views of its triggering buttons, got %s want %s", famSet(got), famSet(want))
	}
	for _, f := range got {
		if f == FamilySchema || f == FamilyInfra {
			t.Fatalf("an operation change must NOT redden %q", f)
		}
	}
}

// TestImpactOf_ControlReddensTheThreeViews — un CONTROL (bouton) changé reddens {master, web, mobile,
// desktop} (les 3 vues, via la maître). Le schéma, le serveur et l'infra ne sont PAS touchés.
func TestImpactOf_ControlReddensTheThreeViews(t *testing.T) {
	tree := ExportProject("shop")

	got := ImpactOf(tree, "checkout-button")
	want := []Family{FamilyMaster, FamilyWeb, FamilyMobile, FamilyDesktop}

	if !familiesEqual(got, want) {
		t.Fatalf("a control change must redden the 3 views (via master), got %s want %s", famSet(got), famSet(want))
	}
	for _, f := range got {
		if f == FamilySchema || f == FamilyServer || f == FamilyInfra {
			t.Fatalf("a control change must NOT redden %q", f)
		}
	}
}

// TestImpactOf_MasterReddensTheThreeChildren — la MAÎTRE changée reddens {web, mobile, desktop} (les 3
// enfants qui en dérivent) + elle-même (la maître est sa propre famille). Le schéma/serveur/infra non.
func TestImpactOf_MasterReddensTheThreeChildren(t *testing.T) {
	tree := ExportProject("shop")

	got := ImpactOf(tree, NodeMaster)
	want := []Family{FamilyMaster, FamilyWeb, FamilyMobile, FamilyDesktop}

	if !familiesEqual(got, want) {
		t.Fatalf("a master change must redden the 3 children (+ master), got %s want %s", famSet(got), famSet(want))
	}
	for _, f := range got {
		if f == FamilySchema || f == FamilyServer || f == FamilyInfra {
			t.Fatalf("a master change must NOT redden %q", f)
		}
	}
}

// TestImpactOf_ManifestReddensInfraOnly — le MANIFEST changé reddens {infra} UNIQUEMENT (le programme
// Pulumi). Aucune vue, aucun schéma, aucun serveur (l'infra est le seul consommateur du manifest).
func TestImpactOf_ManifestReddensInfraOnly(t *testing.T) {
	tree := ExportProject("shop")

	got := ImpactOf(tree, NodeManifest)
	want := []Family{FamilyInfra}

	if !familiesEqual(got, want) {
		t.Fatalf("a manifest change must redden infra ONLY, got %s want %s", famSet(got), famSet(want))
	}
}

// TestImpactOf_Deterministic — ImpactOf est PUR : deux appels sur le MÊME (arbre, nœud) rendent EXACTEMENT
// les mêmes familles, dans le même ordre canonique. Pas d'horloge, pas de RNG, pas de fuite d'itération.
func TestImpactOf_Deterministic(t *testing.T) {
	tree := ExportProject("shop")
	for _, node := range []string{"Order", "createOrder", "checkout-button", NodeMaster, NodeManifest} {
		a := ImpactOf(tree, node)
		b := ImpactOf(tree, node)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("ImpactOf(%q) is not deterministic: %s != %s", node, famSet(a), famSet(b))
		}
		// The output must be in canonical family order (sorted by familyRank).
		if !sort.SliceIsSorted(a, func(i, j int) bool { return familyRank(a[i]) < familyRank(a[j]) }) {
			t.Fatalf("ImpactOf(%q) is not in canonical family order: %s", node, famSet(a))
		}
	}
}

// TestImpactOf_UnknownNodeReddensNothing — un nœud inconnu (ni famille, ni élément de l'arbre) reddens
// AUCUNE famille (slice vide) — jamais un panic, jamais une famille devinée (la totalité).
func TestImpactOf_UnknownNodeReddensNothing(t *testing.T) {
	tree := ExportProject("shop")
	if got := ImpactOf(tree, "no-such-node-xyz"); len(got) != 0 {
		t.Fatalf("an unknown node must redden NOTHING, got %s", famSet(got))
	}
	if got := ImpactOf(tree, ""); len(got) != 0 {
		t.Fatalf("an empty node must redden NOTHING, got %s", famSet(got))
	}
}

// TestFoundIncremental_ByteIdenticalToFull — LE THÉORÈME INCRÉMENTAL. Pour un nœud changé, le found
// incrémental recompile EXACTEMENT les familles rouges, et CHAQUE artefact est BYTE-IDENTIQUE à ce que le
// found COMPLET produit pour cette famille (incrémental ⊆ complet, byte pour byte). Une famille NON
// touchée n'apparaît PAS dans la sortie incrémentale.
func TestFoundIncremental_ByteIdenticalToFull(t *testing.T) {
	tree := ExportProject("shop")

	// Le found COMPLET — l'oracle : tous les fichiers de toutes les familles.
	full, err := FoundProject(tree, t.TempDir())
	if err != nil {
		t.Fatalf("FoundProject: %v", err)
	}
	fullFiles := foundFilesByPath(full)

	cases := []struct {
		node string
		want []Family
	}{
		{"Order", []Family{FamilySchema, FamilyMaster, FamilyWeb, FamilyMobile, FamilyDesktop}},
		{"createOrder", []Family{FamilyServer, FamilyMaster, FamilyWeb, FamilyMobile, FamilyDesktop}},
		{"checkout-button", []Family{FamilyMaster, FamilyWeb, FamilyMobile, FamilyDesktop}},
		{NodeManifest, []Family{FamilyInfra}},
	}

	for _, tc := range cases {
		t.Run(tc.node, func(t *testing.T) {
			inc, err := FoundIncremental(tree, tc.node, t.TempDir())
			if err != nil {
				t.Fatalf("FoundIncremental(%q): %v", tc.node, err)
			}
			incFiles := foundFilesByPath(inc)

			// (b) every incremental artefact is BYTE-IDENTICAL to the full found's for the same path.
			for path, incBytes := range incFiles {
				fullBytes, ok := fullFiles[path]
				if !ok {
					t.Fatalf("incremental emitted %q which the full found does NOT have", path)
				}
				if !bytes.Equal(incBytes, fullBytes) {
					t.Fatalf("incremental %q differs byte-for-byte from the full found", path)
				}
			}

			// the incremental output covers EXACTLY the red families (every red family has ≥1 file, and
			// no file belongs to a NON-red family).
			redFamilies := map[Family]bool{}
			for _, f := range tc.want {
				redFamilies[f] = true
			}
			sawFamily := map[Family]bool{}
			for path := range incFiles {
				fam := familyOfPath(path)
				if fam == "" {
					t.Fatalf("incremental emitted %q with no recognisable family", path)
				}
				// (c) a NON-touched family must NOT appear in the incremental output.
				if !redFamilies[fam] {
					t.Fatalf("incremental for %q emitted a file of the NON-red family %q: %s", tc.node, fam, path)
				}
				sawFamily[fam] = true
			}
			for f := range redFamilies {
				if !sawFamily[f] {
					t.Fatalf("incremental for %q did NOT recompile the red family %q (no file emitted)", tc.node, f)
				}
			}
		})
	}
}

// TestFoundIncremental_UntouchedFamilyAbsent — (c) explicite : un changement de MANIFEST recompile l'infra
// SEULEMENT ; aucun fichier de schema/server/web/mobile/desktop n'apparaît (les familles non touchées
// sont ABSENTES de la sortie incrémentale — c'est tout l'intérêt de la vague).
func TestFoundIncremental_UntouchedFamilyAbsent(t *testing.T) {
	tree := ExportProject("shop")
	inc, err := FoundIncremental(tree, NodeManifest, t.TempDir())
	if err != nil {
		t.Fatalf("FoundIncremental(manifest): %v", err)
	}
	incFiles := foundFilesByPath(inc)
	if len(incFiles) == 0 {
		t.Fatalf("a manifest change must recompile the infra family (got 0 files)")
	}
	for path := range incFiles {
		if familyOfPath(path) != FamilyInfra {
			t.Fatalf("a manifest change recompiled a non-infra artefact %q (untouched family leaked)", path)
		}
	}
}

// TestFoundIncremental_Deterministic — FoundIncremental est PUR : deux recompilations incrémentales du
// même (arbre, nœud) dans deux dirs distincts rendent un gen/ byte-identique.
func TestFoundIncremental_Deterministic(t *testing.T) {
	tree := ExportProject("shop")
	a, err := FoundIncremental(tree, "Order", t.TempDir())
	if err != nil {
		t.Fatalf("FoundIncremental a: %v", err)
	}
	b, err := FoundIncremental(tree, "Order", t.TempDir())
	if err != nil {
		t.Fatalf("FoundIncremental b: %v", err)
	}
	fa, fb := foundFilesByPath(a), foundFilesByPath(b)
	if len(fa) != len(fb) {
		t.Fatalf("two incremental founds differ in file count: %d != %d", len(fa), len(fb))
	}
	for path, ba := range fa {
		bb, ok := fb[path]
		if !ok {
			t.Fatalf("second incremental found is missing %q", path)
		}
		if !bytes.Equal(ba, bb) {
			t.Fatalf("incremental found is not byte-stable for %q", path)
		}
	}
}

// familyOfPath maps a recompiled artefact path to its family (the test oracle, NOT the production code —
// it reads the path the emitters render: schema.sql, master-view.json, gen/<project>/<family>/<file>).
func familyOfPath(path string) Family {
	if path == "schema.sql" {
		return FamilySchema
	}
	if path == "master-view.json" {
		return FamilyMaster
	}
	parts := splitPath(path)
	if len(parts) >= 3 && parts[0] == "gen" {
		switch parts[2] {
		case "server":
			return FamilyServer
		case "web":
			return FamilyWeb
		case "mobile":
			return FamilyMobile
		case "desktop":
			return FamilyDesktop
		case "infra":
			return FamilyInfra
		}
	}
	return ""
}

// mobilechild_property_test.go — le MIROIR D'INVARIANT du MOBILE CHILD (rapid, le slot property
// Go gelé). Il grave, sur des maîtres arbitraires, ce qu'un fixture ne peut pas :
//
//   - DÉTERMINISME : même maître → MÊME mobile child, byte-pour-byte (fonction pure) ;
//   - DÉRIVATION : ParentID == master.Hash() (l'arête composes) pour toute maître projetable, et
//     web + mobile partagent le MÊME parentId (un parent, des enfants distincts) ;
//   - FORME DISTINCTE : pour chaque control/entité, le composant mobile n'est jamais byte-égal au
//     composant web de même nom (un enfant adapté, pas un clone) ;
//   - COMPLÉTUDE : une FlatList par section, un Pressable par action (la projection PURE de la
//     maître, jamais inventée ni omise) ;
//   - ANTI-OVERWRITE §9 : émettre le mobile child ne change AUCUN octet du web child ;
//   - ADAPTATION : un override mobile change les bytes mais JAMAIS le parentId.
//
// Mêmes entrées → mêmes sorties, sur chaque run et chaque machine.
package honoemit

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// TestProp_MobileChildByteStable — même maître → artefacts mobile byte-identiques, deux fois (la
// projection est une fonction pure, déterministe).
func TestProp_MobileChildByteStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMasterView(t)

		a, br := EmitMobileChild(m)
		if br != nil {
			t.Fatalf("EmitMobileChild refused a projectable master: %s", br.Explanation)
		}
		b, br := EmitMobileChild(m)
		if br != nil {
			t.Fatalf("EmitMobileChild refused on second call: %s", br.Explanation)
		}
		if len(a.Artifacts) != len(b.Artifacts) {
			t.Fatalf("mobile artifact count not stable: %d vs %d", len(a.Artifacts), len(b.Artifacts))
		}
		for i := range a.Artifacts {
			if a.Artifacts[i].Path != b.Artifacts[i].Path {
				t.Fatalf("mobile artifact %d path not stable", i)
			}
			if string(a.Artifacts[i].Bytes) != string(b.Artifacts[i].Bytes) {
				t.Fatalf("mobile artifact %q not byte-stable", a.Artifacts[i].Path)
			}
		}
		// The slice is path-sorted (byte-stable order).
		for i := 1; i < len(a.Artifacts); i++ {
			if a.Artifacts[i-1].Path > a.Artifacts[i].Path {
				t.Fatalf("mobile artifacts not path-sorted")
			}
		}
	})
}

// TestProp_MobileChildDerivesFromMaster — pour toute maître projetable, ParentID == master.Hash()
// (l'arête composes) ET web + mobile partagent le MÊME parent (un parent, des enfants distincts).
func TestProp_MobileChildDerivesFromMaster(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpecWithInvariants(t)
		m, br := EmitMasterView(spec)
		if br != nil {
			t.Fatalf("EmitMasterView refused: %s", br.Explanation)
		}
		mobile, br := EmitMobileChild(m)
		if br != nil {
			t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
		}
		if mobile.Target != ChildMobile {
			t.Fatalf("child target != ChildMobile")
		}
		if mobile.ParentID != m.Hash() {
			t.Fatalf("mobile child ParentID != master hash (composes edge broken)")
		}
		if mobile.MasterHash != mobile.ParentID {
			t.Fatalf("MasterHash != ParentID")
		}
		web, br := EmitWebChild(spec)
		if br != nil {
			t.Fatalf("EmitWebChild refused: %s", br.Explanation)
		}
		if mobile.ParentID != web.ParentID {
			t.Fatalf("mobile + web children do not share the same parent")
		}
	})
}

// TestProp_MobileChildDistinctFromWeb — pour toute maître projetable, chaque composant .tsx de même
// nom dans le mobile child n'est PAS byte-égal à son jumeau web (un enfant distinct, jamais un clone).
func TestProp_MobileChildDistinctFromWeb(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpecWithInvariants(t)
		m, br := EmitMasterView(spec)
		if br != nil {
			t.Fatalf("EmitMasterView refused: %s", br.Explanation)
		}
		mobile, br := EmitMobileChild(m)
		if br != nil {
			t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
		}
		web, br := EmitWebApp(spec)
		if br != nil {
			t.Fatalf("EmitWebApp refused: %s", br.Explanation)
		}
		webByName := map[string]string{}
		for _, a := range web {
			webByName[baseName(a.Path)] = string(a.Bytes)
		}
		for _, a := range mobile.Artifacts {
			name := baseName(a.Path)
			if !strings.HasSuffix(name, ".tsx") {
				continue
			}
			if wb, ok := webByName[name]; ok && string(a.Bytes) == wb {
				t.Fatalf("mobile component %q is byte-identical to the web child (a clone)", name)
			}
		}
	})
}

// TestProp_MobileCompleteness — une FlatList par section, un Pressable par action : la projection
// PURE de la maître, jamais inventée ni omise.
func TestProp_MobileCompleteness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMasterView(t)
		child, br := EmitMobileChild(m)
		if br != nil {
			t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
		}
		byName := map[string]string{}
		for _, a := range child.Artifacts {
			byName[baseName(a.Path)] = string(a.Bytes)
		}
		for _, sec := range m.Sections {
			list, ok := byName[pascal(sec.Entity)+"List.tsx"]
			if !ok {
				t.Fatalf("missing FlatList for section %q", sec.Entity)
			}
			if !strings.Contains(list, "FlatList") {
				t.Fatalf("section %q is not a FlatList", sec.Entity)
			}
		}
		for _, act := range m.Actions {
			btn, ok := byName[pascal(act.Control)+".tsx"]
			if !ok {
				t.Fatalf("missing Pressable for action control %q", act.Control)
			}
			if !strings.Contains(btn, "Pressable") {
				t.Fatalf("action %q is not a Pressable", act.Control)
			}
		}
	})
}

// TestProp_MobileChildDoesNotTouchWebBytes — la frontière anti-overwrite §9 : pour toute maître
// projetable, émettre le mobile child laisse les octets du web child INCHANGÉS (la forme web est
// gelée sur shopapp ; le mobile child est un NŒUD nouveau, jamais un écrasement).
func TestProp_MobileChildDoesNotTouchWebBytes(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpecWithInvariants(t)
		m, br := EmitMasterView(spec)
		if br != nil {
			t.Fatalf("EmitMasterView refused: %s", br.Explanation)
		}
		before, br := EmitWebApp(spec)
		if br != nil {
			t.Fatalf("EmitWebApp refused (before): %s", br.Explanation)
		}
		if _, br := EmitMobileChild(m); br != nil {
			t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
		}
		after, br := EmitWebApp(spec)
		if br != nil {
			t.Fatalf("EmitWebApp refused (after): %s", br.Explanation)
		}
		if len(before) != len(after) {
			t.Fatalf("web artifact count changed after emitting the mobile child")
		}
		for i := range before {
			if before[i].Path != after[i].Path || string(before[i].Bytes) != string(after[i].Bytes) {
				t.Fatalf("web artifact %q changed after emitting the mobile child (anti-overwrite §9)", before[i].Path)
			}
		}
	})
}

// TestProp_MobileAdaptationKeepsParent — un override mobile change les bytes mais JAMAIS le parentId
// (la maître est la même requirement ; l'adaptation est per-plateforme, capitalisable).
func TestProp_MobileAdaptationKeepsParent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMasterView(t)
		base, br := EmitMobileChild(m)
		if br != nil {
			t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
		}
		name := rapid.StringMatching(`[A-Z][a-zA-Z ]{0,15}`).Draw(t, "appname")
		adapted, br := EmitMobileChildAdapted(m, MobileAdaptation{AppName: name})
		if br != nil {
			t.Fatalf("EmitMobileChildAdapted refused: %s", br.Explanation)
		}
		if adapted.ParentID != base.ParentID {
			t.Fatalf("adaptation changed the parentId (must derive from the SAME master)")
		}
	})
}

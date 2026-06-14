// desktopchild_property_test.go — le MIROIR D'INVARIANT du DESKTOP CHILD (rapid, le slot property
// Go gelé). Sur des maîtres arbitraires, il grave ce qu'un fixture ne peut pas :
//
//   - REPRODUCTIBILITÉ : même maître → MÊMES artefacts desktop, byte-pour-byte (déterminisme) ;
//   - DÉRIVATION : pour toute maître projetable, ParentID == master.Hash() (l'arête composes) ;
//   - IDIOME DISTINCT : le renderer desktop n'est byte-égal à AUCUN artefact du web child (pas la
//     vue web emballée — un troisième enfant distinct) ;
//   - COMPLÉTUDE : un panneau par section, un bouton-action par action (la projection PURE de la
//     maître, jamais inventée ni omise).
//
// Mêmes entrées → mêmes sorties, sur chaque run et chaque machine.
package honoemit

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// genMasterView draws an arbitrary projectable MasterView by emitting EmitMasterView over an
// arbitrary projectable WebAppSpec (the master is a pure projection of the spec — so a valid spec
// yields a valid master, and we exercise the SAME canonical cut the children derive from).
func genMasterView(t *rapid.T) MasterView {
	spec := genSpecWithInvariants(t)
	m, br := EmitMasterView(spec)
	if br != nil {
		t.Fatalf("EmitMasterView refused a projectable spec: %s", br.Explanation)
	}
	return m
}

// TestProp_DesktopChildByteStable — même maître → artefacts desktop byte-identiques, deux fois (la
// projection est une fonction pure, déterministe).
func TestProp_DesktopChildByteStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMasterView(t)

		a, br := EmitDesktopChild(m)
		if br != nil {
			t.Fatalf("EmitDesktopChild refused a projectable master: %s", br.Explanation)
		}
		b, br := EmitDesktopChild(m)
		if br != nil {
			t.Fatalf("EmitDesktopChild refused on second call: %s", br.Explanation)
		}
		if len(a.Artifacts) != len(b.Artifacts) {
			t.Fatalf("desktop artifact count not stable: %d vs %d", len(a.Artifacts), len(b.Artifacts))
		}
		for i := range a.Artifacts {
			if a.Artifacts[i].Path != b.Artifacts[i].Path {
				t.Fatalf("desktop artifact %d path not stable", i)
			}
			if string(a.Artifacts[i].Bytes) != string(b.Artifacts[i].Bytes) {
				t.Fatalf("desktop artifact %q not byte-stable", a.Artifacts[i].Path)
			}
		}
	})
}

// TestProp_DesktopChildDerivesFromMaster — pour toute maître projetable, ParentID == master.Hash()
// (l'arête composes S18, le MÊME parent que le web/mobile).
func TestProp_DesktopChildDerivesFromMaster(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMasterView(t)
		child, br := EmitDesktopChild(m)
		if br != nil {
			t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
		}
		if child.Target != ChildDesktop {
			t.Fatalf("child target != ChildDesktop")
		}
		if child.ParentID != m.Hash() {
			t.Fatalf("child ParentID != master hash (composes edge broken)")
		}
		if child.MasterHash != child.ParentID {
			t.Fatalf("MasterHash != ParentID")
		}
	})
}

// TestProp_DesktopRendererDistinctFromWeb — l'idiome est distinct : le renderer desktop n'est
// byte-égal à AUCUN artefact du web child (pas la vue web emballée). On reconstruit la spec depuis
// la maître via genSpecWithInvariants (le même cut), puis on compare au web child de ce cut.
func TestProp_DesktopRendererDistinctFromWeb(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpecWithInvariants(t)
		m, br := EmitMasterView(spec)
		if br != nil {
			t.Fatalf("EmitMasterView refused: %s", br.Explanation)
		}
		desk, br := EmitDesktopChild(m)
		if br != nil {
			t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
		}
		web, br := EmitWebChild(spec)
		if br != nil {
			t.Fatalf("EmitWebChild refused: %s", br.Explanation)
		}
		// The desktop renderer is not byte-equal to ANY web artifact (a distinct view).
		var renderer string
		for _, a := range desk.Artifacts {
			if strings.HasSuffix(a.Path, "renderer.tsx") {
				renderer = string(a.Bytes)
			}
		}
		if renderer == "" {
			t.Fatalf("desktop child emitted no renderer.tsx")
		}
		for _, wa := range web.Artifacts {
			if string(wa.Bytes) == renderer {
				t.Fatalf("desktop renderer byte-identical to web artifact %q", wa.Path)
			}
		}
	})
}

// TestProp_DesktopCompleteness — un panneau par section, un bouton-action par action : la
// projection PURE de la maître, jamais inventée ni omise (le panneau cite la section ; le bouton
// cite l'invoke ; le menu en main.js cite l'invoke).
func TestProp_DesktopCompleteness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMasterView(t)
		child, br := EmitDesktopChild(m)
		if br != nil {
			t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
		}
		var renderer, main string
		for _, a := range child.Artifacts {
			if strings.HasSuffix(a.Path, "renderer.tsx") {
				renderer = string(a.Bytes)
			}
			if strings.HasSuffix(a.Path, "main.js") {
				main = string(a.Bytes)
			}
		}
		for _, sec := range m.Sections {
			if !strings.Contains(renderer, "data-aidos-panel=\""+sec.Entity+"\"") {
				t.Fatalf("missing panel for section %q", sec.Entity)
			}
		}
		for _, act := range m.Actions {
			if act.Invoke == "" {
				continue
			}
			if !strings.Contains(renderer, "data-aidos-invoke=\""+act.Invoke+"\"") {
				t.Fatalf("missing action button for invoke %q", act.Invoke)
			}
			if !strings.Contains(main, act.Invoke) {
				t.Fatalf("application menu missing item for invoke %q", act.Invoke)
			}
		}
	})
}

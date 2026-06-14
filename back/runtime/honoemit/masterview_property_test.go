// masterview_property_test.go — le MIROIR D'INVARIANT de la VUE MAÎTRE + du WEB CHILD (rapid, le
// slot property Go gelé). Il grave ce qu'un fixture ne peut pas, sur des specs arbitraires :
//
//   - REPRODUCTIBILITÉ : même arbre (entités ⊕ controls/actions ⊕ invariants) → MÊME maître →
//     MÊME hash, modulo l'ordre d'entrée (le parentId est stable) ;
//   - DÉRIVATION BYTE-IDENTIQUE : EmitWebChild émet des artefacts BYTE-ÉGAUX à EmitWebApp pour
//     toute spec projetable, et ParentID == MasterViewHash (l'arête composes) ;
//   - ANTI-OVERWRITE §9 : ajouter des invariants à la spec ne change AUCUN octet du web child.
//
// Mêmes entrées → mêmes sorties, sur chaque run et chaque machine.
package honoemit

import (
	"testing"

	"pgregory.net/rapid"
)

// genSpecWithInvariants draws an arbitrary projectable WebAppSpec (reusing genWebAppSpec) plus
// 0..3 declared invariants (arbitrary distinct strings) — the master carries them, the web child
// must ignore them byte-wise.
func genSpecWithInvariants(t *rapid.T) WebAppSpec {
	s := genWebAppSpec(t)
	nInv := rapid.IntRange(0, 3).Draw(t, "ninv")
	seen := map[string]bool{}
	inv := make([]string, 0, nInv)
	for i := 0; i < nInv; i++ {
		v := rapid.StringMatching(`[a-z][a-z0-9 ]{0,15}`).Draw(t, "inv")
		if seen[v] {
			continue
		}
		seen[v] = true
		inv = append(inv, v)
	}
	s.Invariants = inv
	return s
}

// TestProp_MasterViewContentAddressed — same tree cut → byte-identical master hash, twice and
// under input-order permutation (the parentId is stable, the determinism contract).
func TestProp_MasterViewContentAddressed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpecWithInvariants(t)

		m1, br := EmitMasterView(spec)
		if br != nil {
			t.Fatalf("EmitMasterView refused a projectable spec: %s", br.Explanation)
		}
		shuffled := shuffledWebSpec(spec)
		shuffled.Invariants = append([]string(nil), spec.Invariants...)
		m2, br := EmitMasterView(shuffled)
		if br != nil {
			t.Fatalf("EmitMasterView refused the shuffled spec: %s", br.Explanation)
		}
		if m1.Hash() != m2.Hash() {
			t.Fatalf("master hash diverged under input permutation")
		}

		h, br := MasterViewHash(spec)
		if br != nil {
			t.Fatalf("MasterViewHash refused: %s", br.Explanation)
		}
		if h != m1.Hash() {
			t.Fatalf("MasterViewHash(spec) != master value Hash()")
		}
	})
}

// TestProp_WebChildByteIdenticalToWebApp — for every projectable spec, EmitWebChild's artifacts
// are byte-identical to EmitWebApp's, and ParentID == MasterViewHash (the composes edge). The
// reframe is byte-transparent (anti-overwrite §9).
func TestProp_WebChildByteIdenticalToWebApp(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpecWithInvariants(t)

		child, br := EmitWebChild(spec)
		if br != nil {
			t.Fatalf("EmitWebChild refused: %s", br.Explanation)
		}
		web, br := EmitWebApp(spec)
		if br != nil {
			t.Fatalf("EmitWebApp refused: %s", br.Explanation)
		}
		if len(child.Artifacts) != len(web) {
			t.Fatalf("child artifact count %d != EmitWebApp %d", len(child.Artifacts), len(web))
		}
		for i := range web {
			if child.Artifacts[i].Path != web[i].Path {
				t.Fatalf("artifact %d path diverged", i)
			}
			if string(child.Artifacts[i].Bytes) != string(web[i].Bytes) {
				t.Fatalf("artifact %q not byte-identical to EmitWebApp", web[i].Path)
			}
		}
		wantParent, br := MasterViewHash(spec)
		if br != nil {
			t.Fatalf("MasterViewHash refused: %s", br.Explanation)
		}
		if child.ParentID != wantParent {
			t.Fatalf("child ParentID != master hash (composes edge broken)")
		}
	})
}

// TestProp_InvariantsDoNotTouchWebBytes — the anti-overwrite §9 frontier: for any projectable
// spec, stripping the invariants leaves the WEB child's bytes unchanged (invariants live in the
// master, never in the emitted web React).
func TestProp_InvariantsDoNotTouchWebBytes(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genSpecWithInvariants(t)
		bare := spec
		bare.Invariants = nil

		withInv, br := EmitWebApp(spec)
		if br != nil {
			t.Fatalf("EmitWebApp refused (with invariants): %s", br.Explanation)
		}
		without, br := EmitWebApp(bare)
		if br != nil {
			t.Fatalf("EmitWebApp refused (bare): %s", br.Explanation)
		}
		if len(withInv) != len(without) {
			t.Fatalf("web artifact count depends on invariants (%d vs %d)", len(withInv), len(without))
		}
		for i := range withInv {
			if string(withInv[i].Bytes) != string(without[i].Bytes) {
				t.Fatalf("web artifact %q changed when invariants added (anti-overwrite §9)", withInv[i].Path)
			}
		}
	})
}

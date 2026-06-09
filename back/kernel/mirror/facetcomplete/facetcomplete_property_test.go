package facetcomplete_test

// Property mirror (∀) for FK04 — the facet-aware completeness law as invariants + the
// reproducibility mirror. reflects=kernel.mirror.facetcomplete, test_kind=property,
// cert_language=rapid, liveness=live, authority=below (a means-test — CLAUDE.md §8).
//
// The invariants are the human red of FKE-1.3 conséquence 5, NOT invented to be satisfied:
//
//  1. TOTAL & DETERMINISTIC (the reproducibility mirror, CLAUDE.md §6/§8). For EVERY cut,
//     ComputeFacetCompleteness never panics; same cut ⇒ byte-identical Result.
//  2. MONSTER ⇔ MISSING PAIR. A HARD facet monster appears iff a layer instantiates a NON-soft
//     facet with no living mirror of that facet; X never produces a hard monster (soft §13.4).
//  3. ADDITIVE. The test_kind plane is exactly records.ComputeCompleteness — FK04 never drops
//     nor invents an S06 monster.
//  4. ANTI OVER-CONSTRAINT (§13.4). An undeclared facet NEVER produces a monster.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetcomplete"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"pgregory.net/rapid"
)

func genFacet(t *rapid.T, label string) facets.Facet {
	fs := facets.Facets()
	return fs[rapid.IntRange(0, len(fs)-1).Draw(t, label)]
}

func genLayer(t *rapid.T) facetcomplete.FacetLayer {
	id := rapid.SampledFrom([]string{"a", "b", "c"}).Draw(t, "layer_id")
	// 1..4 instantiated facets (F always among them for realism, but not required by FK04).
	n := rapid.IntRange(1, 4).Draw(t, "nfacets")
	seen := map[facets.Facet]bool{}
	insts := []facets.Instance{}
	for i := 0; i < n; i++ {
		f := genFacet(t, "inst_facet")
		if seen[f] {
			continue
		}
		seen[f] = true
		insts = append(insts, facets.Instance{Facet: f, HasIntent: true})
	}
	return facetcomplete.FacetLayer{
		Layer:  records.Layer{LayerID: id, Version: "v1", Kind: "operation"},
		Facets: facets.FacetSet{Instances: insts},
	}
}

func genMirror(t *rapid.T) facetcomplete.FacetMirror {
	id := rapid.SampledFrom([]string{"a", "b", "c"}).Draw(t, "reflects_id")
	alive := rapid.Bool().Draw(t, "alive")
	live := records.LivenessDead
	cl := records.CertProse
	if alive {
		live = records.LivenessAlive
		cl = records.CertRapid
	}
	return facetcomplete.FacetMirror{
		Mirror: records.Mirror{
			MirrorID:     rapid.SampledFrom([]string{"m1", "m2", "m3"}).Draw(t, "mid"),
			Reflects:     records.LayerRef{LayerID: id, Version: "v1"},
			TestKind:     records.TestKindFixture,
			CertLanguage: cl,
			Liveness:     live,
		},
		Facet: genFacet(t, "mirror_facet"),
	}
}

func genCut(t *rapid.T) ([]facetcomplete.FacetLayer, []facetcomplete.FacetMirror) {
	nl := rapid.IntRange(0, 3).Draw(t, "nlayers")
	layers := make([]facetcomplete.FacetLayer, 0, nl)
	for i := 0; i < nl; i++ {
		layers = append(layers, genLayer(t))
	}
	nm := rapid.IntRange(0, 4).Draw(t, "nmirrors")
	mirrors := make([]facetcomplete.FacetMirror, 0, nm)
	for i := 0; i < nm; i++ {
		mirrors = append(mirrors, genMirror(t))
	}
	return layers, mirrors
}

// INV 1 — total & deterministic (the reproducibility mirror).
func TestProp_TotalAndDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		layers, mirrors := genCut(t)
		r1 := facetcomplete.ComputeFacetCompleteness(layers, mirrors)
		r2 := facetcomplete.ComputeFacetCompleteness(layers, mirrors)
		if !reflect.DeepEqual(r1, r2) {
			t.Fatalf("non-deterministic Result for the same cut:\n%+v\n%+v", r1, r2)
		}
	})
}

// INV 2 — a HARD facet monster appears IFF an instantiated NON-soft facet has no living pair;
// X never produces a hard monster.
func TestProp_HardMonsterIffMissingNonSoftPair(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		layers, mirrors := genCut(t)
		r := facetcomplete.ComputeFacetCompleteness(layers, mirrors)

		// Rebuild the living facet index independently to cross-check.
		living := map[records.LayerRef]map[facets.Facet]bool{}
		for _, m := range mirrors {
			if !m.Facet.IsCanonical() || !m.Mirror.IsLiving() {
				continue
			}
			set := living[m.Mirror.Reflects]
			if set == nil {
				set = map[facets.Facet]bool{}
				living[m.Mirror.Reflects] = set
			}
			set[m.Facet] = true
		}

		// Build the expected hard-monster (layer,facet) set.
		expected := map[[2]string]bool{}
		for _, l := range layers {
			ref := l.Layer.Ref()
			for _, in := range l.Facets.Instances {
				if !in.HasIntent || in.Facet.IsSoft() {
					continue
				}
				if !living[ref][in.Facet] {
					expected[[2]string{l.Layer.LayerID, string(in.Facet)}] = true
				}
			}
		}
		got := map[[2]string]bool{}
		for _, m := range r.Facet {
			if m.Advisory {
				t.Fatalf("a hard-list monster must never be advisory: %+v", m)
			}
			if m.Facet.IsSoft() {
				t.Fatalf("X must never be a HARD facet monster: %+v", m)
			}
			got[[2]string{m.LayerID, string(m.Facet)}] = true
		}
		if !reflect.DeepEqual(expected, got) {
			t.Fatalf("hard facet monster set mismatch:\nexpected %v\ngot      %v", expected, got)
		}
	})
}

// INV 3 — additive: the test_kind plane is EXACTLY records.ComputeCompleteness.
func TestProp_TestKindPlaneIsExactlyS06(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		layers, mirrors := genCut(t)
		r := facetcomplete.ComputeFacetCompleteness(layers, mirrors)

		bl := make([]records.Layer, 0, len(layers))
		for _, l := range layers {
			bl = append(bl, l.Layer)
		}
		bm := make([]records.Mirror, 0, len(mirrors))
		for _, m := range mirrors {
			bm = append(bm, m.Mirror)
		}
		s06 := records.ComputeCompleteness(bm, bl)
		if !reflect.DeepEqual(s06.Monsters, r.TestKind) {
			t.Fatalf("FK04 altered the S06 test_kind monster set:\nS06 %+v\nFK04 %+v", s06.Monsters, r.TestKind)
		}
	})
}

// INV 4 — anti over-constraint: an UNDECLARED facet never produces a monster.
func TestProp_UndeclaredFacetNeverAMonster(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		layers, mirrors := genCut(t)
		r := facetcomplete.ComputeFacetCompleteness(layers, mirrors)

		declared := map[[2]string]bool{}
		for _, l := range layers {
			for _, in := range l.Facets.Instances {
				if in.HasIntent {
					declared[[2]string{l.Layer.LayerID, string(in.Facet)}] = true
				}
			}
		}
		all := append(append([]facetcomplete.FacetMonster{}, r.Facet...), r.Advisory...)
		for _, m := range all {
			if !declared[[2]string{m.LayerID, string(m.Facet)}] {
				t.Fatalf("a monster on an UNDECLARED facet (§13.4 over-constraint): %+v", m)
			}
		}
	})
}

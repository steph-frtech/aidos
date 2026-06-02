package qd_test

// PROPERTY MIRROR (∀) for archive.qd.Elites — conceptually stored in the `mirrors` schema,
// materialized here for the Go runner (rapid is the frozen invariant slot, ADR 0003).
//
//	# reflects: archive.qd.Elites · test_kind: property · cert_language: rapid · authority: below
//
// The invariants are KRD §62/§123 (the Judge is the deterministic mirror; one élite per niche):
//
//  1. DETERMINISTIC + TOTAL. ∀ inputs ⇒ same élite map.
//  2. NO GREEN ⇒ NO ÉLITE. A variant with mirror != green NEVER appears as any niche élite.
//  3. ONE ÉLITE PER NICHE, and it is the GREEN variant with MAX anchored fitness in that niche.
//  4. NEVER INVENTS. Every élite traces to a real input variant; no niche key/fitness is fabricated.
//  5. NEVER PANICS. ∀ input (incl. nil / empty niche / mixed) ⇒ a result, never a crash.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/qd"
	"pgregory.net/rapid"
)

func genVariant(t *rapid.T, label string) qd.Variant {
	mirror := qd.MirrorRed
	if rapid.Bool().Draw(t, label+"-green") {
		mirror = qd.MirrorGreen
	}
	return qd.Variant{
		ID:      "v-" + rapid.StringMatching(`[a-z0-9]{1,8}`).Draw(t, label+"-id"),
		Niche:   rapid.SampledFrom([]string{"n1", "n2", "n3", ""}).Draw(t, label+"-niche"),
		Mirror:  mirror,
		Fitness: rapid.Float64Range(0, 1).Draw(t, label+"-fit"),
	}
}

func genVariants(t *rapid.T) []qd.Variant {
	vs := rapid.SliceOfN(rapid.Custom(func(t *rapid.T) qd.Variant { return genVariant(t, "v") }), 0, 10).Draw(t, "variants")
	// distinct ids so ties resolve deterministically by id.
	for i := range vs {
		vs[i].ID = "v" + rapid.StringMatching(`[a-z0-9]{8}`).Draw(t, "uid")
	}
	return vs
}

func TestProp_DeterministicTotal(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		vs := genVariants(t)
		a := qd.Elites(vs)
		b := qd.Elites(vs)
		if len(a) != len(b) {
			t.Fatalf("non-deterministic niche count: %d vs %d", len(a), len(b))
		}
		for k, va := range a {
			if vb, ok := b[k]; !ok || vb.ID != va.ID {
				t.Fatalf("non-deterministic élite for niche %q: %+v vs %+v", k, va, b[k])
			}
		}
	})
}

func TestProp_NoGreenNoElite(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		vs := genVariants(t)
		elites := qd.Elites(vs)
		// every élite must be a GREEN variant.
		for niche, e := range elites {
			if e.Mirror != qd.MirrorGreen {
				t.Fatalf("niche %q élite %q is not green (the Judge is the mirror): %+v", niche, e.ID, e)
			}
		}
		// a niche whose ALL candidates are red must have NO élite.
		byNiche := map[string]bool{} // niche -> has a green candidate
		for _, v := range vs {
			if v.Mirror == qd.MirrorGreen {
				byNiche[v.Niche] = true
			} else if _, seen := byNiche[v.Niche]; !seen {
				byNiche[v.Niche] = false
			}
		}
		for niche, hasGreen := range byNiche {
			_, filled := elites[niche]
			if !hasGreen && filled {
				t.Fatalf("niche %q has only red candidates but an élite was promoted (no promotion without a green mirror)", niche)
			}
		}
	})
}

func TestProp_OneElitePerNicheMaxFitness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		vs := genVariants(t)
		elites := qd.Elites(vs)
		// compute the expected max-anchored-fitness green variant per niche, tie by smaller id.
		best := map[string]qd.Variant{}
		for _, v := range vs {
			if v.Mirror != qd.MirrorGreen {
				continue
			}
			cur, ok := best[v.Niche]
			if !ok || v.Fitness > cur.Fitness || (v.Fitness == cur.Fitness && v.ID < cur.ID) {
				best[v.Niche] = v
			}
		}
		if len(elites) != len(best) {
			t.Fatalf("niche count mismatch: elites=%d, expected=%d", len(elites), len(best))
		}
		for niche, want := range best {
			got, ok := elites[niche]
			if !ok {
				t.Fatalf("niche %q must have an élite", niche)
			}
			if got.ID != want.ID {
				t.Fatalf("niche %q élite = %q, want max-anchored-fitness green = %q", niche, got.ID, want.ID)
			}
		}
	})
}

func TestProp_NeverInvents(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		vs := genVariants(t)
		elites := qd.Elites(vs)
		ids := map[string]qd.Variant{}
		for _, v := range vs {
			ids[v.ID] = v
		}
		for niche, e := range elites {
			src, ok := ids[e.ID]
			if !ok {
				t.Fatalf("élite %q in niche %q does not trace to any input variant (invented)", e.ID, niche)
			}
			if src.Niche != niche || src.Fitness != e.Fitness {
				t.Fatalf("élite for niche %q fabricated a niche/fitness: src=%+v élite=%+v", niche, src, e)
			}
		}
	})
}

func TestProp_NeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		_ = qd.Elites(nil)
		_ = qd.Elites([]qd.Variant{})
		_ = qd.Elites([]qd.Variant{{}})
		_ = qd.Elites([]qd.Variant{{ID: "x", Mirror: "weird", Niche: ""}})
		_ = qd.Niche(qd.Variant{})
	})
}

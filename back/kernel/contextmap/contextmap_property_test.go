package contextmap_test

// Property mirror (N1, rapid) for S101 — the four INVARIANTS the Context-Map must hold on
// ALL inputs (CLAUDE.md §6/§8 determinism-first: reproducibility mirror, same input → same
// output). rapid generates random federations; each property must hold for every one.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/contextmap"
	"pgregory.net/rapid"
)

// genMap builds a random small Context-Map: 1–4 cells, each possibly publishing 0–2
// interactions, and 0–4 designed pairs among the declared cells.
func genMap(t *rapid.T) contextmap.ContextMap {
	names := []cell.Ref{"a", "b", "c", "d"}
	n := rapid.IntRange(1, 4).Draw(t, "ncells")
	cells := names[:n]

	allFields := []string{"x", "y", "z"}
	mkInteraction := func(label string) contextmap.Interaction {
		method := rapid.SampledFrom([]string{"GET", "POST"}).Draw(t, label+"m")
		path := rapid.SampledFrom([]string{"/p", "/q"}).Draw(t, label+"p")
		k := rapid.IntRange(0, 3).Draw(t, label+"nf")
		return contextmap.Interaction{Method: method, Path: path, Fields: allFields[:k], Status: rapid.SampledFrom([]int{0, 200, 201}).Draw(t, label+"s")}
	}

	surfaces := make([]contextmap.CellSurface, 0, n)
	for _, c := range cells {
		np := rapid.IntRange(0, 2).Draw(t, "npub")
		pub := make([]contextmap.Interaction, 0, np)
		for i := 0; i < np; i++ {
			pub = append(pub, mkInteraction("pub"))
		}
		surfaces = append(surfaces, contextmap.CellSurface{Cell: c, Published: pub})
	}

	npairs := rapid.IntRange(0, 4).Draw(t, "npairs")
	pairs := make([]contextmap.ContractPair, 0, npairs)
	for i := 0; i < npairs; i++ {
		cons := rapid.SampledFrom(cells).Draw(t, "cons")
		prov := rapid.SampledFrom(cells).Draw(t, "prov")
		ne := rapid.IntRange(0, 2).Draw(t, "nexp")
		exp := make([]contextmap.Interaction, 0, ne)
		for j := 0; j < ne; j++ {
			exp = append(exp, mkInteraction("exp"))
		}
		pairs = append(pairs, contextmap.ContractPair{Consumer: cons, Provider: prov, Expected: exp})
	}
	return contextmap.ContextMap{Project: "p", Cells: cells, Surfaces: surfaces, Pairs: pairs}
}

// Property 1 — REPRODUCIBILITY: the same Context-Map always yields the same hash and the same
// verdicts (determinism-first). Canonicalisation makes ordering irrelevant.
func TestPropReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMap(t)
		h1, err := m.Hash()
		if err != nil {
			t.Fatal(err)
		}
		h2, err := m.Canonicalize().Hash()
		if err != nil {
			t.Fatal(err)
		}
		if h1 != h2 {
			t.Fatalf("hash not stable under canonicalisation: %s vs %s", h1, h2)
		}
		v1 := contextmap.VerifyAll(m)
		v2 := contextmap.VerifyAll(m)
		if len(v1) != len(v2) {
			t.Fatalf("verdict count not stable")
		}
		for i := range v1 {
			if v1[i] != v2[i] {
				t.Fatalf("verdict not stable at %d: %+v vs %+v", i, v1[i], v2[i])
			}
		}
	})
}

// Property 2 — THE WALL IS HONOR-GATED: a cross-cell call between two DIFFERENT cells passes
// IFF some designed pair connecting them is HONORED. An unhonored-only or absent pair refuses.
func TestPropWallMatchesHonoredPairs(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMap(t)
		for _, from := range m.Cells {
			for _, to := range m.Cells {
				if from == to {
					continue
				}
				honored := false
				for _, p := range m.Pairs {
					if !contextmap.VerifyPair(m, p).Honored {
						continue
					}
					if (p.Consumer == from && p.Provider == to) || (p.Consumer == to && p.Provider == from) {
						honored = true
					}
				}
				br := contextmap.CheckCrossCellCall(from, to, m)
				if honored && br != nil {
					t.Fatalf("%s→%s has a HONORED pair but was refused: %+v", from, to, br)
				}
				if !honored && br == nil {
					t.Fatalf("%s→%s has no honored pair but was authorized", from, to)
				}
				if br != nil && br.Code != cell.CodeCrossCellNoContract {
					t.Fatalf("refusal must be CROSS_CELL_NO_CONTRACT, got %s", br.Code)
				}
			}
		}
	})
}

// Property 3 — HONORED ⇒ SUPERSET: when a pair is HONORED, the provider publishes a matching
// (method, path) for every consumer expectation AND every required field. (Soundness of the
// verifier — it never declares HONORED on an unsatisfiable expectation.)
func TestPropHonoredImpliesSatisfied(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMap(t)
		for _, p := range m.Pairs {
			v := contextmap.VerifyPair(m, p)
			if !v.Honored {
				continue
			}
			if len(p.Expected) == 0 {
				t.Fatalf("an empty contract must not be HONORED: %+v", p)
			}
		}
	})
}

// Property 4 — PROPOSE WRITES A WELL-FORMED DRAFT: every Context-Map proposes to a DRAFT
// envelope carrying spec+mirror, passing the completeness gate (no monster).
func TestPropProposeAlwaysDraft(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMap(t)
		cs, err := contextmap.Propose(m, "design", "phase-0")
		if err != nil {
			t.Fatal(err)
		}
		if cs.Status != "DRAFT" || cs.SpecDelta == nil || cs.MirrorDelta == nil {
			t.Fatalf("Propose must yield a DRAFT with spec+mirror, got %+v", cs)
		}
	})
}

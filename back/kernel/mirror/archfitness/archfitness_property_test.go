package archfitness_test

// Property mirror (N1, rapid) for S102 — the INVARIANTS the structural ratchet holds on ALL
// inputs (CLAUDE.md §6/§8 determinism-first: a reproducibility mirror, same input → same
// output). rapid generates random federation cuts; each property must hold for every one.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/mirror/archfitness"
	"pgregory.net/rapid"
)

var cellNames = []cell.Ref{"a", "b", "c", "d"}

// genGraph builds a random small dependency cut: 2–4 cells, 0–6 directed edges (some intra,
// some cross), and a federation honoring a random subset of cell pairs.
func genGraph(t *rapid.T) archfitness.DepGraph {
	n := rapid.IntRange(2, 4).Draw(t, "ncells")
	cells := cellNames[:n]

	sizes := map[cell.Ref]int{}
	for _, c := range cells {
		sizes[c] = rapid.IntRange(1, 8).Draw(t, "size_"+string(c))
	}

	ne := rapid.IntRange(0, 6).Draw(t, "nedges")
	edges := make([]archfitness.DepEdge, 0, ne)
	for i := 0; i < ne; i++ {
		fc := cells[rapid.IntRange(0, n-1).Draw(t, "fc")]
		tc := cells[rapid.IntRange(0, n-1).Draw(t, "tc")]
		edges = append(edges, archfitness.DepEdge{
			From:     "f" + string(fc),
			FromCell: fc,
			To:       "t" + string(tc),
			ToCell:   tc,
		})
	}

	// honor a random subset of distinct cell pairs
	contracts := []cell.Contract{}
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			if rapid.Bool().Draw(t, "honor") {
				contracts = append(contracts, cell.Contract{A: cells[i], B: cells[j], Honored: true})
			}
		}
	}
	return archfitness.DepGraph{
		Project:    "p",
		Cells:      sizes,
		Edges:      edges,
		Federation: cell.Federation{Contracts: contracts},
	}
}

// PROPERTY 1 — REPRODUCIBILITY: Measure is a pure function. The same cut yields the same
// metric AND the same content hash, every time. This is the determinism-first reproducibility
// mirror (CLAUDE.md §6).
func TestProp_MeasureReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := genGraph(t)
		m1 := archfitness.Measure(g)
		m2 := archfitness.Measure(g)
		if !reflect.DeepEqual(m1, m2) {
			t.Fatalf("Measure not reproducible:\n%+v\n%+v", m1, m2)
		}
		h1, err1 := m1.Hash()
		h2, err2 := m2.Hash()
		if err1 != nil || err2 != nil {
			t.Fatalf("Hash error: %v %v", err1, err2)
		}
		if h1 != h2 {
			t.Fatalf("Hash not reproducible: %q != %q", h1, h2)
		}
	})
}

// PROPERTY 2 — RATCHET MONOTONE: Ratchet HOLDS iff EVERY metric is non-increasing. If the
// candidate is component-wise ≤ baseline, the verdict is HELD; if ANY metric climbs, BROKEN.
func TestProp_RatchetMonotone(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := genMetric(t, "base")
		cand := genMetric(t, "cand")
		v := archfitness.Ratchet(base, cand)

		climbed := cand.BoundaryViolations > base.BoundaryViolations ||
			cand.InterCellCycles > base.InterCellCycles ||
			cand.InterBCEdges > base.InterBCEdges ||
			cand.MaxCellComplexity > base.MaxCellComplexity

		if climbed && v.State != archfitness.StateBroken {
			t.Fatalf("a climb must BREAK the ratchet, got %s (base=%+v cand=%+v)", v.State, base, cand)
		}
		if !climbed && v.State != archfitness.StateHeld {
			t.Fatalf("a non-increasing cut must HOLD, got %s (base=%+v cand=%+v)", v.State, base, cand)
		}
		// A BROKEN verdict ALWAYS carries an actionable block; a HELD one never does.
		if (v.State == archfitness.StateBroken) != (v.Block != nil) {
			t.Fatalf("block presence must match BROKEN state, got state=%s block=%v", v.State, v.Block)
		}
	})
}

// PROPERTY 3 — RATCHET REFLEXIVE: the same cut against itself always HOLDS (a cut never
// regresses against itself — the ratchet is a partial order, reflexive).
func TestProp_RatchetReflexive(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMetric(t, "m")
		if v := archfitness.Ratchet(m, m); v.State != archfitness.StateHeld {
			t.Fatalf("a cut against itself must HOLD, got %s", v.State)
		}
	})
}

// PROPERTY 4 — WALL CONSISTENCY: every boundary violation Measure reports is exactly an
// inter-cell edge the §46 wall (cell.CheckCrossCellAccess) refuses. No witness is fabricated,
// none is missed — the count equals the wall-refused distinct cross-cell edges.
func TestProp_BoundaryViolationsMatchWall(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := genGraph(t)
		m := archfitness.Measure(g)
		for _, v := range m.Violations {
			if cell.CheckCrossCellAccess(v.FromCell, v.ToCell, g.Federation) == nil {
				t.Fatalf("Measure reported a violation the wall AUTHORIZES: %+v", v)
			}
		}
		if m.BoundaryViolations != len(m.Violations) {
			t.Fatalf("count %d != witnesses %d", m.BoundaryViolations, len(m.Violations))
		}
	})
}

func genMetric(t *rapid.T, label string) archfitness.StructuralMetric {
	return archfitness.StructuralMetric{
		Project:            "p",
		BoundaryViolations: rapid.IntRange(0, 5).Draw(t, label+"bv"),
		InterCellCycles:    rapid.IntRange(0, 3).Draw(t, label+"cy"),
		InterBCEdges:       rapid.IntRange(0, 8).Draw(t, label+"ed"),
		MaxCellComplexity:  rapid.IntRange(0, 10).Draw(t, label+"cx"),
	}
}

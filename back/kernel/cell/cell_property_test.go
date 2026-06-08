package cell_test

// Property mirror (∀) for the CELL partition primitive (KRD §43–§51, app-builder S100).
// reflects=kernel.cell · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (the invariants are computational properties of the pure Partition /
// CellPack / CheckCrossCellAccess / Ships; the §46 RULE — which cells exist, which contract —
// is the human's, above the line, pinned by the fixture). Run via `go test` (rapid is the
// frozen invariant slot, ADR 0003).
//
// The invariants are the S100 done-criteria + §43–§46:
//
//  1. CellPack EXCLUDES NEIGHBOR INTERNALS (the done-criterion, half 1). For any project and
//     any target cell, the pack's OwnLayers/OwnMirrors contain ONLY the target's nodes, and
//     NeighborContracts contain ONLY PUBLIC contracts of CONTRACTED neighbors — never a
//     neighbor's layer/mirror/non-public contract. PackHasNeighborInternal is always false.
//  2. CROSS-CELL ACCESS WITHOUT A CONTRACT IS REFUSED (the done-criterion, half 2). For two
//     distinct cells with no honored contract, CheckCrossCellAccess returns a
//     CROSS_CELL_NO_CONTRACT BlockReason; with a honored contract (or own cell) it returns nil.
//  3. PURE + DETERMINISTIC + REPRODUCIBLE. Same input ⇒ byte-identical pack + identical hash;
//     Partition/CheckCrossCellAccess never panic and are total.
//  4. FRACTAL SHIPPING (§43). A cell ships iff its OWN ratchet is green, INDEPENDENT of the
//     federation: flipping a sibling's ratchet never changes whether THIS cell ships.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"pgregory.net/rapid"
)

// genCellRef draws a small alphabet of cell refs so collisions/contracts actually occur.
func genCellRef(t *rapid.T, n string) cell.Ref {
	return cell.Ref(rapid.SampledFrom([]string{"checkout", "billing", "catalog", "shipping"}).Draw(t, n))
}

func genKind(t *rapid.T, n string) cell.NodeKind {
	return rapid.SampledFrom([]cell.NodeKind{cell.KindLayer, cell.KindMirror, cell.KindContract}).Draw(t, n)
}

// genProject builds a valid project (every node assigned, known kinds, unique ids).
func genProject(t *rapid.T) cell.Project {
	count := rapid.IntRange(0, 12).Draw(t, "node_count")
	nodes := make([]cell.Node, 0, count)
	for i := 0; i < count; i++ {
		k := genKind(t, "kind")
		n := cell.Node{
			ID:   "n" + rapid.StringMatching(`[0-9a-f]{4}`).Draw(t, "id"),
			Cell: genCellRef(t, "cell"),
			Kind: k,
		}
		if k == cell.KindContract {
			n.Public = rapid.Bool().Draw(t, "public")
		}
		nodes = append(nodes, n)
	}
	// de-dup ids (Partition does not require uniqueness, but CellPack/PackHasNeighborInternal
	// look up by id, so distinct ids keep the assertions unambiguous).
	seen := map[string]bool{}
	uniq := nodes[:0]
	for _, n := range nodes {
		if seen[n.ID] {
			continue
		}
		seen[n.ID] = true
		uniq = append(uniq, n)
	}
	return cell.Project{ID: "proj-" + rapid.StringMatching(`[a-z]{3}`).Draw(t, "proj"), Nodes: uniq}
}

func genFederation(t *rapid.T) cell.Federation {
	count := rapid.IntRange(0, 4).Draw(t, "contract_count")
	cs := make([]cell.Contract, 0, count)
	for i := 0; i < count; i++ {
		cs = append(cs, cell.Contract{
			A:       genCellRef(t, "a"),
			B:       genCellRef(t, "b"),
			Honored: rapid.Bool().Draw(t, "honored"),
		})
	}
	return cell.Federation{Contracts: cs}
}

// Invariant 1 — CellPack never leaks a neighbor internal.
func TestCellPackExcludesNeighborInternals(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		p := genProject(t)
		fed := genFederation(t)
		target := genCellRef(t, "target")

		pack := cell.CellPack(p, target, fed)

		if cell.PackHasNeighborInternal(pack, p) {
			t.Fatalf("pack for cell %q leaked a neighbor internal", target)
		}
		// every Own* id belongs to the target cell; every NeighborContract is a PUBLIC contract
		// of a DIFFERENT, CONTRACTED cell.
		byID := map[string]cell.Node{}
		for _, n := range p.Nodes {
			byID[n.ID] = n
		}
		for _, id := range append(append(append([]string{}, pack.OwnLayers...), pack.OwnMirrors...), pack.OwnContracts...) {
			if byID[id].Cell != target {
				t.Fatalf("own node %q is not in target cell %q (cell=%q)", id, target, byID[id].Cell)
			}
		}
		for _, id := range pack.NeighborContracts {
			n := byID[id]
			if n.Cell == target {
				t.Fatalf("neighbor-contract %q is actually in the target cell", id)
			}
			if n.Kind != cell.KindContract || !n.Public {
				t.Fatalf("neighbor-contract %q is not a public contract (kind=%q public=%v)", id, n.Kind, n.Public)
			}
			if cell.CheckCrossCellAccess(target, n.Cell, fed) != nil {
				t.Fatalf("neighbor-contract %q crossed from a NON-contracted cell %q", id, n.Cell)
			}
		}
	})
}

// Invariant 2 — cross-cell access without a contract is refused; with a contract it passes.
func TestCrossCellAccessGate(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		fed := genFederation(t)
		from := genCellRef(t, "from")
		to := genCellRef(t, "to")

		br := cell.CheckCrossCellAccess(from, to, fed)

		honored := from == to
		for _, c := range fed.Contracts {
			if c.Honored && ((c.A == from && c.B == to) || (c.A == to && c.B == from)) {
				honored = true
			}
		}
		if honored {
			if br != nil {
				t.Fatalf("contracted/own access %q→%q refused: %v", from, to, br)
			}
		} else {
			if br == nil {
				t.Fatalf("non-contracted access %q→%q was NOT refused", from, to)
			}
			if br.Code != cell.CodeCrossCellNoContract {
				t.Fatalf("wrong refusal code %q (want %q)", br.Code, cell.CodeCrossCellNoContract)
			}
		}
	})
}

// Invariant 3 — CellPack is reproducible (same input ⇒ identical pack + hash).
func TestCellPackReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		p := genProject(t)
		fed := genFederation(t)
		target := genCellRef(t, "target")

		a := cell.CellPack(p, target, fed)
		b := cell.CellPack(p, target, fed)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("CellPack not reproducible:\n a=%+v\n b=%+v", a, b)
		}
		if a.Hash == "" {
			t.Fatalf("CellPack hash is empty")
		}
		if a.Hash != b.Hash {
			t.Fatalf("CellPack hash not stable: %q vs %q", a.Hash, b.Hash)
		}
	})
}

// Invariant 4 — fractal shipping: a cell's shippability is independent of its siblings.
func TestFractalShipping(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		p := genProject(t)
		// assign a random ratchet per distinct cell.
		ratchets := map[cell.Ref]cell.RatchetState{}
		for _, n := range p.Nodes {
			if _, ok := ratchets[n.Cell]; !ok {
				if rapid.Bool().Draw(t, "green") {
					ratchets[n.Cell] = cell.RatchetGreen
				} else {
					ratchets[n.Cell] = cell.RatchetRed
				}
			}
		}
		p.Ratchets = ratchets
		cells, err := cell.Partition(p)
		if err != nil {
			t.Fatalf("Partition errored on a valid project: %v", err)
		}
		for _, c := range cells {
			want := ratchets[c.Ref] == cell.RatchetGreen
			if cell.Ships(c) != want {
				t.Fatalf("cell %q ships=%v but ratchet=%q", c.Ref, cell.Ships(c), c.Ratchet)
			}
		}
	})
}

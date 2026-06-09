package cockpit_test

// S105 §50 REPRODUCIBILITY MIRROR (rapid) — the cockpit assembler is a PURE function: same
// input ⇒ byte-identical snapshot (determinism), a reddened cell NEVER ships, a non-reddened
// green cell ALWAYS ships, and the federation is globally stable IFF every cell ships ∧ the
// structural ratchet held. No LLM, no clock, no rng enters the loop (CLAUDE.md §6/§8).

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/mirror/archfitness"
	"github.com/steph-frtech/aidos/back/runtime/cockpit"
	"pgregory.net/rapid"
)

// genFixture draws a small random federation: 1..4 cells, each green or red, with a random
// honored contract, a random active wave, and a baseline equal to the cut (structural HELD).
func genFixture(t *rapid.T) (cell.Project, cell.Federation, archfitness.DepGraph, cockpit.FanOutSpec) {
	refs := []cell.Ref{"order", "payment", "shipping", "billing"}
	n := rapid.IntRange(1, 4).Draw(t, "ncells")
	chosen := refs[:n]

	nodes := []cell.Node{}
	ratchets := map[cell.Ref]cell.RatchetState{}
	cells := map[cell.Ref]int{}
	wave := cockpit.FanOutSpec{PolicyWaveID: "w0"}
	for _, r := range chosen {
		nodes = append(nodes,
			cell.Node{ID: string(r) + "-op", Cell: r, Kind: cell.KindLayer},
			cell.Node{ID: string(r) + "-contract", Cell: r, Kind: cell.KindContract, Public: true},
		)
		cells[r] = 2
		if rapid.Bool().Draw(t, "green-"+string(r)) {
			ratchets[r] = cell.RatchetGreen
		} else {
			ratchets[r] = cell.RatchetRed
		}
		wave.Cells = append(wave.Cells, cockpit.CellViolation{
			Cell:     string(r),
			Violates: rapid.Bool().Draw(t, "viol-"+string(r)),
		})
	}
	p := cell.Project{ID: "p", Nodes: nodes, Ratchets: ratchets}
	fed := cell.Federation{}
	if n >= 2 && rapid.Bool().Draw(t, "contract") {
		fed.Contracts = append(fed.Contracts, cell.Contract{A: chosen[0], B: chosen[1], Honored: true})
	}
	g := archfitness.DepGraph{Project: "p", Cells: cells, Edges: nil, Federation: fed}
	return p, fed, g, wave
}

// Determinism: the same input ⇒ a byte-identical snapshot (reflect.DeepEqual).
func TestCockpit_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		p, fed, g, wave := genFixture(t)
		base := archfitness.Measure(g)
		a, err := cockpit.AssembleSnapshot(p, g, base, fed, wave)
		if err != nil {
			t.Fatalf("first assemble: %v", err)
		}
		b, err := cockpit.AssembleSnapshot(p, g, base, fed, wave)
		if err != nil {
			t.Fatalf("second assemble: %v", err)
		}
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("non-deterministic snapshot:\n%+v\n%+v", a, b)
		}
	})
}

// Invariants: a reddened cell never ships; a green non-reddened cell always ships; globally
// stable iff every cell ships ∧ structural held; outputs sorted.
func TestCockpit_Invariants(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		p, fed, g, wave := genFixture(t)
		base := archfitness.Measure(g) // candidate == baseline ⇒ structural HELD
		snap, err := cockpit.AssembleSnapshot(p, g, base, fed, wave)
		if err != nil {
			t.Fatalf("assemble: %v", err)
		}

		violates := map[string]bool{}
		for _, cv := range wave.Cells {
			violates[cv.Cell] = cv.Violates
		}

		shipCount := 0
		prev := ""
		for _, c := range snap.Cells {
			if c.Cell < prev {
				t.Fatalf("cells not sorted: %s after %s", c.Cell, prev)
			}
			prev = c.Cell

			if c.Reddened && c.Ships {
				t.Fatalf("a reddened cell must NEVER ship: %s", c.Cell)
			}
			if c.Behavioural == cell.RatchetGreen && !violates[c.Cell] && !c.Ships {
				t.Fatalf("a green non-violating cell must ALWAYS ship: %s", c.Cell)
			}
			if c.Reddened != violates[c.Cell] {
				t.Fatalf("reddened must equal violates for %s", c.Cell)
			}
			if c.Ships {
				shipCount++
			}
		}

		wantGlobal := shipCount == len(snap.Cells) && snap.Structural.State == archfitness.StateHeld
		if snap.GloballyStable != wantGlobal {
			t.Fatalf("GloballyStable=%v want %v (ships %d/%d, structural %s)",
				snap.GloballyStable, wantGlobal, shipCount, len(snap.Cells), snap.Structural.State)
		}

		// ShippableCells / ReddenedCells are sorted projections consistent with the rows.
		if !sortedStrs(snap.ShippableCells) {
			t.Fatalf("ShippableCells not sorted: %v", snap.ShippableCells)
		}
		if !sortedStrs(snap.ReddenedCells) {
			t.Fatalf("ReddenedCells not sorted: %v", snap.ReddenedCells)
		}
	})
}

func sortedStrs(s []string) bool {
	for i := 1; i < len(s); i++ {
		if s[i] < s[i-1] {
			return false
		}
	}
	return true
}

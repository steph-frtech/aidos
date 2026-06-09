package cockpit_test

// S105 §50 FIXTURE MIRROR — the federation cockpit done-criterion, written first (red), the
// code drives it green. The ROADMAP done-criterion (line 188):
//
//   « deux cellules, un contrat, un red wave transverse ; une cellule montre une coupe locale
//     verte et SHIP pendant qu'une voisine est encore ROUGE. »
//
// The mirror REUSES the prior steps' engines verbatim (cell.Partition, archfitness.Measure/
// Ratchet) — it asserts the COCKPIT COMPOSITION, never re-tests the parts. Three scenarios:
//
//   (1) two cells (order + payment), one honored contract, a transverse red wave that reddens
//       ONLY `payment`: `order` shows a green local cut and SHIPS while `payment` is still RED;
//   (2) with no active wave and a green structural ratchet, the whole federation is globally
//       stable (every cell ships);
//   (3) a structural regression (a new boundary violation) reddens the SECOND ratchet and makes
//       the federation NOT globally stable, INDEPENDENT of the (green) behavioural cells.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/mirror/archfitness"
	"github.com/steph-frtech/aidos/back/runtime/cockpit"
)

// twoCellProject is the canonical §50 fixture: two cells, order green + payment green, each with
// its own nodes; one honored order↔payment contract.
func twoCellProject() (cell.Project, cell.Federation, archfitness.DepGraph) {
	p := cell.Project{
		ID: "proj-shop",
		Nodes: []cell.Node{
			{ID: "order-op", Cell: "order", Kind: cell.KindLayer},
			{ID: "order-mirror", Cell: "order", Kind: cell.KindMirror},
			{ID: "order-contract", Cell: "order", Kind: cell.KindContract, Public: true},
			{ID: "payment-op", Cell: "payment", Kind: cell.KindLayer},
			{ID: "payment-mirror", Cell: "payment", Kind: cell.KindMirror},
			{ID: "payment-contract", Cell: "payment", Kind: cell.KindContract, Public: true},
		},
		Ratchets: map[cell.Ref]cell.RatchetState{
			"order":   cell.RatchetGreen,
			"payment": cell.RatchetGreen,
		},
	}
	fed := cell.Federation{Contracts: []cell.Contract{
		{A: "order", B: "payment", Honored: true},
	}}
	g := archfitness.DepGraph{
		Project: "proj-shop",
		Cells:   map[cell.Ref]int{"order": 3, "payment": 3},
		Edges: []archfitness.DepEdge{
			// one HONORED inter-cell edge (order's contract → payment's contract) — not a violation.
			{From: "order-contract", FromCell: "order", To: "payment-contract", ToCell: "payment"},
		},
		Federation: fed,
	}
	return p, fed, g
}

// Scenario 1: the §50 done-criterion — a transverse red wave reddens ONLY payment; order ships green.
func TestCockpit_RedWave_OneCellShipsWhileNeighborRed(t *testing.T) {
	p, fed, g := twoCellProject()
	baseline := archfitness.Measure(g) // baseline == candidate ⇒ structural ratchet HELD

	wave := cockpit.FanOutSpec{
		PolicyWaveID: "wave-pii-1",
		Cells: []cockpit.CellViolation{
			{Cell: "order", Violates: false},  // order does NOT violate ⇒ stays green
			{Cell: "payment", Violates: true}, // payment violates ⇒ reddened
		},
	}

	snap, err := cockpit.AssembleSnapshot(p, g, baseline, fed, wave)
	if err != nil {
		t.Fatalf("AssembleSnapshot: %v", err)
	}

	// Two cells, one contract on the graph.
	if len(snap.Cells) != 2 {
		t.Fatalf("want 2 cells, got %d", len(snap.Cells))
	}
	if len(snap.Contracts) != 1 || !snap.Contracts[0].Honored {
		t.Fatalf("want 1 honored contract, got %+v", snap.Contracts)
	}

	byCell := map[string]cockpit.CellRatchets{}
	for _, c := range snap.Cells {
		byCell[c.Cell] = c
	}

	// payment is reddened by the transverse wave: it does NOT ship, it carries a worklist.
	if !byCell["payment"].Reddened {
		t.Fatalf("payment must be reddened by the transverse wave")
	}
	if byCell["payment"].Ships {
		t.Fatalf("a reddened cell must NOT ship")
	}
	if len(byCell["payment"].Queue) != 1 {
		t.Fatalf("payment must reconcile locally via a one-row worklist, got %v", byCell["payment"].Queue)
	}

	// order shows a green local cut and SHIPS while payment is still red (the §43 fractal).
	if byCell["order"].Reddened {
		t.Fatalf("order must NOT be reddened (it does not violate the policy)")
	}
	if !byCell["order"].Ships {
		t.Fatalf("order must SHIP its green local cut while payment is red (§50 done-criterion)")
	}
	if byCell["order"].Behavioural != cell.RatchetGreen {
		t.Fatalf("order's behavioural ratchet must be green")
	}

	// The cockpit projections: order ships, payment is reddened, federation NOT globally stable.
	if got := snap.ShippableCells; len(got) != 1 || got[0] != "order" {
		t.Fatalf("ShippableCells must be exactly [order], got %v", got)
	}
	if got := snap.ReddenedCells; len(got) != 1 || got[0] != "payment" {
		t.Fatalf("ReddenedCells must be exactly [payment], got %v", got)
	}
	if snap.GloballyStable {
		t.Fatalf("federation must NOT be globally stable while payment is red")
	}
	// The structural ratchet held (no new violation) even though the federation is locally in flux.
	if snap.Structural.State != archfitness.StateHeld {
		t.Fatalf("structural ratchet must hold, got %s", snap.Structural.State)
	}
}

// Scenario 2: no active wave + structural HELD ⇒ the whole federation is globally stable.
func TestCockpit_NoWave_GloballyStable(t *testing.T) {
	p, fed, g := twoCellProject()
	baseline := archfitness.Measure(g)

	snap, err := cockpit.AssembleSnapshot(p, g, baseline, fed, cockpit.FanOutSpec{})
	if err != nil {
		t.Fatalf("AssembleSnapshot: %v", err)
	}
	if len(snap.ShippableCells) != 2 {
		t.Fatalf("both cells must ship with no active wave, got %v", snap.ShippableCells)
	}
	if len(snap.ReddenedCells) != 0 {
		t.Fatalf("no cell reddened with no wave, got %v", snap.ReddenedCells)
	}
	if !snap.GloballyStable {
		t.Fatalf("federation must be globally stable (all ship ∧ structural held)")
	}
}

// Scenario 3: a structural regression (a new UN-contracted inter-cell edge) reddens the SECOND
// ratchet and makes the federation NOT globally stable — INDEPENDENT of the green behavioural cells.
func TestCockpit_StructuralRegression_BreaksGlobalStability(t *testing.T) {
	p, fed, baselineGraph := twoCellProject()
	baseline := archfitness.Measure(baselineGraph)

	// The candidate cut adds a NEW boundary violation: an inter-cell edge with NO honored contract.
	candidateGraph := baselineGraph
	candidateGraph.Edges = append([]archfitness.DepEdge{}, baselineGraph.Edges...)
	candidateGraph.Edges = append(candidateGraph.Edges, archfitness.DepEdge{
		From: "order-op", FromCell: "order", To: "payment-op", ToCell: "payment",
	})

	snap, err := cockpit.AssembleSnapshot(p, candidateGraph, baseline, fed, cockpit.FanOutSpec{})
	if err != nil {
		t.Fatalf("AssembleSnapshot: %v", err)
	}
	if snap.Structural.State != archfitness.StateBroken {
		t.Fatalf("a new boundary violation must BREAK the structural ratchet, got %s", snap.Structural.State)
	}
	if snap.Structural.Block == nil {
		t.Fatalf("a broken structural ratchet must carry an actionable BlockReason")
	}
	// Both behavioural cells are green and would ship — yet the federation is NOT globally stable.
	if len(snap.ShippableCells) != 2 {
		t.Fatalf("behavioural cells still ship, got %v", snap.ShippableCells)
	}
	if snap.GloballyStable {
		t.Fatalf("a broken structural ratchet must make the federation NOT globally stable, even with green cells")
	}
}

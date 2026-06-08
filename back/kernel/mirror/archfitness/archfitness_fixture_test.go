package archfitness

import "testing"

import "github.com/steph-frtech/aidos/back/kernel/cell"

// fixture mirror (S102) — the canonical structural-ratchet scenarios over the checkout/billing
// /catalog federation S100/S101 established. Each is a state → command → verdict fixture: a
// federation cut + the ratchet command → the structural verdict. These pin the DONE-CRITERION:
// a NEW boundary violation or a NEW inter-cell cycle reddens the structural ratchet and BLOCKS
// THE CUT, independent of (green) behavioural mirrors.

// the honored federation S101 left: checkout->billing is contracted & honored; catalog has no
// honored pair (its contract is unhonored — price unpublished). One wall, reused from S100.
func honoredFederation() cell.Federation {
	return cell.Federation{Contracts: []cell.Contract{
		{A: "checkout", B: "billing", Honored: true},
		{A: "checkout", B: "catalog", Honored: false}, // unhonored: a closed door
	}}
}

func cellsBase() map[cell.Ref]int {
	return map[cell.Ref]int{"checkout": 5, "billing": 3, "catalog": 4}
}

func TestMeasure_CleanCut_NoViolationsNoCycles(t *testing.T) {
	// checkout depends on billing across the HONORED contract — a clean inter-BC edge.
	g := DepGraph{
		Project:    "shop",
		Cells:      cellsBase(),
		Federation: honoredFederation(),
		Edges: []DepEdge{
			{From: "checkout.place", FromCell: "checkout", To: "billing.charge", ToCell: "billing"},
			{From: "checkout.place", FromCell: "checkout", To: "checkout.cart", ToCell: "checkout"}, // intra: ignored
		},
	}
	m := Measure(g)
	if m.BoundaryViolations != 0 {
		t.Fatalf("clean cut: want 0 boundary violations, got %d (%v)", m.BoundaryViolations, m.Violations)
	}
	if m.InterCellCycles != 0 {
		t.Fatalf("clean cut: want 0 cycles, got %d", m.InterCellCycles)
	}
	if m.InterBCEdges != 1 {
		t.Fatalf("clean cut: want 1 inter-BC edge (checkout->billing), got %d", m.InterBCEdges)
	}
	if m.MaxCellComplexity != 5 {
		t.Fatalf("clean cut: want max complexity 5 (checkout), got %d", m.MaxCellComplexity)
	}
}

func TestMeasure_BoundaryViolation_UncontractedEdge(t *testing.T) {
	// checkout depends on catalog, but catalog's pair is UNHONORED → boundary violation.
	g := DepGraph{
		Project:    "shop",
		Cells:      cellsBase(),
		Federation: honoredFederation(),
		Edges: []DepEdge{
			{From: "checkout.price", FromCell: "checkout", To: "catalog.lookup", ToCell: "catalog"},
		},
	}
	m := Measure(g)
	if m.BoundaryViolations != 1 {
		t.Fatalf("want 1 boundary violation (checkout->catalog), got %d", m.BoundaryViolations)
	}
	if len(m.Violations) != 1 || m.Violations[0].ToCell != "catalog" {
		t.Fatalf("want the catalog violation witnessed, got %+v", m.Violations)
	}
}

func TestMeasure_InterCellCycle_Tarjan(t *testing.T) {
	// billing depends on checkout AND checkout depends on billing → a 2-cell cycle.
	g := DepGraph{
		Project:    "shop",
		Cells:      cellsBase(),
		Federation: honoredFederation(),
		Edges: []DepEdge{
			{From: "checkout.place", FromCell: "checkout", To: "billing.charge", ToCell: "billing"},
			{From: "billing.refund", FromCell: "billing", To: "checkout.cancel", ToCell: "checkout"},
		},
	}
	m := Measure(g)
	if m.InterCellCycles != 1 {
		t.Fatalf("want 1 inter-cell cycle (checkout<->billing), got %d (%v)", m.InterCellCycles, m.Cycles)
	}
	if len(m.Cycles) != 1 || len(m.Cycles[0]) != 2 {
		t.Fatalf("want one 2-cell cycle, got %v", m.Cycles)
	}
	// canonical sorted member set: billing, checkout
	if m.Cycles[0][0] != "billing" || m.Cycles[0][1] != "checkout" {
		t.Fatalf("want sorted cycle [billing checkout], got %v", m.Cycles[0])
	}
}

func TestRatchet_Held_WhenNothingClimbs(t *testing.T) {
	base := StructuralMetric{Project: "shop", BoundaryViolations: 1, InterCellCycles: 1, InterBCEdges: 4, MaxCellComplexity: 5}
	cand := base // identical
	v := Ratchet(base, cand)
	if v.State != StateHeld {
		t.Fatalf("identical cut must HOLD, got %s (%+v)", v.State, v.Climbs)
	}
	if v.Block != nil {
		t.Fatalf("HELD verdict must carry no block, got %+v", v.Block)
	}
}

func TestRatchet_Held_WhenMetricsImprove(t *testing.T) {
	base := StructuralMetric{BoundaryViolations: 2, InterCellCycles: 1, InterBCEdges: 5, MaxCellComplexity: 7}
	cand := StructuralMetric{BoundaryViolations: 0, InterCellCycles: 0, InterBCEdges: 3, MaxCellComplexity: 5}
	if v := Ratchet(base, cand); v.State != StateHeld {
		t.Fatalf("an improving cut must HOLD, got %s", v.State)
	}
}

func TestRatchet_Broken_NewBoundaryViolation_BlocksCut(t *testing.T) {
	// behavioural mirrors are green (not modeled here — they live in S05); a NEW boundary
	// violation alone must REDDEN the structural ratchet and block the cut. THE DONE-CRITERION.
	base := StructuralMetric{BoundaryViolations: 0, InterCellCycles: 0, InterBCEdges: 2, MaxCellComplexity: 5}
	cand := StructuralMetric{BoundaryViolations: 1, InterCellCycles: 0, InterBCEdges: 3, MaxCellComplexity: 5}
	v := Ratchet(base, cand)
	if v.State != StateBroken {
		t.Fatalf("a new boundary violation must BREAK the ratchet, got %s", v.State)
	}
	if v.Block == nil || v.Block.Code != CodeStructuralRegression {
		t.Fatalf("broken ratchet must carry a STRUCTURAL_REGRESSION block, got %+v", v.Block)
	}
	found := false
	for _, c := range v.Climbs {
		if c.Metric == "boundary_violations" && c.Baseline == 0 && c.Candidate == 1 {
			found = true
		}
	}
	if !found {
		t.Fatalf("the boundary_violations climb (0→1) must be named, got %+v", v.Climbs)
	}
}

func TestRatchet_Broken_NewInterCellCycle_BlocksCut(t *testing.T) {
	base := StructuralMetric{BoundaryViolations: 0, InterCellCycles: 0, InterBCEdges: 4, MaxCellComplexity: 5}
	cand := StructuralMetric{BoundaryViolations: 0, InterCellCycles: 1, InterBCEdges: 4, MaxCellComplexity: 5}
	v := Ratchet(base, cand)
	if v.State != StateBroken {
		t.Fatalf("a new inter-cell cycle must BREAK the ratchet, got %s", v.State)
	}
	if len(v.Climbs) != 1 || v.Climbs[0].Metric != "inter_cell_cycles" {
		t.Fatalf("want the inter_cell_cycles climb named, got %+v", v.Climbs)
	}
}

func TestRatchet_Broken_ComplexityGrowth(t *testing.T) {
	base := StructuralMetric{MaxCellComplexity: 5}
	cand := StructuralMetric{MaxCellComplexity: 9}
	if v := Ratchet(base, cand); v.State != StateBroken {
		t.Fatalf("a swelling cell must BREAK the ratchet, got %s", v.State)
	}
}

func TestPropose_WellFormedDraftEnvelope(t *testing.T) {
	g := DepGraph{
		Project:    "shop",
		Cells:      cellsBase(),
		Federation: honoredFederation(),
		Edges: []DepEdge{
			{From: "checkout.place", FromCell: "checkout", To: "billing.charge", ToCell: "billing"},
		},
	}
	base := StructuralMetric{Project: "shop", BoundaryViolations: 0, InterCellCycles: 0, InterBCEdges: 1, MaxCellComplexity: 5}
	cs, err := Propose(g, base, "structural baseline", "phase-0")
	if err != nil {
		t.Fatalf("Propose error: %v", err)
	}
	if cs.Status != "DRAFT" {
		t.Fatalf("Propose must return a DRAFT changeset, got %q", cs.Status)
	}
	if cs.SpecDelta == nil || cs.MirrorDelta == nil {
		t.Fatalf("Propose envelope must carry BOTH a spec delta and a mirror delta, got spec=%v mirror=%v", cs.SpecDelta, cs.MirrorDelta)
	}
}

package cell_test

// Fixture mirror (N2 workflow + the §46 RULE pinned above the line) for the CELL primitive
// (KRD §43–§51, app-builder S100). reflects=kernel.cell · test_kind=fixture ·
// cert_language=go-fixture · liveness=live · authority=above (the Context-Map — which cells
// exist, which contract — is the human's deliberate design; this fixture pins the canonical
// checkout/billing/catalog federation the agent must honor). Run via `go test`.
//
// The canonical federation (the ubiquitous checkout slice, §145):
//   - cell "checkout": layer ck-op, mirror ck-mir, PUBLIC contract ck-pact.
//   - cell "billing" : layer bl-op (INTERNAL), mirror bl-mir (INTERNAL), PUBLIC contract bl-pact.
//   - cell "catalog" : PUBLIC contract cat-pact — NOT contracted with checkout.
//   - federation: checkout ⇄ billing (honored). checkout ✗ catalog (none).
//
// The two done-criteria, made concrete:
//   - checkout's CellPack carries ck-op/ck-mir/ck-pact + bl-pact (billing's PUBLIC contract),
//     and EXCLUDES bl-op/bl-mir (billing internals) and cat-pact (no contract).
//   - checkout → catalog is REFUSED (CROSS_CELL_NO_CONTRACT); checkout → billing passes.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
)

func canonicalProject() cell.Project {
	return cell.Project{
		ID: "shop",
		Nodes: []cell.Node{
			{ID: "ck-op", Cell: "checkout", Kind: cell.KindLayer},
			{ID: "ck-mir", Cell: "checkout", Kind: cell.KindMirror},
			{ID: "ck-pact", Cell: "checkout", Kind: cell.KindContract, Public: true},
			{ID: "bl-op", Cell: "billing", Kind: cell.KindLayer},
			{ID: "bl-mir", Cell: "billing", Kind: cell.KindMirror},
			{ID: "bl-pact", Cell: "billing", Kind: cell.KindContract, Public: true},
			{ID: "cat-pact", Cell: "catalog", Kind: cell.KindContract, Public: true},
		},
		Ratchets: map[cell.Ref]cell.RatchetState{
			"checkout": cell.RatchetGreen,
			"billing":  cell.RatchetRed,
			"catalog":  cell.RatchetGreen,
		},
	}
}

func canonicalFederation() cell.Federation {
	return cell.Federation{Contracts: []cell.Contract{
		{A: "checkout", B: "billing", Honored: true},
		// checkout ↔ catalog: NO contract.
	}}
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// Done-criterion half 1 — the checkout CellPack excludes the billing internals.
func TestCheckoutPackExcludesBillingInternals(t *testing.T) {
	p := canonicalProject()
	fed := canonicalFederation()

	pack := cell.CellPack(p, "checkout", fed)

	// own internals present
	if !contains(pack.OwnLayers, "ck-op") || !contains(pack.OwnMirrors, "ck-mir") || !contains(pack.OwnContracts, "ck-pact") {
		t.Fatalf("checkout pack missing its own nodes: %+v", pack)
	}
	// billing's PUBLIC contract crossed (contracted neighbor)
	if !contains(pack.NeighborContracts, "bl-pact") {
		t.Fatalf("checkout pack missing billing's public contract bl-pact: %+v", pack)
	}
	// billing internals MUST NOT appear anywhere
	for _, id := range []string{"bl-op", "bl-mir"} {
		if contains(pack.OwnLayers, id) || contains(pack.OwnMirrors, id) || contains(pack.OwnContracts, id) || contains(pack.NeighborContracts, id) {
			t.Fatalf("checkout pack LEAKED billing internal %q: %+v", id, pack)
		}
	}
	// catalog's public contract MUST be excluded (no contract)
	if contains(pack.NeighborContracts, "cat-pact") {
		t.Fatalf("checkout pack admitted catalog's contract without a contracts_with link")
	}
	// the boundary is visible
	var sawBillingInternal, sawCatalogNoContract bool
	for _, e := range pack.Excluded {
		if e.ID == "bl-op" && e.Reason == cell.ReasonNeighborInternal {
			sawBillingInternal = true
		}
		if e.ID == "cat-pact" && e.Reason == cell.ReasonNoContract {
			sawCatalogNoContract = true
		}
	}
	if !sawBillingInternal {
		t.Fatalf("Excluded did not tag bl-op neighbor-internal: %+v", pack.Excluded)
	}
	if !sawCatalogNoContract {
		t.Fatalf("Excluded did not tag cat-pact no-contract: %+v", pack.Excluded)
	}
}

// Done-criterion half 2 — a cross-cell access without a contract is refused.
func TestCrossCellRefusedWithoutContract(t *testing.T) {
	fed := canonicalFederation()

	// checkout → catalog: refused.
	if br := cell.CheckCrossCellAccess("checkout", "catalog", fed); br == nil {
		t.Fatal("checkout→catalog should be refused (no contract)")
	} else if br.Code != cell.CodeCrossCellNoContract {
		t.Fatalf("wrong code %q (want %q)", br.Code, cell.CodeCrossCellNoContract)
	} else if len(br.HowToFix) == 0 {
		t.Fatal("refusal carries no how_to_fix (a wall without a fix path is a prison)")
	}

	// checkout → billing: allowed (honored contract).
	if br := cell.CheckCrossCellAccess("checkout", "billing", fed); br != nil {
		t.Fatalf("checkout→billing should be allowed (honored contract), got %v", br)
	}

	// checkout → checkout: own cell, always allowed.
	if br := cell.CheckCrossCellAccess("checkout", "checkout", fed); br != nil {
		t.Fatalf("own-cell access refused: %v", br)
	}
}

// An un-honored contract does not authorize crossing (a violated contract is a closed door).
func TestUnhonoredContractDoesNotCross(t *testing.T) {
	fed := cell.Federation{Contracts: []cell.Contract{{A: "checkout", B: "billing", Honored: false}}}
	if br := cell.CheckCrossCellAccess("checkout", "billing", fed); br == nil {
		t.Fatal("an un-honored contract must NOT authorize a cross-cell access")
	}
}

// Partition refuses an unassigned node (no node lives outside a cell).
func TestPartitionRefusesUnassignedNode(t *testing.T) {
	p := cell.Project{ID: "x", Nodes: []cell.Node{{ID: "loose", Cell: "", Kind: cell.KindLayer}}}
	if _, err := cell.Partition(p); err == nil {
		t.Fatal("Partition admitted a node with no cell")
	}
}

// Fractal shipping — the green checkout cell ships even though its sibling billing is red.
func TestGreenCellShipsDespiteRedSibling(t *testing.T) {
	p := canonicalProject()
	cells, err := cell.Partition(p)
	if err != nil {
		t.Fatalf("Partition: %v", err)
	}
	shippable := cell.ShippableCells(cells)
	if !contains(toStrings(shippable), "checkout") {
		t.Fatalf("green checkout cell did not ship: %v", shippable)
	}
	if contains(toStrings(shippable), "billing") {
		t.Fatalf("red billing cell shipped: %v", shippable)
	}
	if !contains(toStrings(shippable), "catalog") {
		t.Fatalf("green catalog cell did not ship: %v", shippable)
	}
}

func toStrings(rs []cell.Ref) []string {
	out := make([]string, len(rs))
	for i, r := range rs {
		out[i] = string(r)
	}
	return out
}

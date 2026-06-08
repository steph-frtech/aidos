package contextmap_test

// Fixture mirror (N2) for S101 — the Context-Map + inter-cell contract pairs. The canonical
// scene is the §46 checkout federation:
//
//   - cell "checkout" CONSUMES cell "billing": expects POST /charges {amount, orderId}.
//   - cell "billing"  PUBLISHES POST /charges {amount, orderId, status} (a superset) — so the
//     consumer/provider pair is HONORED (the done-criterion's first half).
//   - cell "checkout" CONSUMES cell "catalog": expects GET /items {sku, price} — but catalog
//     publishes GET /items {sku} only (price unpublished) — so the pair is UNHONORED, and a
//     checkout → catalog call is REFUSED (the done-criterion's second half: "fixture refusant
//     un appel cross-cell qui viole le contrat").

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/contextmap"
)

func scene() contextmap.ContextMap {
	return contextmap.ContextMap{
		Project: "shop",
		Cells:   []cell.Ref{"checkout", "billing", "catalog"},
		Surfaces: []contextmap.CellSurface{
			{Cell: "billing", Published: []contextmap.Interaction{
				{Method: "POST", Path: "/charges", Fields: []string{"amount", "orderId", "status"}, Status: 201},
			}},
			{Cell: "catalog", Published: []contextmap.Interaction{
				{Method: "GET", Path: "/items", Fields: []string{"sku"}, Status: 200},
			}},
		},
		Pairs: []contextmap.ContractPair{
			{Consumer: "checkout", Provider: "billing", Expected: []contextmap.Interaction{
				{Method: "POST", Path: "/charges", Fields: []string{"amount", "orderId"}, Status: 201},
			}},
			{Consumer: "checkout", Provider: "catalog", Expected: []contextmap.Interaction{
				{Method: "GET", Path: "/items", Fields: []string{"sku", "price"}, Status: 200},
			}},
		},
	}
}

// Done-criterion half 1 — a consumer/provider pair HONORS its contract (pact-verify PASS).
func TestCheckoutBillingPairHonored(t *testing.T) {
	m := scene()
	v := contextmap.VerifyPair(m, m.Pairs[0]) // checkout → billing
	if !v.Honored || v.Reason != contextmap.ReasonHonored {
		t.Fatalf("checkout→billing must be HONORED (provider publishes a superset), got %+v", v)
	}
}

// The catalog pair is UNHONORED because the consumer requires a field (price) the provider
// does not publish — the precise reason is surfaced, never a vague fail.
func TestCheckoutCatalogPairUnhonoredFieldMissing(t *testing.T) {
	m := scene()
	v := contextmap.VerifyPair(m, m.Pairs[1]) // checkout → catalog
	if v.Honored {
		t.Fatalf("checkout→catalog must be UNHONORED (price unpublished), got HONORED")
	}
	if v.Reason != contextmap.ReasonFieldUnpublished {
		t.Fatalf("want CONSUMER_FIELD_UNPUBLISHED, got %s (%s)", v.Reason, v.Detail)
	}
}

// Done-criterion half 1 — the honored pair AUTHORIZES the cross-cell call.
func TestHonoredPairAuthorizesCall(t *testing.T) {
	m := scene()
	if br := contextmap.CheckCrossCellCall("checkout", "billing", m); br != nil {
		t.Fatalf("a HONORED pact pair must authorize checkout→billing, got refused: %+v", br)
	}
}

// Done-criterion half 2 — a cross-cell call that VIOLATES the contract is REFUSED. checkout→
// catalog exists as a designed pair but is UNHONORED, so the wall refuses it.
func TestUnhonoredPairRefusesCall(t *testing.T) {
	m := scene()
	br := contextmap.CheckCrossCellCall("checkout", "catalog", m)
	if br == nil {
		t.Fatal("an UNHONORED pair (contract violated) must NOT authorize a cross-cell call")
	}
	if br.Code != cell.CodeCrossCellNoContract {
		t.Fatalf("want %s, got %s", cell.CodeCrossCellNoContract, br.Code)
	}
}

// A call with NO designed pair at all is also refused (the structural wall, §46).
func TestNoPairRefusesCall(t *testing.T) {
	m := scene()
	if br := contextmap.CheckCrossCellCall("billing", "catalog", m); br == nil {
		t.Fatal("no contract between billing and catalog → call must be refused")
	}
}

// A call to one's OWN cell always passes (no contract needed within a cell).
func TestOwnCellAlwaysPasses(t *testing.T) {
	m := scene()
	if br := contextmap.CheckCrossCellCall("checkout", "checkout", m); br != nil {
		t.Fatalf("own-cell access must pass, got %+v", br)
	}
}

// A pair referencing a cell absent from the Context-Map is UNHONORED (UNKNOWN_CELL), never
// silently accepted — the design must declare every cell first.
func TestPairToUndeclaredCellUnhonored(t *testing.T) {
	m := scene()
	p := contextmap.ContractPair{Consumer: "checkout", Provider: "ghost", Expected: []contextmap.Interaction{
		{Method: "GET", Path: "/x", Fields: []string{"a"}},
	}}
	v := contextmap.VerifyPair(m, p)
	if v.Honored || v.Reason != contextmap.ReasonUnknownCell {
		t.Fatalf("a pair to an undeclared cell must be UNKNOWN_CELL, got %+v", v)
	}
}

// THE WALL — Propose returns a DRAFT ChangeSet (propose → ChangeSet → approval); it writes
// NOTHING. The envelope carries BOTH a spec delta (the design) and a mirror delta (the
// verdicts), so it passes the completeness gate.
func TestProposeReturnsDraftWithMirror(t *testing.T) {
	m := scene()
	cs, err := contextmap.Propose(m, "design shop federation", "phase-0")
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if cs.Status != changeset.StatusDraft {
		t.Fatalf("Propose must return a DRAFT envelope, got %s", cs.Status)
	}
	if cs.SpecDelta == nil || cs.MirrorDelta == nil {
		t.Fatalf("envelope must carry spec+mirror deltas (no monster), got spec=%v mirror=%v", cs.SpecDelta, cs.MirrorDelta)
	}
	if br := changeset.SpecHasMirror(cs); br != nil {
		t.Fatalf("the proposed envelope must pass the completeness gate, blocked: %+v", br)
	}
}

package globalinvariant_test

// GlobalInvariant fixture (state {invariant, violatedCell | grantedApproval} → red_wave |
// decision), interpreted in Go. reflects=kernel.global_invariant "pii-forgettable-federation"
// · test_kind=fixture · cert_language=fixture · liveness=live · authority=above (the cross-cell
// rule — which cells redden, which authority admits — is the human's, KRD §49.1).
//
// Materialized source: tests/kernel/pii-forgettable-federation_global_invariant.fixture.md
// (the human-readable fixture, conceptually stored in the `mirrors` schema; persisted to
// Postgres at S06 — bootstrap exception). It is the LIEN PORTEUR: this test loads the
// pii-forgettable-federation invariant + the red-wave / admission / validate rows; if the
// fixture intention disappears the test breaks (no silent rot into a monster).
//
// The invariant is the KRD §49 fan-out example ("tout agrégat portant du PII doit implémenter
// Forgettable"), VERBATIM — the agent invents no scope, blast_radius, authority tier, or
// decision branch beyond the frozen §49.1 enums.

import (
	"testing"

	gi "github.com/steph-frtech/aidos/back/kernel/globalinvariant"
)

// piiForgettableFederation is the KRD §49 / §49.1 federation invariant, verbatim.
func piiForgettableFederation() gi.GlobalInvariant {
	return gi.GlobalInvariant{
		Name:             "pii-forgettable-federation",
		Scope:            gi.ScopeFederationPolicy,
		Cells:            []gi.CellRef{"checkout", "profile", "billing"},
		Predicate:        "every_pii_aggregate_implements_forgettable",
		BlastRadius:      gi.BlastRadiusGlobal,
		ApprovalRequired: gi.AuthorityArchitectureOwner,
	}
}

// TestInvariantValidates — the verbatim §49.1 federation invariant is well-formed.
func TestInvariantValidates(t *testing.T) {
	if err := gi.Validate(piiForgettableFederation()); err != nil {
		t.Fatalf("the §49.1 pii-forgettable-federation invariant must validate, got %v", err)
	}
}

// TestRedWave_FederationReddensEveryCell — THE red-wave done criterion. A violation in
// "billing" reddens EVERY cell in the federation invariant's reach, not just the violator.
func TestRedWave_FederationReddensEveryCell(t *testing.T) {
	got := gi.RedWave(piiForgettableFederation(), "billing")
	want := map[gi.CellRef]bool{"checkout": true, "profile": true, "billing": true}

	if len(got) != len(want) {
		t.Fatalf("federation red wave must redden all %d cells, got %d: %v", len(want), len(got), got)
	}
	for _, c := range got {
		if !want[c] {
			t.Fatalf("red wave reddened an unexpected cell %q (want checkout/profile/billing)", c)
		}
		delete(want, c)
	}
	if len(want) != 0 {
		t.Fatalf("red wave is missing cells (under-propagation): %v", want)
	}
}

// TestRedWave_NotLimitedToViolator — the violation is NOT limited to "billing" alone.
func TestRedWave_NotLimitedToViolator(t *testing.T) {
	got := gi.RedWave(piiForgettableFederation(), "billing")
	if len(got) == 1 {
		t.Fatalf("a cross-cell violation must not be limited to the violator alone, got %v", got)
	}
}

// TestRedWave_ContractPairReddensThePair — a contract_pair invariant reddens its pair (S19
// weighted: a load-bearing cross-cell link crosses to the partner cell).
func TestRedWave_ContractPairReddensThePair(t *testing.T) {
	pair := gi.GlobalInvariant{
		Name:             "order-payment-consistency",
		Scope:            gi.ScopeContractPair,
		Cells:            []gi.CellRef{"order", "payment"},
		Predicate:        "order_total_matches_payment_amount",
		BlastRadius:      gi.BlastRadiusBounded,
		ApprovalRequired: gi.AuthorityBothContractOwners,
	}
	if err := gi.Validate(pair); err != nil {
		t.Fatalf("the contract_pair invariant must validate, got %v", err)
	}
	got := gi.RedWave(pair, "order")
	want := map[gi.CellRef]bool{"order": true, "payment": true}
	if len(got) != len(want) {
		t.Fatalf("contract_pair red wave must redden [order, payment], got %v", got)
	}
	for _, c := range got {
		if !want[c] {
			t.Fatalf("contract_pair red wave reddened an unexpected cell %q", c)
		}
	}
}

// TestAdmit_CellOwnerBlocked — THE approval done case. A global blast_radius approved only by
// a cell_owner is blocked with INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS; how_to_fix names
// escalating to the architecture_owner.
func TestAdmit_CellOwnerBlocked(t *testing.T) {
	d := gi.Admit(piiForgettableFederation(), gi.AuthorityCellOwner)

	if d.Decision != gi.DecisionBlocked {
		t.Fatalf("a global invariant approved only by a cell_owner must be blocked, got %q", d.Decision)
	}
	if d.BlockReason == nil {
		t.Fatalf("a blocked decision must carry a BlockReason")
	}
	if d.BlockReason.Code != gi.CodeInsufficientApprovalForBlastRadius {
		t.Fatalf("block_reason.code must be INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS, got %q", d.BlockReason.Code)
	}
	found := false
	for _, f := range d.BlockReason.HowToFix {
		if f == "escalate_to_architecture_owner" {
			found = true
		}
	}
	if !found {
		t.Fatalf("how_to_fix must contain escalate_to_architecture_owner, got %v", d.BlockReason.HowToFix)
	}
}

// TestAdmit_ArchitectureOwnerAdmitted — a global blast_radius approved by the architecture
// owner is admitted.
func TestAdmit_ArchitectureOwnerAdmitted(t *testing.T) {
	d := gi.Admit(piiForgettableFederation(), gi.AuthorityArchitectureOwner)
	if d.Decision != gi.DecisionAdmitted {
		t.Fatalf("a global invariant approved by the architecture_owner must be admitted, got %q (%+v)", d.Decision, d.BlockReason)
	}
}

// TestValidate_SingleCellFederationRejected — a federation_policy invariant naming a single
// cell is NOT cross-cell and is rejected at Validate.
func TestValidate_SingleCellFederationRejected(t *testing.T) {
	single := gi.GlobalInvariant{
		Name:             "pii-forgettable-federation",
		Scope:            gi.ScopeFederationPolicy,
		Cells:            []gi.CellRef{"billing"},
		Predicate:        "every_pii_aggregate_implements_forgettable",
		BlastRadius:      gi.BlastRadiusGlobal,
		ApprovalRequired: gi.AuthorityArchitectureOwner,
	}
	if err := gi.Validate(single); err == nil {
		t.Fatalf("a federation_policy invariant naming a single cell must be rejected (not cross-cell)")
	}
}

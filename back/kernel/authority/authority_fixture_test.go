package authority_test

// AuthorityGraph admission fixture (state {graph, truth, approvals} → decision),
// interpreted in Go. reflects=kernel.authority_graph "checkout-regulatory" ·
// test_kind=fixture · cert_language=fixture · liveness=live · authority=above (the
// admission rule — who approves/vetoes/escalates — is the human's, KRD §13.8).
//
// Materialized source: tests/kernel/checkout-regulatory_authority.fixture.md (the
// human-readable fixture, conceptually stored in the `mirrors` schema; persisted to
// Postgres at S06 — bootstrap exception). It is the LIEN PORTEUR: this test loads the
// checkout-regulatory graph + the four admission rows; if the fixture intention
// disappears the test breaks (no silent rot into a monster).
//
// The graph is the KRD §13.8 checkout-regulatory graph, VERBATIM — the agent invents no
// role, no truth_kind, no decision branch (precedence per ADR 0016).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/authority"
)

// checkoutRegulatory is the KRD §13.8 graph, verbatim.
func checkoutRegulatory() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:     "checkout",
		TruthKind:  "regulatory",
		Approvers:  []authority.Role{"legal", "product_owner"},
		Veto:       []authority.Role{"security"},
		Escalation: []authority.Role{"architecture_board"},
	}
}

// regulatoryTruth is the {domain, truth_kind} the graph keys on.
func regulatoryTruth() authority.Truth {
	return authority.Truth{Domain: "checkout", TruthKind: "regulatory"}
}

// TestGraphValidates — the verbatim §13.8 graph is well-formed (Validate passes).
func TestGraphValidates(t *testing.T) {
	if err := authority.Validate(checkoutRegulatory()); err != nil {
		t.Fatalf("the §13.8 checkout-regulatory graph must validate, got %v", err)
	}
}

// TestRow1_NoApproval_BlockedMissingAuthority — THE done criterion. A regulatory truth
// with NO approvals is blocked with MISSING_AUTHORITY_APPROVAL, how_to_fix contains
// obtain_legal_approval. "A regulatory truth without legal approval is blocked."
func TestRow1_NoApproval_BlockedMissingAuthority(t *testing.T) {
	d := authority.Decide(checkoutRegulatory(), regulatoryTruth(), nil)

	if d.Decision != authority.DecisionBlocked {
		t.Fatalf("no-approval regulatory truth must be blocked, got %q", d.Decision)
	}
	if d.BlockReason == nil {
		t.Fatalf("a blocked decision must carry a BlockReason")
	}
	if d.BlockReason.Code != authority.CodeMissingAuthorityApproval {
		t.Fatalf("block_reason.code must be MISSING_AUTHORITY_APPROVAL, got %q", d.BlockReason.Code)
	}
	if !containsStr(d.BlockReason.HowToFix, "obtain_legal_approval") {
		t.Fatalf("how_to_fix must contain obtain_legal_approval, got %v", d.BlockReason.HowToFix)
	}
}

// TestRow2_FullApproval_Admitted — every required approver granted, no veto ⇒ admitted.
func TestRow2_FullApproval_Admitted(t *testing.T) {
	d := authority.Decide(checkoutRegulatory(), regulatoryTruth(),
		[]authority.Role{"legal", "product_owner"})
	if d.Decision != authority.DecisionAdmitted {
		t.Fatalf("full-approval truth must be admitted, got %q (reason %+v)", d.Decision, d.BlockReason)
	}
	if d.BlockReason != nil {
		t.Fatalf("an admitted decision must carry no BlockReason, got %+v", d.BlockReason)
	}
}

// TestRow3_Vetoed_BlockedRegardlessOfApprovers — a granted veto role dominates a full set
// of approvers ⇒ blocked / VETOED (ADR 0016: veto dominates).
func TestRow3_Vetoed_BlockedRegardlessOfApprovers(t *testing.T) {
	d := authority.Decide(checkoutRegulatory(), regulatoryTruth(),
		[]authority.Role{"legal", "product_owner", "security"})
	if d.Decision != authority.DecisionBlocked {
		t.Fatalf("a granted veto must block regardless of approvers, got %q", d.Decision)
	}
	if d.BlockReason == nil || d.BlockReason.Code != authority.CodeVetoed {
		t.Fatalf("block_reason.code must be VETOED, got %+v", d.BlockReason)
	}
}

// TestRow4_PartialApproval_Escalated — only product_owner granted (legal missing), no veto
// ⇒ escalated to architecture_board.
func TestRow4_PartialApproval_Escalated(t *testing.T) {
	d := authority.Decide(checkoutRegulatory(), regulatoryTruth(),
		[]authority.Role{"product_owner"})
	if d.Decision != authority.DecisionEscalated {
		t.Fatalf("partial-approval truth must be escalated, got %q (reason %+v)", d.Decision, d.BlockReason)
	}
	if !containsRole(d.EscalatedTo, "architecture_board") {
		t.Fatalf("escalated_to must contain architecture_board, got %v", d.EscalatedTo)
	}
}

func containsStr(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func containsRole(xs []authority.Role, x authority.Role) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

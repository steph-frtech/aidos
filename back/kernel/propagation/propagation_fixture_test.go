package propagation_test

// Weighted, thresholded red-propagation fixture (KRD §112, §114) interpreted in Go.
// reflects=kernel.propagation "cart-weighted" · test_kind=fixture · cert_language=fixture ·
// liveness=live · authority=above (the RULE — a cosmetic change does not redden the parent; a
// critical weight without evidence is rejected — is the human's, KRD §112 + ADR 0018).
//
// Materialized source: tests/kernel/propagation_weighted.fixture.md (conceptually in the `mirrors`
// schema; persisted to Postgres at S06 — bootstrap exception). This test is the LIEN PORTEUR: it
// loads the §114 "cart" rows; if the fixture intention disappears the test breaks.
//
// The example layers (view "cart" composes checkout-button / promo-field / help-link — the KRD
// §114 worked shape) are the METHOD's example; a real project's edges/weights/thresholds are
// human-declared, NOT invented here.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/propagation"
)

// cartGraph builds the §114 "cart" composition: view "cart" { activation_threshold: 1 } composes
// checkout-button (load-bearing), promo-field (load-bearing), help-link (cosmetic). `changed`
// names the children that changed this cut.
func cartGraph(changed ...string) propagation.Graph {
	return propagation.Graph{
		Parents: map[string]propagation.Parent{
			"cart": {LayerID: "cart", Version: "v1", ActivationThreshold: 1},
		},
		Edges: []propagation.Link{
			{Parent: propagation.Ref{ID: "cart", Version: "v1"}, Child: propagation.Ref{ID: "checkout-button", Version: "v1"}, Weight: propagation.WeightLoadBearing},
			{Parent: propagation.Ref{ID: "cart", Version: "v1"}, Child: propagation.Ref{ID: "promo-field", Version: "v1"}, Weight: propagation.WeightLoadBearing},
			{Parent: propagation.Ref{ID: "cart", Version: "v1"}, Child: propagation.Ref{ID: "help-link", Version: "v1"}, Weight: propagation.WeightCosmetic},
		},
		Changed: changed,
	}
}

// Row A — a load-bearing change reaches the threshold ⇒ the parent aggregate goes RED.
func TestRowA_LoadBearingChange_Red(t *testing.T) {
	v := propagation.FireParent(cartGraph("checkout-button"), "cart")
	if v != propagation.VerdictRed {
		t.Fatalf("a load-bearing change must redden the parent (§112), got %q", v)
	}
}

// Row B — THE done criterion: a cosmetic change below threshold does NOT redden the parent.
func TestRowB_CosmeticChange_Green(t *testing.T) {
	v := propagation.FireParent(cartGraph("help-link"), "cart")
	if v != propagation.VerdictGreen {
		t.Fatalf("a cosmetic change below threshold must NOT redden the parent (THE done criterion), got %q", v)
	}
}

// Row C — no change ⇒ activation 0 ⇒ GREEN.
func TestRowC_NoChange_Green(t *testing.T) {
	v := propagation.FireParent(cartGraph(), "cart")
	if v != propagation.VerdictGreen {
		t.Fatalf("no change must leave the parent GREEN, got %q", v)
	}
}

// Row D — a mixed change-set (one cosmetic + one load-bearing) still reaches the threshold ⇒ RED.
func TestRowD_MixedChange_Red(t *testing.T) {
	v := propagation.FireParent(cartGraph("help-link", "checkout-button"), "cart")
	if v != propagation.VerdictRed {
		t.Fatalf("one load-bearing change in the set must redden the parent, got %q", v)
	}
}

// Row E — a cosmetic link needs no evidence: accepted.
func TestRowE_CosmeticNoEvidence_Accepted(t *testing.T) {
	if br := propagation.ValidateWeight(propagation.Link{Weight: propagation.WeightCosmetic}); br != nil {
		t.Fatalf("a cosmetic link needs no weight_evidence, got block %+v", br)
	}
}

// Row F — a load-bearing link needs no evidence: accepted.
func TestRowF_LoadBearingNoEvidence_Accepted(t *testing.T) {
	if br := propagation.ValidateWeight(propagation.Link{Weight: propagation.WeightLoadBearing}); br != nil {
		t.Fatalf("a load-bearing link needs no weight_evidence, got block %+v", br)
	}
}

// Row G — THE done criterion: a critical link WITHOUT evidence is rejected with the actionable code.
func TestRowG_CriticalNoEvidence_Rejected(t *testing.T) {
	br := propagation.ValidateWeight(propagation.Link{Weight: propagation.WeightCritical})
	if br == nil {
		t.Fatalf("a critical link without weight_evidence MUST be rejected (THE done criterion)")
	}
	if br.Code != propagation.CodeCriticalWeightWithoutEvidence {
		t.Fatalf("block code must be %q, got %q", propagation.CodeCriticalWeightWithoutEvidence, br.Code)
	}
	if !containsFix(br.HowToFix, "attach_incident_evidence") {
		t.Fatalf("how_to_fix must point at attaching incident evidence, got %v", br.HowToFix)
	}
}

// Row H — a critical link WITH evidence is accepted (the strongest tier, admitted on evidence).
func TestRowH_CriticalWithEvidence_Accepted(t *testing.T) {
	link := propagation.Link{Weight: propagation.WeightCritical, WeightEvidence: "INC-2026-014"}
	if br := propagation.ValidateWeight(link); br != nil {
		t.Fatalf("a critical link WITH evidence must be accepted, got block %+v", br)
	}
}

func containsFix(fixes []string, want string) bool {
	for _, f := range fixes {
		if f == want {
			return true
		}
	}
	return false
}

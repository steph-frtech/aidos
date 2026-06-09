package main

import (
	"context"
	"testing"
)

// alignedColumns builds all five non-functional facet columns fully declared+proven (green).
func alignedColumns() []columnIn {
	var cols []columnIn
	for _, f := range []string{"S", "R", "V", "M", "X"} {
		cols = append(cols, columnIn{
			Facet: f,
			Rungs: []rungIn{
				{Rung: "1-spec", Declared: true, Proven: true},
				{Rung: "2-behaviour", Declared: true, Proven: true},
				{Rung: "3-scenarios", Declared: true, Proven: true},
				{Rung: "4-model", Declared: true, Proven: true},
				{Rung: "5-contract", Declared: true, Proven: true},
				{Rung: "6-evidence", Declared: true, Proven: true},
			},
		})
	}
	return cols
}

// breakEvidence flips one facet's evidence rung off (the named fault-injection).
func breakEvidence(cols []columnIn, facet string) []columnIn {
	out := make([]columnIn, len(cols))
	copy(out, cols)
	for i := range out {
		if out[i].Facet == facet {
			rs := make([]rungIn, len(out[i].Rungs))
			copy(rs, out[i].Rungs)
			for j := range rs {
				if rs[j].Rung == "6-evidence" {
					rs[j].Proven = false
				}
			}
			out[i].Rungs = rs
		}
	}
	return out
}

// TestReconcile_AlignedNoCards — all green via the MCP tool → aligned, no cards.
func TestReconcile_AlignedNoCards(t *testing.T) {
	_, out, err := reconcile(context.Background(), nil, reconcileIn{KernelID: "checkout", Columns: alignedColumns()})
	if err != nil {
		t.Fatal(err)
	}
	if !out.Aligned {
		t.Fatalf("aligned input should be aligned, got %q", out.Verdict)
	}
	if len(out.Cards) != 0 {
		t.Fatalf("aligned kernel emits no card, got %d", len(out.Cards))
	}
	if out.Hash == "" {
		t.Fatal("the report must carry a content hash")
	}
}

// TestReconcile_RunnerDivergenceProducesCard — a sourced red runner verdict produces its card.
func TestReconcile_RunnerDivergenceProducesCard(t *testing.T) {
	in := reconcileIn{
		KernelID: "checkout",
		Columns:  alignedColumns(),
		Verdicts: []sourcedVerdictIn{
			{Source: "runner", Facet: "F", Pair: "s2↔s9", Verdict: "red", Drift: "semantic_drift", Detail: "31 vs 30", Blast: "medium"},
		},
	}
	_, out, err := reconcile(context.Background(), nil, in)
	if err != nil {
		t.Fatal(err)
	}
	if out.Aligned {
		t.Fatal("a red runner verdict must drift the kernel")
	}
	if len(out.Cards) != 1 {
		t.Fatalf("one divergence → one card, got %d", len(out.Cards))
	}
	if out.Cards[0].ID == "" || out.Cards[0].Source != "runner" {
		t.Fatalf("card must be sourced + carry an ID: %+v", out.Cards[0])
	}
}

// TestReconcile_BreakHardFacetReddens — breaking the S column via the skeleton reddens overall.
func TestReconcile_BreakHardFacetReddens(t *testing.T) {
	in := reconcileIn{KernelID: "checkout", Columns: breakEvidence(alignedColumns(), "S")}
	_, out, err := reconcile(context.Background(), nil, in)
	if err != nil {
		t.Fatal(err)
	}
	if out.Aligned {
		t.Fatal("breaking a hard facet must drift")
	}
	var secCard bool
	for _, c := range out.Cards {
		if c.Facet == "S" && c.Drift == "security_drift" {
			secCard = true
		}
	}
	if !secCard {
		t.Fatal("the broken S column must produce a security card")
	}
}

// TestReconcile_BreakXStaysAligned — breaking the soft X column stays aligned with an advisory card.
func TestReconcile_BreakXStaysAligned(t *testing.T) {
	in := reconcileIn{KernelID: "checkout", Columns: breakEvidence(alignedColumns(), "X")}
	_, out, err := reconcile(context.Background(), nil, in)
	if err != nil {
		t.Fatal(err)
	}
	if !out.Aligned {
		t.Fatalf("a broken soft X column must NOT drift, got %q", out.Verdict)
	}
	var advCard bool
	for _, c := range out.Cards {
		if c.Facet == "X" && c.Advisory {
			advCard = true
		}
	}
	if !advCard {
		t.Fatal("the broken X column must produce an advisory card")
	}
}

// TestDecisionCards_OnlyCards — the decision_cards tool returns just the cards.
func TestDecisionCards_OnlyCards(t *testing.T) {
	in := reconcileIn{
		KernelID: "checkout",
		Verdicts: []sourcedVerdictIn{
			{Source: "reality_mirror", Facet: "F", Pair: "telemetry", Verdict: "red", Drift: "contract_drift", Detail: "prod diverges"},
		},
	}
	_, out, err := decisionCards(context.Background(), nil, in)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Cards) != 1 {
		t.Fatalf("one divergence → one card, got %d", len(out.Cards))
	}
	if out.Verdict != "drift" {
		t.Fatalf("expected drift verdict, got %q", out.Verdict)
	}
}

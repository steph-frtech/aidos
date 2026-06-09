package main

import (
	"context"
	"testing"
)

// fullColumnIn builds a facet column whose six rungs are all declared+proven (green baseline).
func fullColumnIn(facet string) columnIn {
	return columnIn{
		KernelID: "checkout",
		Facet:    facet,
		Rungs: []rungIn{
			{Rung: "1-spec", Declared: true, Proven: true},
			{Rung: "2-behaviour", Declared: true, Proven: true},
			{Rung: "3-scenarios", Declared: true, Proven: true},
			{Rung: "4-model", Declared: true, Proven: true},
			{Rung: "5-contract", Declared: true, Proven: true},
			{Rung: "6-evidence", Declared: true, Proven: true},
		},
	}
}

// breakEvidence flips the evidence rung's proven flag off (the named fault-injection).
func breakEvidence(c columnIn) columnIn {
	for i := range c.Rungs {
		if c.Rungs[i].Rung == "6-evidence" {
			c.Rungs[i].Proven = false
		}
	}
	return c
}

// TestFacetWire_AlignedGreen — a fully aligned S column is green via the MCP tool.
func TestFacetWire_AlignedGreen(t *testing.T) {
	_, out, err := facetWire(context.Background(), nil, fullColumnIn("S"))
	if err != nil {
		t.Fatal(err)
	}
	if !out.Green {
		t.Fatalf("aligned S column should be green: %+v", out.Divergences)
	}
	if out.Sensor == "" {
		t.Fatal("the S column must name its reused sensor")
	}
}

// TestFacetWire_BreakHardColumnRed — breaking a hard column's pair reddens it.
func TestFacetWire_BreakHardColumnRed(t *testing.T) {
	for _, f := range []string{"S", "R", "V", "M"} {
		_, out, err := facetWire(context.Background(), nil, breakEvidence(fullColumnIn(f)))
		if err != nil {
			t.Fatal(err)
		}
		if out.Green {
			t.Fatalf("facet %s: breaking a pair must redden the column", f)
		}
	}
}

// TestFacetWire_XAdvisory — breaking the X pair stays green, surfaces an advisory.
func TestFacetWire_XAdvisory(t *testing.T) {
	_, out, err := facetWire(context.Background(), nil, breakEvidence(fullColumnIn("X")))
	if err != nil {
		t.Fatal(err)
	}
	if !out.Green {
		t.Fatal("the soft X column must stay green (advisory)")
	}
	if len(out.Advisories) == 0 {
		t.Fatal("the X column must surface an advisory")
	}
}

// TestFacetSkeleton_OverallVerdict — a skeleton with one broken hard column is red overall.
func TestFacetSkeleton_OverallVerdict(t *testing.T) {
	_, out, err := facetSkeleton(context.Background(), nil, skeletonIn{
		KernelID: "checkout",
		Columns: []columnIn{
			breakEvidence(fullColumnIn("S")),
			fullColumnIn("R"),
			fullColumnIn("V"),
			fullColumnIn("M"),
			fullColumnIn("X"),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Green {
		t.Fatal("a broken hard column must redden the overall skeleton")
	}
	if out.Hash == "" {
		t.Fatal("the skeleton report must carry a content hash")
	}
}

// TestFacetSkeleton_OnlyXBrokenStaysGreen — a skeleton whose only broken column is X stays green.
func TestFacetSkeleton_OnlyXBrokenStaysGreen(t *testing.T) {
	_, out, err := facetSkeleton(context.Background(), nil, skeletonIn{
		KernelID: "checkout",
		Columns: []columnIn{
			fullColumnIn("S"),
			fullColumnIn("R"),
			fullColumnIn("V"),
			fullColumnIn("M"),
			breakEvidence(fullColumnIn("X")),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !out.Green {
		t.Fatal("a skeleton whose only broken column is the soft X must stay green")
	}
}

// TestMCPServer_Registers — the server constructs with both tools registered.
func TestMCPServer_Registers(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("server must construct")
	}
}

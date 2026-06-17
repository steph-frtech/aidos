package anatomysrv

import (
	"context"
	"testing"
)

func sixGreen() []pairStateIn {
	kinds := []string{"spec_doc", "behavior_results", "scenarios_tests", "model_projection", "contract_code", "evidence"}
	out := make([]pairStateIn, 0, len(kinds))
	for _, k := range kinds {
		out = append(out, pairStateIn{Kind: k, Declared: "declared", Proven: "pass"})
	}
	return out
}

// TestPairsTool — the six closed mirror-pair kinds, canonical order.
func TestPairsTool(t *testing.T) {
	_, out, _ := pairs(context.Background(), nil, pairsInput{})
	if len(out.Pairs) != 6 || out.Pairs[0] != "spec_doc" || out.Pairs[5] != "evidence" {
		t.Fatalf("pairs wrong closed set: %+v", out.Pairs)
	}
}

// TestVoyantTool — the §8 truth-table: declared∧pass→green, declared∧fail→red, else amber.
func TestVoyantTool(t *testing.T) {
	cases := []struct {
		d, p, want string
	}{
		{"declared", "pass", "green"},
		{"declared", "fail", "red"},
		{"declared", "pending", "amber"},
		{"absent", "absent", "amber"},
		{"absent", "pass", "amber"},
	}
	for _, c := range cases {
		_, out, _ := voyant(context.Background(), nil, voyantInput{Declared: c.d, Proven: c.p})
		if out.Voyant != c.want {
			t.Fatalf("voyant(%q,%q) = %q, want %q", c.d, c.p, out.Voyant, c.want)
		}
	}
}

// TestBuildTool — six declared∧pass pairs → all green, overall green, content-addressed.
func TestBuildTool(t *testing.T) {
	_, out, err := build(context.Background(), nil, buildInput{KernelID: "k-1", States: sixGreen()})
	if err != nil || !out.OK {
		t.Fatalf("build should succeed: %+v err=%v", out, err)
	}
	if len(out.Pairs) != 6 || out.Overall != "green" || out.Counts.Green != 6 {
		t.Fatalf("six declared∧pass ⇒ all green: %+v", out)
	}
	if out.Hash == "" {
		t.Fatalf("build must content-address the anatomy")
	}
	if out.Pairs[0].Declared.Side != "above" || out.Pairs[0].Proven.Side != "below" {
		t.Fatalf("declared above the wall, proven below: %+v", out.Pairs[0])
	}
}

// TestBuildRedOverall — one declared∧fail reddens the overall (worst-of-six).
func TestBuildRedOverall(t *testing.T) {
	states := sixGreen()
	states[2] = pairStateIn{Kind: "scenarios_tests", Declared: "declared", Proven: "fail"}
	_, out, _ := build(context.Background(), nil, buildInput{KernelID: "k-1", States: states})
	if out.Overall != "red" || out.Counts.Red != 1 {
		t.Fatalf("a declared∧fail must redden the overall: %+v", out)
	}
}

// TestBuildIncompleteRefused — a missing pair is refused (no anatomy).
func TestBuildIncompleteRefused(t *testing.T) {
	_, out, _ := build(context.Background(), nil, buildInput{KernelID: "k-1", States: sixGreen()[:5]})
	if out.OK || out.Error == "" {
		t.Fatalf("a missing pair must be refused: %+v", out)
	}
}

func TestServerBuilds(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("NewServer returned nil")
	}
}

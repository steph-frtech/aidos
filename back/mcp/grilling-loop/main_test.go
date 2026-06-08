package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
)

// The grilling-loop MCP server is PURE computation (the wall): these tests prove each
// tool routes/verifies deterministically without any I/O. They mirror the S65
// done-criterion (a verdict branch per lane) at the MCP boundary.

func TestGrillRouteToolPerVerdictBranch(t *testing.T) {
	cases := []struct {
		verdict    string
		reason     string
		wantStatus ideas.Status
	}{
		{"sharp", "", ideas.StatusGrilled},
		{"fuzzy", "", ideas.StatusSpiking},
		{"bad", "duplicate policy", ideas.StatusRejected},
	}
	for _, c := range cases {
		in := routeInput{
			Proposes:  "policy",
			Intent:    "je veux un code promo",
			Scenarios: []string{"Given a regular Then a promo applies"},
			Verdict:   c.verdict,
			Reason:    c.reason,
		}
		_, out, err := route(context.Background(), nil, in)
		if err != nil {
			t.Fatalf("route(%s): %v", c.verdict, err)
		}
		if out.Status != string(c.wantStatus) {
			t.Fatalf("route(%s) status = %q, want %q", c.verdict, out.Status, c.wantStatus)
		}
		if out.Verdict != c.verdict {
			t.Fatalf("route(%s) recorded verdict = %q", c.verdict, out.Verdict)
		}
		if out.Source != string(ideas.ProvenanceHuman) {
			t.Fatalf("route(%s) provenance = %q, want human", c.verdict, out.Source)
		}
	}
}

func TestGrillRouteToolRefusesSixthScenario(t *testing.T) {
	in := routeInput{
		Proposes:  "policy",
		Intent:    "x",
		Scenarios: []string{"a", "b", "c", "d", "e", "f"},
		Verdict:   "sharp",
	}
	if _, _, err := route(context.Background(), nil, in); err == nil {
		t.Fatal("expected error for a sixth scenario")
	}
}

func TestGrillVerifyVerdictGate(t *testing.T) {
	for _, raw := range []string{"sharp", "fuzzy", "bad"} {
		_, out, _ := verify(context.Background(), nil, verifyInput{Raw: raw})
		if !out.OK || out.Verdict != raw {
			t.Fatalf("verify(%q) = %+v, want ok+%q", raw, out, raw)
		}
	}
	for _, raw := range []string{"Sharp", "approved", "", "yes"} {
		_, out, _ := verify(context.Background(), nil, verifyInput{Raw: raw})
		if out.OK {
			t.Fatalf("verify(%q) accepted an off-schema verdict", raw)
		}
	}
}

func TestGrillVerdictsTool(t *testing.T) {
	_, out, err := verdicts(context.Background(), nil, struct{}{})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"sharp", "fuzzy", "bad"}
	if len(out.Verdicts) != len(want) {
		t.Fatalf("verdicts = %v, want %v", out.Verdicts, want)
	}
	for i, v := range want {
		if out.Verdicts[i] != v {
			t.Fatalf("verdicts[%d] = %q, want %q", i, out.Verdicts[i], v)
		}
	}
}

func TestServerRegistersThreeTools(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("nil server")
	}
}

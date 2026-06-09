package main

import (
	"context"
	"testing"
)

// The MCP server is the capability door over FK10 — it must expose exactly the two declared
// tools, and each tool must faithfully relay the pure verdict (the wall: it adds no judgment).

func TestServerExposesTwoTools(t *testing.T) {
	srv := newMCPServer()
	if srv == nil {
		t.Fatal("newMCPServer returned nil")
	}
}

func TestEnforce_A1AttemptsMerge_Refused(t *testing.T) {
	_, out, err := enforce(context.Background(), nil, enforceIn{
		Declared: 1, Action: "merge", Required: 6, Critical: true,
	})
	if err != nil {
		t.Fatalf("enforce: %v", err)
	}
	if out.Allowed {
		t.Fatalf("an A1 agent must not be allowed to merge")
	}
	if out.Code != "AGENT_AUTONOMY_EXCEEDED" {
		t.Fatalf("want AGENT_AUTONOMY_EXCEEDED, got %q", out.Code)
	}
	if len(out.HowToFix) == 0 {
		t.Fatalf("the refusal must name the door out")
	}
}

func TestEnforce_A6Merges(t *testing.T) {
	_, out, err := enforce(context.Background(), nil, enforceIn{
		Declared: 6, Action: "merge", Required: 6, Critical: true,
	})
	if err != nil || !out.Allowed {
		t.Fatalf("A6 must merge; allowed=%v err=%v", out.Allowed, err)
	}
}

func TestPromote_EarnedFromHistory(t *testing.T) {
	hist := []runIn{
		{Green: true, Evidence: 4, Incident: false},
		{Green: true, Evidence: 5, Incident: false},
		{Green: true, Evidence: 4, Incident: false},
	}
	_, out, err := promote(context.Background(), nil, promoteIn{Current: 1, History: hist})
	if err != nil {
		t.Fatalf("promote: %v", err)
	}
	if !out.Earned || out.Promoted != "A2" {
		t.Fatalf("3 clean E4+ runs must promote A1→A2, got promoted=%q earned=%v", out.Promoted, out.Earned)
	}
}

func TestPromote_IncidentWithholds(t *testing.T) {
	hist := []runIn{
		{Green: true, Evidence: 4, Incident: false},
		{Green: true, Evidence: 4, Incident: true},
		{Green: true, Evidence: 4, Incident: false},
	}
	_, out, err := promote(context.Background(), nil, promoteIn{Current: 1, History: hist})
	if err != nil {
		t.Fatalf("promote: %v", err)
	}
	if out.Earned || out.Promoted != "A1" {
		t.Fatalf("an incident must withhold promotion, got promoted=%q earned=%v", out.Promoted, out.Earned)
	}
}

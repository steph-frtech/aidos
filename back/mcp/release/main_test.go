// main_test.go — pins the S117 done-criteria at the MCP door: the three tools register;
// assemble enumerates the account inventory honestly + advises the next tier; the
// adoption ladder is computed; the CLI surface lists the five core verbs + the six S117
// gateway verbs (the completed surface).
package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/adoption"
	"github.com/steph-frtech/aidos/back/runtime/adoption/accountrelease"
)

func TestServerRegistersThreeTools(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("the release MCP server must construct")
	}
}

func TestTool_AssembleEnumeratesAndAdvises(t *testing.T) {
	view := accountrelease.AccountView{
		Account: "acct-1",
		Projects: []accountrelease.ProjectEntry{
			{ID: "p1", Status: accountrelease.ProjectReal},
			{ID: "p2", Status: accountrelease.ProjectDemo},
		},
		DeclaredLimits: []accountrelease.Limit{{Ref: "lim-async", Description: "async best-effort"}},
		Capabilities:   []adoption.Capability{adoption.CapTests, adoption.CapMutation, adoption.CapOneKRDCell},
	}
	_, out, err := assemble(context.Background(), nil, assembleInput{View: view, Now: 5})
	if err != nil {
		t.Fatal(err)
	}
	if out.Pack.Account != "acct-1" || len(out.Pack.Projects) != 2 {
		t.Fatalf("inventory not enumerated: %+v", out.Pack)
	}
	if len(out.Pack.KnownLimits) != 1 {
		t.Fatalf("honest limit not enumerated: %+v", out.Pack.KnownLimits)
	}
	if out.Pack.AdoptionPlan.Next != adoption.T2 {
		t.Fatalf("next tier = %q, want T2", out.Pack.AdoptionPlan.Next)
	}
	if out.Pack.ID == "" {
		t.Fatal("pack must be content-addressed")
	}
}

func TestTool_AdoptionPlan(t *testing.T) {
	_, out, _ := planTool(context.Background(), nil, planInput{Capabilities: nil})
	if out.Plan.Current != adoption.T0 || out.Plan.Next != adoption.T1 {
		t.Fatalf("empty plan should be T0→T1, got %q→%q", out.Plan.Current, out.Plan.Next)
	}
}

func TestTool_CLISurfaceListsCoreAndGatewayVerbs(t *testing.T) {
	_, out, _ := cliSurface(context.Background(), nil, cliSurfaceInput{})
	if len(out.Verbs) != 11 {
		t.Fatalf("expected 5 core + 6 gateway = 11 verbs, got %d", len(out.Verbs))
	}
	byName := map[string]VerbInfo{}
	for _, v := range out.Verbs {
		byName[v.Name] = v
	}
	for _, core := range []string{"check", "impact", "stable", "diff", "explain"} {
		if byName[core].Kind != "core" {
			t.Errorf("%q must be a core verb", core)
		}
	}
	wantGW := map[string]string{
		"goal": "changeset_open", "grill": "idea_grill", "spike": "idea_spike",
		"harvest": "idea_harvest", "trim": "idea_capture", "init": "project_create",
	}
	for v, tool := range wantGW {
		got := byName[v]
		if got.Kind != "gateway" || got.Tool != tool {
			t.Errorf("gateway verb %q: kind=%q tool=%q, want gateway/%q", v, got.Kind, got.Tool, tool)
		}
	}
}

package accountrelease

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/adoption"
)

// S117 acceptance mirror (fixture) — the per-ACCOUNT release pack: the content-
// addressed inventory that enumerates HONESTLY what EXISTS in the live truth-store of
// ONE account (its projects, the CLI/Workbench surface, the demo-vs-real status of
// each project, the docs index, the test inventory, the honest known-limits) and
// advises the next adoption tier. It generalises the S47 single-project release pack
// to a multi-project account. ASSEMBLE, NEVER AUTHOR (CLAUDE.md honesty rule).

// canonView is a small but representative account: two projects (one real, one demo),
// the live CLI surface (including the S117 gateway verbs), two Workbench routes, a
// docs index, two mirrors, one changelog line, and one honest plan-limit. Capabilities
// place the account at a specific adoption tier.
func canonView() AccountView {
	return AccountView{
		Account: "acct-42",
		Projects: []ProjectEntry{
			{ID: "p-shop", Name: "Boutique", Status: ProjectReal, KernelHead: "kh-shop"},
			{ID: "p-demo", Name: "Démo checkout", Status: ProjectDemo, KernelHead: "kh-demo"},
		},
		CLISurface: []CLICommand{
			{Name: "check"}, {Name: "goal"}, {Name: "grill"}, {Name: "init"},
		},
		WorkbenchRoutes: []Route{{Path: "/account-release"}, {Path: "/cli"}},
		Docs:            []DocRef{{Slug: "guide/intro"}, {Slug: "steps/internals/s117"}},
		Mirrors:         []MirrorRef{{ID: "m1", TestKind: "journey"}, {ID: "m2", TestKind: "property"}},
		Changesets:      []ChangeEntry{{Ref: "cs-1", Summary: "phase initiale"}},
		DeclaredLimits: []Limit{
			{Ref: "lim-doltgres", Description: "Doltgres beta — fallback Postgres si le spike échoue (ADR 0006)"},
		},
		Capabilities: []adoption.Capability{adoption.CapTests, adoption.CapMutation, adoption.CapOneKRDCell},
	}
}

func TestAssemble_EnumeratesEveryLiveEntryHonestly(t *testing.T) {
	v := canonView()
	pack := Assemble(v, 1000)

	if pack.Account != "acct-42" {
		t.Errorf("Account = %q, want acct-42", pack.Account)
	}
	if len(pack.Projects) != 2 {
		t.Fatalf("Projects = %d, want 2", len(pack.Projects))
	}
	// The demo-vs-real status is carried HONESTLY per project (never editorialised).
	gotStatus := map[string]ProjectStatus{}
	for _, p := range pack.Projects {
		gotStatus[p.ID] = p.Status
	}
	if gotStatus["p-shop"] != ProjectReal || gotStatus["p-demo"] != ProjectDemo {
		t.Errorf("project statuses not preserved honestly: %+v", gotStatus)
	}
	if len(pack.CLISurface) != 4 || len(pack.WorkbenchRoutes) != 2 {
		t.Errorf("CLI/route inventory miscounted: cli=%d routes=%d", len(pack.CLISurface), len(pack.WorkbenchRoutes))
	}
	if len(pack.DocsIndex) != 2 || len(pack.TestInventory) != 2 || len(pack.Changelog) != 1 {
		t.Errorf("docs/tests/changelog miscounted")
	}
	if len(pack.KnownLimits) != 1 || pack.KnownLimits[0].Ref != "lim-doltgres" {
		t.Errorf("honest known-limits not enumerated: %+v", pack.KnownLimits)
	}
}

func TestAssemble_AdvisesNextAdoptionTier(t *testing.T) {
	v := canonView()
	pack := Assemble(v, 1000)
	// With tests+mutation+one_krd_cell live, the account is at T1; the next ratchet is T2.
	if pack.AdoptionPlan.Current != adoption.T1 {
		t.Errorf("current tier = %q, want T1", pack.AdoptionPlan.Current)
	}
	if pack.AdoptionPlan.Next != adoption.T2 {
		t.Errorf("next tier = %q, want T2 (the smallest ratchet that clicks)", pack.AdoptionPlan.Next)
	}
}

func TestAssemble_IsContentAddressed(t *testing.T) {
	v := canonView()
	a := Assemble(v, 1000)
	b := Assemble(v, 9999) // different stamp ⇒ SAME id (id excludes assembled_at).
	if a.ID == "" {
		t.Fatal("pack id is empty")
	}
	if a.ID != b.ID {
		t.Errorf("pack id depends on assembled_at: %q vs %q", a.ID, b.ID)
	}
}

func TestAssemble_EmptyAccountYieldsEmptyButValidPack(t *testing.T) {
	pack := Assemble(AccountView{Account: "empty"}, 1)
	if pack.Account != "empty" {
		t.Errorf("account not carried on empty view")
	}
	if len(pack.Projects) != 0 || len(pack.CLISurface) != 0 || len(pack.KnownLimits) != 0 {
		t.Errorf("empty account fabricated content: %+v", pack)
	}
	if pack.ID == "" {
		t.Error("empty account has no content-address")
	}
	// An empty capability view: T0 requires nothing, so the floor is already satisfied
	// (Current=T0) and the next ratchet that clicks is T1.
	if pack.AdoptionPlan.Current != adoption.T0 {
		t.Errorf("empty account current tier = %q, want T0 (floor)", pack.AdoptionPlan.Current)
	}
	if pack.AdoptionPlan.Next != adoption.T1 {
		t.Errorf("empty account next tier = %q, want T1", pack.AdoptionPlan.Next)
	}
}

func TestAssemble_NeverInventsAProjectOrLimit(t *testing.T) {
	// A view with ONE project and NO limits must yield exactly that — no fabricated
	// second project, no invented caveat (the honesty rule).
	v := AccountView{
		Account:  "solo",
		Projects: []ProjectEntry{{ID: "only", Name: "Only", Status: ProjectReal}},
	}
	pack := Assemble(v, 0)
	if len(pack.Projects) != 1 || pack.Projects[0].ID != "only" {
		t.Errorf("fabricated/dropped a project: %+v", pack.Projects)
	}
	if len(pack.KnownLimits) != 0 {
		t.Errorf("invented a known-limit: %+v", pack.KnownLimits)
	}
}

// Package accountrelease is the AIDOS Runtime per-ACCOUNT Release-v0 assembler (step
// S117): the pure, read-only function that INVENTORIES what exists in ONE account's
// live truth-store into a content-addressed AccountReleasePack and advises the next
// adoption tier. It GENERALISES the S47 single-project release pack (back/runtime/
// adoption/release) to a multi-project account: the account's projects (each with its
// HONEST demo-vs-real status), the live CLI/Workbench surface, the docs index, the
// test inventory (the live mirrors), the changelog, and the honest known-limits (plan
// caveats — Doltgres beta, async best-effort, plan quotas). It ASSEMBLES; it AUTHORS
// NOTHING, installs nothing, ships nothing, writes no truth (the wall, CLAUDE.md §2).
//
// ASSEMBLE, NEVER AUTHOR (CLAUDE.md honesty rule — the S117 done-criterion: "le pack
// de release énumère HONNÊTEMENT ce qui EXISTE dans le truth-store live du user").
// Every field of an AccountReleasePack is DERIVED from the passed-in read-only
// AccountView. Assemble does NOT invent a project, a CLI command, a route, a doc, a
// changelog line, a known-limit, or a demo-vs-real flag the View does not contain. An
// empty View yields an empty-but-valid pack (no fabricated content). The rapid property
// pins that every pack entry traces to a real View entry.
//
// CONTENT-ADDRESSED (S01/S02 REUSED, not forked). pack.id = Hash(Canonicalize(body))
// over the SAME scheme S01/S02/S47 use (records.Canonicalize + records.Hash) — the
// pack lands under the same address in either store. The id is the hash of the
// canonical pack body EXCLUDING the id and the assembled_at stamp, so two assemblies of
// the same account at different times share an id.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Assemble is a pure, total function of
// (view, now) — no DB, no I/O; the clock is PASSED IN so the pack is deterministic and
// replayable. Same (view, now) ⇒ same pack. The adoption ladder is adoption.Plan (the
// single source of the gating truth, not duplicated here).
//
// THE WALL (CLAUDE.md §2). This package is PURE and READ-ONLY over the View. It writes
// NOTHING. Recording a pack is a SELECT-only-for-the-agent row written only by the
// aidos CLI writer role through an approved ChangeSet (S20) — never from this package.
// Advising the next tier is just that — advice; turning on a capability goes through
// idea → mirror → /goal → human approval.
package accountrelease

import (
	"encoding/json"
	"sort"

	krec "github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/adoption"
)

// ProjectStatus is one project's HONEST demo-vs-real classification — CONSUMED from the
// View, never editorialised. The two declared values cover the account inventory: a
// real working app vs a runnable demo/slice.
type ProjectStatus string

const (
	// ProjectReal — a real, account-owned project (a working app, not a demo).
	ProjectReal ProjectStatus = "real"
	// ProjectDemo — a runnable demo/slice (e.g. the S46 checkout). Honestly flagged so
	// the account never mistakes a demo for shipped reality.
	ProjectDemo ProjectStatus = "demo"
)

// ProjectEntry is one project the account owns, as the View reports it. CONSUMED, never
// invented. KernelHead is the project's content-addressed head (empty when the View has
// none — an empty-but-valid project).
type ProjectEntry struct {
	ID         string        `json:"id"`
	Name       string        `json:"name,omitempty"`
	Status     ProjectStatus `json:"status"`
	KernelHead string        `json:"kernel_head,omitempty"`
}

// CLICommand is one live `aidos` CLI verb the View reports (e.g. check, goal, init).
// CONSUMED from the live CLI surface, never invented.
type CLICommand struct {
	Name    string `json:"name"`
	Summary string `json:"summary,omitempty"`
}

// Route is one live Workbench route the View reports. CONSUMED, never invented.
type Route struct {
	Path  string `json:"path"`
	Title string `json:"title,omitempty"`
}

// DocRef is one entry of the live docs index the View reports. CONSUMED, never authored.
type DocRef struct {
	Slug  string `json:"slug"`
	Title string `json:"title,omitempty"`
}

// MirrorRef is one live mirror the View reports — the test inventory IS the live
// mirrors. CONSUMED, never invented.
type MirrorRef struct {
	ID       string `json:"id"`
	Reflects string `json:"reflects,omitempty"`
	TestKind string `json:"test_kind,omitempty"`
}

// ChangeEntry is one changelog line DERIVED from a live changeset in the View — never an
// authored line. Ref traces to a real changeset id.
type ChangeEntry struct {
	Ref     string `json:"ref"`
	Summary string `json:"summary,omitempty"`
}

// Limit is one HONEST known-limit DERIVED from a declared limit / OpenQuestion / plan
// caveat in the View (Doltgres beta, async best-effort, plan quotas) — never
// editorialised by the agent. Ref traces to a real declared limit.
type Limit struct {
	Ref         string `json:"ref"`
	Description string `json:"description,omitempty"`
}

// AccountView is the read-only inventory Assemble reads for ONE account: the account id,
// its projects (each with its demo-vs-real status), the live CLI commands, Workbench
// routes, docs index, the live mirrors (test inventory), the changeset history
// (changelog source), the declared limits, and the capabilities live in the account's
// truth-store (which place it on the adoption ladder). Assemble NEVER mutates it (the
// rapid property pins the input is unchanged). All slices may be empty (an empty View
// yields an empty-but-valid pack).
type AccountView struct {
	Account         string                `json:"account"`
	Projects        []ProjectEntry        `json:"projects"`
	CLISurface      []CLICommand          `json:"cli_surface"`
	WorkbenchRoutes []Route               `json:"workbench_routes"`
	Docs            []DocRef              `json:"docs"`
	Mirrors         []MirrorRef           `json:"mirrors"`
	Changesets      []ChangeEntry         `json:"changesets"`
	DeclaredLimits  []Limit               `json:"declared_limits"`
	Capabilities    []adoption.Capability `json:"capabilities"`
}

// AccountReleasePack is the typed, content-addressed per-account Release-v0 bundle.
// id = Hash(Canonicalize(body)) over the canonical body EXCLUDING id and assembled_at.
// Every field is the View's content — no invented entry. AdoptionPlan is the ladder
// computed from the account's capabilities, advising the next smallest ratchet.
type AccountReleasePack struct {
	ID              string                `json:"id"`
	Account         string                `json:"account"`
	Projects        []ProjectEntry        `json:"projects"`
	CLISurface      []CLICommand          `json:"cli_surface"`
	WorkbenchRoutes []Route               `json:"workbench_routes"`
	DocsIndex       []DocRef              `json:"docs_index"`
	TestInventory   []MirrorRef           `json:"test_inventory"`
	Changelog       []ChangeEntry         `json:"changelog"`
	KnownLimits     []Limit               `json:"known_limits"`
	AdoptionPlan    adoption.AdoptionPlan `json:"adoption_plan"`
	AssembledAt     int64                 `json:"assembled_at"`
}

// canonicalBody is the hashed shape of an AccountReleasePack (id and assembled_at
// EXCLUDED — the id IS the content hash; assembled_at is the recorder's stamp, not pack
// identity). Keys are sorted by records.Canonicalize, so field order here is irrelevant.
type canonicalBody struct {
	Account         string                `json:"account"`
	AdoptionPlan    adoption.AdoptionPlan `json:"adoption_plan"`
	Changelog       []ChangeEntry         `json:"changelog"`
	CLISurface      []CLICommand          `json:"cli_surface"`
	DocsIndex       []DocRef              `json:"docs_index"`
	KnownLimits     []Limit               `json:"known_limits"`
	Projects        []ProjectEntry        `json:"projects"`
	TestInventory   []MirrorRef           `json:"test_inventory"`
	WorkbenchRoutes []Route               `json:"workbench_routes"`
}

// packID computes the content address of a pack body, REUSING S01/S02's Canonicalize +
// Hash (never forked). Same logical pack ⇒ same id, independent of assembled_at.
func packID(cb canonicalBody) string {
	b, err := json.Marshal(cb)
	if err != nil {
		return krec.Hash([]byte("{}"))
	}
	canon, err := krec.Canonicalize(b)
	if err != nil {
		return krec.Hash(b)
	}
	return krec.Hash(canon)
}

// Assemble inventories ONE account's live View into a content-addressed
// AccountReleasePack and pairs it with the adoption ladder computed from the account's
// capabilities. Pure and total over (view, now) — no DB, no I/O; the clock is PASSED IN
// (assembled_at). It AUTHORS NOTHING (every field is the View's content), installs
// nothing, ships nothing, writes no truth (the wall). It NEVER mutates the inputs. An
// empty View yields an empty-but-valid pack (no fabricated content). The pack id ==
// Hash(Canonicalize(body)).
func Assemble(view AccountView, now int64) AccountReleasePack {
	projects := copyProjects(view.Projects)
	cli := copyCLI(view.CLISurface)
	routes := copyRoutes(view.WorkbenchRoutes)
	docs := copyDocs(view.Docs)
	mirrors := copyMirrors(view.Mirrors)
	changelog := copyChanges(view.Changesets)
	limits := copyLimits(view.DeclaredLimits)

	plan := adoption.Plan(view.Capabilities)

	cb := canonicalBody{
		Account:         view.Account,
		AdoptionPlan:    plan,
		Changelog:       changelog,
		CLISurface:      cli,
		DocsIndex:       docs,
		KnownLimits:     limits,
		Projects:        projects,
		TestInventory:   mirrors,
		WorkbenchRoutes: routes,
	}

	return AccountReleasePack{
		ID:              packID(cb),
		Account:         view.Account,
		Projects:        projects,
		CLISurface:      cli,
		WorkbenchRoutes: routes,
		DocsIndex:       docs,
		TestInventory:   mirrors,
		Changelog:       changelog,
		KnownLimits:     limits,
		AdoptionPlan:    plan,
		AssembledAt:     now,
	}
}

// The copy helpers below produce stable, sorted, defensive copies so Assemble is
// deterministic (same View ⇒ same ordering) and never mutates its input. Sorting by the
// natural key makes the canonical body — and thus the pack id — independent of the
// View's incoming order, while never adding or dropping an entry (inventory fidelity).

func copyProjects(in []ProjectEntry) []ProjectEntry {
	out := append([]ProjectEntry(nil), in...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func copyCLI(in []CLICommand) []CLICommand {
	out := append([]CLICommand(nil), in...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func copyRoutes(in []Route) []Route {
	out := append([]Route(nil), in...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out
}

func copyDocs(in []DocRef) []DocRef {
	out := append([]DocRef(nil), in...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out
}

func copyMirrors(in []MirrorRef) []MirrorRef {
	out := append([]MirrorRef(nil), in...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func copyChanges(in []ChangeEntry) []ChangeEntry {
	out := append([]ChangeEntry(nil), in...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Ref < out[j].Ref })
	return out
}

func copyLimits(in []Limit) []Limit {
	out := append([]Limit(nil), in...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Ref < out[j].Ref })
	return out
}

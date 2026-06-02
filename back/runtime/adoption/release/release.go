// Package release is the AIDOS Runtime Release-v0 assembler (step S47): the pure,
// read-only function that INVENTORIES what exists in the live truth-store into a
// content-addressed ReleasePack proving "this AIDOS is launchable". It ASSEMBLES; it
// AUTHORS NOTHING, installs nothing, ships nothing, writes no truth.
//
// ASSEMBLE, NEVER AUTHOR (CLAUDE.md honesty rule). Every field of a ReleasePack is
// DERIVED from the passed-in read-only View — the live CLI command list, the live
// Workbench routes, the live mirrors (as the test inventory), the changeset history
// (as the changelog source), the docs index, the declared limits / OpenQuestions (as
// known_limits). Assemble does NOT invent a CLI command, a route, a demo, a doc, a
// changelog line, or a known-limit the View does not contain. An empty View yields an
// empty-but-valid pack (no fabricated content). The rapid property pins that every
// pack entry traces to a real View entry.
//
// CONTENT-ADDRESSED (S01/S02 REUSED, not forked). pack.id = Hash(Canonicalize(body))
// over the SAME scheme S01/S02 use (records.Canonicalize + records.Hash) — the pack
// lands under the same address in either store. The id is the hash of the canonical
// pack body EXCLUDING the id field itself.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Assemble is a pure, total function of
// (view, now) — no DB, no I/O; the clock is PASSED IN so the pack is deterministic and
// replayable. Same (view, now) ⇒ same pack.
//
// THE WALL (CLAUDE.md §2). This package is PURE and READ-ONLY over the View. It writes
// NOTHING. Recording a pack is a SELECT-only-for-the-agent row in fitness.release_pack,
// written only by the aidos CLI writer role through an approved ChangeSet (S20) — never
// from this package. Turning on a capability, shipping, publishing, deploying are NOT
// done here — Assemble is an inventory snapshot, never a deploy.
package release

import (
	"encoding/json"
	"sort"

	krec "github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/adoption"
)

// CLICommand is one live `aidos` CLI verb the View reports (e.g. check, impact,
// stable). CONSUMED from the live CLI surface, never invented.
type CLICommand struct {
	Name    string `json:"name"`
	Summary string `json:"summary,omitempty"`
}

// Route is one live Workbench route the View reports (e.g. /kernel-debt). CONSUMED
// from the live route list, never invented.
type Route struct {
	Path  string `json:"path"`
	Title string `json:"title,omitempty"`
}

// DemoRef points at a runnable demo cell that EXISTS in the View (e.g. the S46
// checkout slice). A reference, never an authored demo. Empty when the View has none.
type DemoRef struct {
	Ref   string `json:"ref,omitempty"`
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

// ChangeEntry is one changelog line DERIVED from a live changeset in the View — never
// an authored line. Ref traces to a real changeset id.
type ChangeEntry struct {
	Ref     string `json:"ref"`
	Summary string `json:"summary,omitempty"`
}

// Limit is one honest known-limit DERIVED from a declared limit / OpenQuestion in the
// View — never editorialised by the agent. Ref traces to a real declared limit.
type Limit struct {
	Ref         string `json:"ref"`
	Description string `json:"description,omitempty"`
}

// View is the read-only inventory Assemble reads: the live CLI commands, Workbench
// routes, the demo cell, the docs index, the live mirrors (test inventory), the
// changeset history (changelog source), the declared limits, and the kernel head the
// view was taken against. Assemble NEVER mutates it (the rapid property pins the input
// is unchanged). All slices may be empty (an empty View yields an empty-but-valid pack).
type View struct {
	CLICommands     []CLICommand  `json:"cli_commands"`
	WorkbenchRoutes []Route       `json:"workbench_routes"`
	Demo            DemoRef       `json:"demo"`
	Docs            []DocRef      `json:"docs"`
	Mirrors         []MirrorRef   `json:"mirrors"`
	Changesets      []ChangeEntry `json:"changesets"`
	DeclaredLimits  []Limit       `json:"declared_limits"`
	KernelHead      string        `json:"kernel_head"`
}

// ReleasePack is the typed, content-addressed Release-v0 bundle. id = Hash(Canonicalize
// (body)) over the canonical body EXCLUDING id. Every field is the View's content — no
// invented entry. AdoptionPlan is the ladder computed alongside, so a recorded pack
// carries both the inventory and the next-smallest-ratchet (the two halves of S47).
type ReleasePack struct {
	ID              string                `json:"id"`
	CLISurface      []CLICommand          `json:"cli_surface"`
	WorkbenchRoutes []Route               `json:"workbench_routes"`
	DemoCell        DemoRef               `json:"demo_cell"`
	DocsIndex       []DocRef              `json:"docs_index"`
	TestInventory   []MirrorRef           `json:"test_inventory"`
	Changelog       []ChangeEntry         `json:"changelog"`
	KnownLimits     []Limit               `json:"known_limits"`
	AdoptionPlan    adoption.AdoptionPlan `json:"adoption_plan"`
	AssembledAt     int64                 `json:"assembled_at"`
	KernelHead      string                `json:"kernel_head"`
}

// canonicalBody is the hashed shape of a ReleasePack (id and assembled_at EXCLUDED —
// the id IS the content hash; assembled_at is the recorder's stamp, not pack identity,
// so two assemblies of the same view at different times share an id). Keys are sorted
// by records.Canonicalize, so field order here is irrelevant.
type canonicalBody struct {
	AdoptionPlan    adoption.AdoptionPlan `json:"adoption_plan"`
	Changelog       []ChangeEntry         `json:"changelog"`
	CLISurface      []CLICommand          `json:"cli_surface"`
	DemoCell        DemoRef               `json:"demo_cell"`
	DocsIndex       []DocRef              `json:"docs_index"`
	KernelHead      string                `json:"kernel_head"`
	KnownLimits     []Limit               `json:"known_limits"`
	TestInventory   []MirrorRef           `json:"test_inventory"`
	WorkbenchRoutes []Route               `json:"workbench_routes"`
}

// packID computes the content address of a pack body, REUSING S01/S02's Canonicalize +
// Hash (never forked). Same logical pack ⇒ same id, independent of assembled_at.
func packID(cb canonicalBody) string {
	b, err := json.Marshal(cb)
	if err != nil {
		// cb is always marshalable; defensively hash the empty canonical object.
		return krec.Hash([]byte("{}"))
	}
	canon, err := krec.Canonicalize(b)
	if err != nil {
		return krec.Hash(b)
	}
	return krec.Hash(canon)
}

// capabilitiesFrom is intentionally NOT derived here: the adoption ladder is computed
// from the capability view, which the caller passes alongside the inventory View. This
// keeps Assemble a pure inventory and leaves the ladder to adoption.Plan (one source of
// the gating truth, not duplicated).

// Assemble inventories the live View into a content-addressed ReleasePack and pairs it
// with the adoption ladder computed from capabilities. Pure and total over
// (view, capabilities, now) — no DB, no I/O; the clock is PASSED IN (assembled_at). It
// AUTHORS NOTHING (every field is the View's content), installs nothing, ships nothing,
// writes no truth (the wall). It NEVER mutates the inputs. An empty View yields an
// empty-but-valid pack (no fabricated content). The pack id == Hash(Canonicalize(body)).
func Assemble(view View, capabilities []adoption.Capability, now int64) ReleasePack {
	// Defensive copies so the returned pack never aliases (and the inputs are never
	// mutated). nil slices stay nil-but-rendered as [] in JSON via the explicit make.
	cli := copyCLI(view.CLICommands)
	routes := copyRoutes(view.WorkbenchRoutes)
	docs := copyDocs(view.Docs)
	mirrors := copyMirrors(view.Mirrors)
	changelog := copyChanges(view.Changesets)
	limits := copyLimits(view.DeclaredLimits)

	plan := adoption.Plan(capabilities)

	cb := canonicalBody{
		AdoptionPlan:    plan,
		Changelog:       changelog,
		CLISurface:      cli,
		DemoCell:        view.Demo,
		DocsIndex:       docs,
		KernelHead:      view.KernelHead,
		KnownLimits:     limits,
		TestInventory:   mirrors,
		WorkbenchRoutes: routes,
	}

	return ReleasePack{
		ID:              packID(cb),
		CLISurface:      cli,
		WorkbenchRoutes: routes,
		DemoCell:        view.Demo,
		DocsIndex:       docs,
		TestInventory:   mirrors,
		Changelog:       changelog,
		KnownLimits:     limits,
		AdoptionPlan:    plan,
		AssembledAt:     now,
		KernelHead:      view.KernelHead,
	}
}

// The copy helpers below produce stable, sorted, defensive copies so Assemble is
// deterministic (same View ⇒ same ordering) and never mutates its input. Sorting by the
// natural key makes the canonical body — and thus the pack id — independent of the
// View's incoming order, while never adding or dropping an entry (inventory fidelity).

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

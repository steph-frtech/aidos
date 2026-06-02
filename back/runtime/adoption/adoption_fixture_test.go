package adoption_test

// S47 BDD MIRROR — FIXTURE (N2: state → command → events), conceptually stored in the
// `mirrors` schema (reflects: runtime.adoption.Plan + runtime.adoption.release.Assemble,
// test_kind: fixture, cert_language: operation-dsl/go, authority: below — fitness is a
// read-only diagnostic) and materialized here for the Go runner. These ARE the done
// criteria: T1 does NOT require QualityDiversity; T2 is blocked until the RealityMirror
// is live (and unlocks once it is); T4 is blocked until the EvolutionSandbox exists; the
// proposed next tier is the smallest one that clicks; the release pack is ASSEMBLED from
// the live view (nothing authored); the pack id is the content hash of its body; an
// empty view yields an empty-but-valid pack. The view is read-only throughout.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/adoption"
	"github.com/steph-frtech/aidos/back/runtime/adoption/release"
)

const fixedNow int64 = 1_700_000_000

func hasCap(caps []adoption.Capability, c adoption.Capability) bool {
	for _, x := range caps {
		if x == c {
			return true
		}
	}
	return false
}

func tierStatus(p adoption.AdoptionPlan, s adoption.AdoptionStage) (adoption.TierStatus, bool) {
	for _, ts := range p.Tiers {
		if ts.Stage == s {
			return ts, true
		}
	}
	return adoption.TierStatus{}, false
}

func gapMentions(gaps []adoption.Gap, c adoption.Capability) bool {
	for _, g := range gaps {
		if g.Missing == c {
			return true
		}
	}
	return false
}

// THE done criterion (T1 ↛ QD): T1 is satisfiable on its own grants and never requires
// QualityDiversity, and no Gap on T1 mentions QD.
func TestFixture_T1_DoesNotRequireQualityDiversity(t *testing.T) {
	caps := []adoption.Capability{adoption.CapTests, adoption.CapMutation, adoption.CapOneKRDCell}
	plan := adoption.Plan(caps)

	if hasCap(adoption.Requires(adoption.T1), adoption.CapQualityDiversity) {
		t.Fatalf("T1.requires must NOT contain QualityDiversity (QD is advanced, KRD §82.6) — monster")
	}
	ts, ok := tierStatus(plan, adoption.T1)
	if !ok || !ts.Satisfiable {
		t.Fatalf("T1 must be satisfiable with [tests, mutation, one_krd_cell], got %+v", ts)
	}
	if gapMentions(ts.Gaps, adoption.CapQualityDiversity) {
		t.Fatalf("no Gap on T1 may mention QualityDiversity, got %+v", ts.Gaps)
	}
}

// THE done criterion (T2 → RealityMirror): with no live RealityMirror, T2 is NOT
// satisfiable and carries a RealityMirror Gap.
func TestFixture_T2_BlockedUntilRealityMirrorLive(t *testing.T) {
	caps := []adoption.Capability{
		adoption.CapTests, adoption.CapMutation, adoption.CapOneKRDCell,
		adoption.CapKernel, adoption.CapMirror,
		// no reality_mirror_live
	}
	plan := adoption.Plan(caps)

	ts, ok := tierStatus(plan, adoption.T2)
	if !ok || ts.Satisfiable {
		t.Fatalf("T2 must NOT be satisfiable without a live RealityMirror, got %+v", ts)
	}
	if !gapMentions(ts.Gaps, adoption.CapRealityMirrorLive) {
		t.Fatalf("T2 must carry a RealityMirror Gap, got %+v", ts.Gaps)
	}
	// the next smallest installable tier is T2 with that single blocking gap.
	if plan.Next != adoption.T2 {
		t.Fatalf("next tier should be T2 (the smallest unsatisfied), got %q", plan.Next)
	}
	if !gapMentions(plan.NextGaps, adoption.CapRealityMirrorLive) {
		t.Fatalf("the next-tier gap should name the RealityMirror, got %+v", plan.NextGaps)
	}
}

// T2 unlocks once the RealityMirror is live — no RealityMirror Gap remains.
func TestFixture_T2_UnlocksOnceRealityMirrorLive(t *testing.T) {
	caps := []adoption.Capability{
		adoption.CapTests, adoption.CapMutation, adoption.CapOneKRDCell,
		adoption.CapKernel, adoption.CapMirror, adoption.CapRealityMirrorLive,
	}
	plan := adoption.Plan(caps)
	ts, _ := tierStatus(plan, adoption.T2)
	if !ts.Satisfiable {
		t.Fatalf("T2 must be satisfiable once the RealityMirror is live, got %+v", ts)
	}
	if gapMentions(ts.Gaps, adoption.CapRealityMirrorLive) {
		t.Fatalf("no RealityMirror Gap should remain once it is live, got %+v", ts.Gaps)
	}
}

// THE done criterion (T4 → EvolutionSandbox): with no EvolutionSandbox, T4 is NOT
// satisfiable and carries an EvolutionSandbox Gap (KRD §66.1).
func TestFixture_T4_BlockedUntilEvolutionSandboxExists(t *testing.T) {
	caps := []adoption.Capability{
		adoption.CapTests, adoption.CapMutation, adoption.CapOneKRDCell,
		adoption.CapKernel, adoption.CapMirror, adoption.CapRealityMirrorLive,
		adoption.CapContextGraph, adoption.CapMemory,
		// no evolution_sandbox
	}
	plan := adoption.Plan(caps)
	ts, ok := tierStatus(plan, adoption.T4)
	if !ok || ts.Satisfiable {
		t.Fatalf("T4 must NOT be satisfiable without an EvolutionSandbox, got %+v", ts)
	}
	if !gapMentions(ts.Gaps, adoption.CapEvolutionSandbox) {
		t.Fatalf("T4 must carry an EvolutionSandbox Gap (KRD §66.1), got %+v", ts.Gaps)
	}
}

// the next smallest ratchet that clicks is proposed: only T0's grants ⇒ current == T0,
// next == T1, T1's single gap is one_krd_cell; Plan does NOT jump to T2/T3/T4.
func TestFixture_NextSmallestRatchetThatClicks(t *testing.T) {
	caps := []adoption.Capability{adoption.CapTests, adoption.CapMutation}
	plan := adoption.Plan(caps)
	if plan.Current != adoption.T0 {
		t.Fatalf("current tier should be T0, got %q", plan.Current)
	}
	if plan.Next != adoption.T1 {
		t.Fatalf("next tier should be T1 (the smallest that clicks), got %q", plan.Next)
	}
	if len(plan.NextGaps) != 1 || plan.NextGaps[0].Missing != adoption.CapOneKRDCell {
		t.Fatalf("T1's single gap should be one_krd_cell, got %+v", plan.NextGaps)
	}
}

// THE done criterion (assembled): the release pack is assembled from the live view —
// every field is the view's content (none invented); it writes no truth, ships nothing.
func TestFixture_ReleasePackAssembledFromLiveView(t *testing.T) {
	view := release.View{
		CLICommands:     []release.CLICommand{{Name: "check"}, {Name: "impact"}, {Name: "stable"}},
		WorkbenchRoutes: []release.Route{{Path: "/kernel-debt"}, {Path: "/adoption"}},
		Demo:            release.DemoRef{Ref: "examples.checkout.full-loop", Title: "Checkout slice"},
		Docs:            []release.DocRef{{Slug: "steps/concept/s47-adoption-release"}},
		Mirrors:         []release.MirrorRef{{ID: "mir-1", Reflects: "adoption.Plan", TestKind: "fixture"}},
		Changesets:      []release.ChangeEntry{{Ref: "cs-1", Summary: "S47 adoption ladder"}},
		DeclaredLimits:  []release.Limit{{Ref: "oq-1", Description: "ladder + assemble only, no install"}},
		KernelHead:      "head-47",
	}
	before := view
	caps := []adoption.Capability{adoption.CapTests, adoption.CapMutation}

	pack := release.Assemble(view, caps, fixedNow)

	if len(pack.CLISurface) != 3 {
		t.Fatalf("cli_surface must be the view's 3 commands (none invented), got %+v", pack.CLISurface)
	}
	if len(pack.WorkbenchRoutes) != 2 {
		t.Fatalf("workbench_routes must be the view's 2 routes, got %+v", pack.WorkbenchRoutes)
	}
	if len(pack.TestInventory) != 1 || pack.TestInventory[0].ID != "mir-1" {
		t.Fatalf("test_inventory must be the view's live mirrors, got %+v", pack.TestInventory)
	}
	if len(pack.Changelog) != 1 || pack.Changelog[0].Ref != "cs-1" {
		t.Fatalf("changelog must be derived from the view's changesets, got %+v", pack.Changelog)
	}
	if len(pack.KnownLimits) != 1 || pack.KnownLimits[0].Ref != "oq-1" {
		t.Fatalf("known_limits must be the view's declared limits, got %+v", pack.KnownLimits)
	}
	if pack.DemoCell.Ref != "examples.checkout.full-loop" {
		t.Fatalf("demo_cell must be the view's demo ref, got %+v", pack.DemoCell)
	}
	if pack.AssembledAt != fixedNow {
		t.Fatalf("assembled_at must be the passed-in now, got %d", pack.AssembledAt)
	}
	// read-only: the view is unchanged.
	if !reflect.DeepEqual(before, view) {
		t.Fatalf("Assemble mutated the input view — the wall: it must be read-only")
	}
}

// the recorded pack id is the content hash of its body — content-addressed (S01/S02
// reused). Two assemblies of the same view (different now) share an id.
func TestFixture_PackIDIsContentHashOfBody(t *testing.T) {
	view := release.View{
		CLICommands: []release.CLICommand{{Name: "check"}},
		KernelHead:  "head-1",
	}
	caps := []adoption.Capability{adoption.CapTests}
	p1 := release.Assemble(view, caps, fixedNow)
	p2 := release.Assemble(view, caps, fixedNow+999)
	if p1.ID == "" {
		t.Fatalf("pack id must be set (the content hash)")
	}
	if p1.ID != p2.ID {
		t.Fatalf("pack id must be the content hash of the body (independent of now): %q vs %q", p1.ID, p2.ID)
	}
}

// an empty view yields an empty-but-valid pack, never invented content.
func TestFixture_EmptyViewYieldsEmptyButValidPack(t *testing.T) {
	pack := release.Assemble(release.View{}, nil, fixedNow)
	if len(pack.CLISurface) != 0 || len(pack.WorkbenchRoutes) != 0 || len(pack.TestInventory) != 0 ||
		len(pack.Changelog) != 0 || len(pack.KnownLimits) != 0 || len(pack.DocsIndex) != 0 {
		t.Fatalf("empty view must yield empty lists (no fabricated content), got %+v", pack)
	}
	if pack.DemoCell.Ref != "" {
		t.Fatalf("empty view must yield no demo, got %+v", pack.DemoCell)
	}
	if pack.ID == "" {
		t.Fatalf("an empty pack must still be content-addressed (a valid id)")
	}
}

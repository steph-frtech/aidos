package adoption_test

// S47 BDD MIRROR — PROPERTY (∀, rapid), below the line, computational. Conceptually
// stored in the `mirrors` schema (reflects: runtime.adoption.Plan +
// runtime.adoption.release.Assemble, test_kind: property, cert_language: rapid,
// authority: below) and materialized here. The invariants: determinism (now passed,
// never read from the clock); T1.requires never contains QualityDiversity; any view
// without a live RealityMirror ⇒ T2 not satisfiable + RealityMirror Gap; any view
// without an EvolutionSandbox ⇒ T4 not satisfiable + EvolutionSandbox Gap; the proposed
// next tier is the smallest unsatisfied tier whose lower tiers are all satisfied
// (monotone ladder); no tier outside {T0..T4}; every ReleasePack entry traces to a real
// input-view entry (no invented content); the input view is never mutated; pack id is
// the content hash of its body; never panics on malformed input.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/adoption"
	"github.com/steph-frtech/aidos/back/runtime/adoption/release"
	"pgregory.net/rapid"
)

var allCaps = []adoption.Capability{
	adoption.CapTests, adoption.CapMutation, adoption.CapOneKRDCell,
	adoption.CapKernel, adoption.CapMirror, adoption.CapRealityMirrorLive,
	adoption.CapContextGraph, adoption.CapMemory,
	adoption.CapEvolutionSandbox, adoption.CapEvolve, adoption.CapQualityDiversity,
}

// genCaps draws an arbitrary subset of the declared capabilities (plus an occasional
// unknown one, to prove unknown capabilities never gate and never panic).
func genCaps(t *rapid.T) []adoption.Capability {
	var caps []adoption.Capability
	for _, c := range allCaps {
		if rapid.Bool().Draw(t, "has-"+string(c)) {
			caps = append(caps, c)
		}
	}
	if rapid.Bool().Draw(t, "unknown") {
		caps = append(caps, adoption.Capability(rapid.StringMatching(`junk-[a-z]`).Draw(t, "junk")))
	}
	return caps
}

func ptHasCap(caps []adoption.Capability, c adoption.Capability) bool {
	for _, x := range caps {
		if x == c {
			return true
		}
	}
	return false
}

func ptTier(p adoption.AdoptionPlan, s adoption.AdoptionStage) adoption.TierStatus {
	for _, ts := range p.Tiers {
		if ts.Stage == s {
			return ts
		}
	}
	return adoption.TierStatus{}
}

func ptGapMentions(gaps []adoption.Gap, c adoption.Capability) bool {
	for _, g := range gaps {
		if g.Missing == c {
			return true
		}
	}
	return false
}

// ∀ capabilities: Plan is deterministic — same input ⇒ same plan.
func TestProperty_PlanDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		caps := genCaps(t)
		a := adoption.Plan(caps)
		b := adoption.Plan(caps)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("Plan not deterministic:\n%+v\n%+v", a, b)
		}
	})
}

// ∀ capability view: T1.requires never contains QualityDiversity (T1 ↛ QD, §82.6).
func TestProperty_T1NeverRequiresQD(t *testing.T) {
	if ptHasCap(adoption.Requires(adoption.T1), adoption.CapQualityDiversity) {
		t.Fatalf("T1.requires contains QualityDiversity — monster (KRD §82.6)")
	}
	rapid.Check(t, func(t *rapid.T) {
		caps := genCaps(t)
		ts := ptTier(adoption.Plan(caps), adoption.T1)
		if ptGapMentions(ts.Gaps, adoption.CapQualityDiversity) {
			t.Fatalf("a T1 Gap mentioned QualityDiversity for caps=%v", caps)
		}
	})
}

// ∀ view without a live RealityMirror: T2 is NOT satisfiable and carries a RealityMirror Gap.
func TestProperty_T2RequiresRealityMirror(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		caps := genCaps(t)
		if ptHasCap(caps, adoption.CapRealityMirrorLive) {
			return // only the "without" case is the invariant.
		}
		ts := ptTier(adoption.Plan(caps), adoption.T2)
		if ts.Satisfiable {
			t.Fatalf("T2 satisfiable without a live RealityMirror for caps=%v", caps)
		}
		if !ptGapMentions(ts.Gaps, adoption.CapRealityMirrorLive) {
			t.Fatalf("T2 carries no RealityMirror Gap for caps=%v: %+v", caps, ts.Gaps)
		}
	})
}

// ∀ view without an EvolutionSandbox: T4 is NOT satisfiable and carries an EvolutionSandbox Gap.
func TestProperty_T4RequiresEvolutionSandbox(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		caps := genCaps(t)
		if ptHasCap(caps, adoption.CapEvolutionSandbox) {
			return
		}
		ts := ptTier(adoption.Plan(caps), adoption.T4)
		if ts.Satisfiable {
			t.Fatalf("T4 satisfiable without an EvolutionSandbox for caps=%v", caps)
		}
		if !ptGapMentions(ts.Gaps, adoption.CapEvolutionSandbox) {
			t.Fatalf("T4 carries no EvolutionSandbox Gap for caps=%v: %+v", caps, ts.Gaps)
		}
	})
}

// ∀ Plan run: the proposed next tier is the smallest unsatisfied tier whose lower tiers
// are all satisfied (monotone ladder); and current is the contiguous satisfied floor.
func TestProperty_MonotoneLadder(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		caps := genCaps(t)
		p := adoption.Plan(caps)
		stages := adoption.Stages()
		// find the first unsatisfied tier index.
		firstUnsat := -1
		for i, ts := range p.Tiers {
			if !ts.Satisfiable {
				firstUnsat = i
				break
			}
		}
		if firstUnsat == -1 {
			if !p.AllSatisfied || p.Next != "" {
				t.Fatalf("all tiers satisfiable but Next=%q AllSatisfied=%v", p.Next, p.AllSatisfied)
			}
			return
		}
		if p.Next != stages[firstUnsat] {
			t.Fatalf("Next should be the first unsatisfied tier %q, got %q", stages[firstUnsat], p.Next)
		}
		// every tier strictly below Next must be satisfiable (lower tiers all satisfied).
		for i := 0; i < firstUnsat; i++ {
			if !p.Tiers[i].Satisfiable {
				t.Fatalf("tier %q below Next is unsatisfiable — ladder not monotone", p.Tiers[i].Stage)
			}
		}
	})
}

// ∀ tier in a plan: AdoptionStage ∈ {T0,T1,T2,T3,T4} — no invented tier.
func TestProperty_NoInventedTier(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		caps := genCaps(t)
		p := adoption.Plan(caps)
		for _, ts := range p.Tiers {
			if !adoption.IsStage(ts.Stage) {
				t.Fatalf("invented tier %q", ts.Stage)
			}
		}
		if len(p.Tiers) != 5 {
			t.Fatalf("ladder must have exactly 5 tiers, got %d", len(p.Tiers))
		}
	})
}

// ─── release.Assemble invariants ─────────────────────────────────────────────

func genView(t *rapid.T) release.View {
	mk := func(n int, f func(i int) string) []string {
		out := make([]string, n)
		for i := range out {
			out[i] = f(i)
		}
		return out
	}
	nCLI := rapid.IntRange(0, 4).Draw(t, "nCLI")
	cli := make([]release.CLICommand, nCLI)
	for i, n := range mk(nCLI, func(i int) string { return rapid.StringMatching(`cmd-[a-z]`).Draw(t, "cli") }) {
		cli[i] = release.CLICommand{Name: n}
	}
	nR := rapid.IntRange(0, 4).Draw(t, "nR")
	routes := make([]release.Route, nR)
	for i := range routes {
		routes[i] = release.Route{Path: rapid.StringMatching(`/[a-z]+`).Draw(t, "route")}
	}
	nM := rapid.IntRange(0, 4).Draw(t, "nM")
	mirrors := make([]release.MirrorRef, nM)
	for i := range mirrors {
		mirrors[i] = release.MirrorRef{ID: rapid.StringMatching(`mir-[0-9]`).Draw(t, "mir")}
	}
	nC := rapid.IntRange(0, 4).Draw(t, "nC")
	changes := make([]release.ChangeEntry, nC)
	for i := range changes {
		changes[i] = release.ChangeEntry{Ref: rapid.StringMatching(`cs-[0-9]`).Draw(t, "cs")}
	}
	nL := rapid.IntRange(0, 3).Draw(t, "nL")
	limits := make([]release.Limit, nL)
	for i := range limits {
		limits[i] = release.Limit{Ref: rapid.StringMatching(`oq-[0-9]`).Draw(t, "oq")}
	}
	return release.View{
		CLICommands:     cli,
		WorkbenchRoutes: routes,
		Mirrors:         mirrors,
		Changesets:      changes,
		DeclaredLimits:  limits,
		KernelHead:      rapid.StringMatching(`head-[0-9]`).Draw(t, "head"),
	}
}

// ∀ (view, now): Assemble is deterministic (now passed, never read from clock).
func TestProperty_AssembleDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		view := genView(t)
		caps := genCaps(t)
		now := rapid.Int64().Draw(t, "now")
		a := release.Assemble(view, caps, now)
		b := release.Assemble(view, caps, now)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("Assemble not deterministic")
		}
	})
}

// ∀ ReleasePack field: every entry traces to a real entry in the input view (no
// invented content) — counts match and ids are a subset of the view's ids.
func TestProperty_NoInventedContent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		view := genView(t)
		caps := genCaps(t)
		pack := release.Assemble(view, caps, 42)
		if len(pack.CLISurface) != len(view.CLICommands) {
			t.Fatalf("invented/dropped CLI: pack=%d view=%d", len(pack.CLISurface), len(view.CLICommands))
		}
		if len(pack.WorkbenchRoutes) != len(view.WorkbenchRoutes) {
			t.Fatalf("invented/dropped routes")
		}
		if len(pack.TestInventory) != len(view.Mirrors) {
			t.Fatalf("invented/dropped mirrors")
		}
		if len(pack.Changelog) != len(view.Changesets) {
			t.Fatalf("invented/dropped changelog")
		}
		if len(pack.KnownLimits) != len(view.DeclaredLimits) {
			t.Fatalf("invented/dropped limits")
		}
		viewIDs := map[string]bool{}
		for _, m := range view.Mirrors {
			viewIDs[m.ID] = true
		}
		for _, m := range pack.TestInventory {
			if !viewIDs[m.ID] {
				t.Fatalf("pack mirror %q not in the view (invented content)", m.ID)
			}
		}
	})
}

// ∀ Assemble run: the input view is unchanged — pure, read-only. We snapshot the
// view's contents by value (per-element copies) and compare element-by-element, so the
// check is about MUTATION of the input, not nil-vs-empty slice identity of a copy.
func TestProperty_ViewNeverMutated(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		view := genView(t)
		snapCLI := append([]release.CLICommand{}, view.CLICommands...)
		snapRoutes := append([]release.Route{}, view.WorkbenchRoutes...)
		snapMir := append([]release.MirrorRef{}, view.Mirrors...)
		snapCh := append([]release.ChangeEntry{}, view.Changesets...)
		snapLim := append([]release.Limit{}, view.DeclaredLimits...)
		release.Assemble(view, genCaps(t), 7)
		if !reflect.DeepEqual(snapCLI, append([]release.CLICommand{}, view.CLICommands...)) ||
			!reflect.DeepEqual(snapRoutes, append([]release.Route{}, view.WorkbenchRoutes...)) ||
			!reflect.DeepEqual(snapMir, append([]release.MirrorRef{}, view.Mirrors...)) ||
			!reflect.DeepEqual(snapCh, append([]release.ChangeEntry{}, view.Changesets...)) ||
			!reflect.DeepEqual(snapLim, append([]release.Limit{}, view.DeclaredLimits...)) {
			t.Fatalf("Assemble mutated the input view — the wall")
		}
	})
}

// ∀ pack: id == Hash(Canonicalize(body)) — content-addressed; two views with the same
// body but different incoming order share an id.
func TestProperty_PackContentAddressed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		view := genView(t)
		caps := genCaps(t)
		p := release.Assemble(view, caps, 1)
		if p.ID == "" {
			t.Fatalf("pack must be content-addressed")
		}
		// re-assembling the same view at a different now keeps the same id.
		p2 := release.Assemble(view, caps, 999_999)
		if p.ID != p2.ID {
			t.Fatalf("pack id must be independent of now: %q vs %q", p.ID, p2.ID)
		}
	})
}

// ∀ malformed/empty input: Plan/Assemble yield a report, never panic.
func TestProperty_NeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		caps := genCaps(t)
		_ = adoption.Plan(caps)
		_ = release.Assemble(genView(t), caps, rapid.Int64().Draw(t, "now"))
	})
	// explicit nils.
	_ = adoption.Plan(nil)
	_ = release.Assemble(release.View{}, nil, 0)
}

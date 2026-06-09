package accountrelease

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/adoption"
)

// S117 reproducibility mirror (rapid ∀, N1) — the determinism-first invariant
// (CLAUDE.md §6/§8): Assemble is a pure, total function of (view, now). For ANY
// account view: (1) same (view, now) ⇒ byte-identical pack; (2) the id is independent
// of assembled_at (content-address excludes the stamp); (3) Assemble NEVER mutates its
// input; (4) every project/limit in the pack traces to a real view entry (no
// fabrication); (5) the pack id is stable across input ORDER (sorted canonicalisation).

func drawView(t *rapid.T) AccountView {
	statuses := []ProjectStatus{ProjectReal, ProjectDemo}
	nProj := rapid.IntRange(0, 5).Draw(t, "nProj")
	projects := make([]ProjectEntry, 0, nProj)
	for i := 0; i < nProj; i++ {
		projects = append(projects, ProjectEntry{
			ID:     rapid.StringMatching(`[a-z]{1,5}`).Draw(t, "pid"),
			Name:   rapid.StringMatching(`[A-Za-z]{0,6}`).Draw(t, "pname"),
			Status: rapid.SampledFrom(statuses).Draw(t, "pstatus"),
		})
	}
	nLim := rapid.IntRange(0, 3).Draw(t, "nLim")
	limits := make([]Limit, 0, nLim)
	for i := 0; i < nLim; i++ {
		limits = append(limits, Limit{Ref: rapid.StringMatching(`[a-z]{1,5}`).Draw(t, "lref")})
	}
	caps := []adoption.Capability{}
	allCaps := []adoption.Capability{adoption.CapTests, adoption.CapMutation, adoption.CapOneKRDCell, adoption.CapKernel}
	for _, c := range allCaps {
		if rapid.Bool().Draw(t, "cap_"+string(c)) {
			caps = append(caps, c)
		}
	}
	return AccountView{
		Account:        rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "acct"),
		Projects:       projects,
		DeclaredLimits: limits,
		Capabilities:   caps,
	}
}

func TestProperty_SameViewSamePack(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		v := drawView(rt)
		now := rapid.Int64().Draw(rt, "now")
		a := Assemble(v, now)
		b := Assemble(v, now)
		if !reflect.DeepEqual(a, b) {
			rt.Fatalf("Assemble not deterministic for the same (view, now)")
		}
	})
}

func TestProperty_IDExcludesAssembledAt(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		v := drawView(rt)
		a := Assemble(v, rapid.Int64().Draw(rt, "n1"))
		b := Assemble(v, rapid.Int64().Draw(rt, "n2"))
		if a.ID != b.ID {
			rt.Fatalf("pack id depends on assembled_at: %q vs %q", a.ID, b.ID)
		}
	})
}

func TestProperty_ViewNeverMutated(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		v := drawView(rt)
		before := deepCopy(v)
		_ = Assemble(v, rapid.Int64().Draw(rt, "now"))
		if !reflect.DeepEqual(v, before) {
			rt.Fatalf("Assemble mutated its input view")
		}
	})
}

func TestProperty_EveryEntryTracesToTheView(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		v := drawView(rt)
		pack := Assemble(v, rapid.Int64().Draw(rt, "now"))
		// Same count in ⇒ same count out (no fabrication, no silent drop).
		if len(pack.Projects) != len(v.Projects) {
			rt.Fatalf("project count changed: in=%d out=%d", len(v.Projects), len(pack.Projects))
		}
		if len(pack.KnownLimits) != len(v.DeclaredLimits) {
			rt.Fatalf("limit count changed: in=%d out=%d", len(v.DeclaredLimits), len(pack.KnownLimits))
		}
		// Every output project id exists in the view (no invented project).
		inIDs := map[string]bool{}
		for _, p := range v.Projects {
			inIDs[p.ID] = true
		}
		for _, p := range pack.Projects {
			if !inIDs[p.ID] {
				rt.Fatalf("fabricated project id %q not in the view", p.ID)
			}
		}
	})
}

// deepCopy snapshots the view, PRESERVING nil-vs-empty-slice (append on an empty-but-
// non-nil slice would collapse it to nil and create a false mismatch in DeepEqual). We
// only need a value copy of the slices' contents to detect a mutation by Assemble.
func deepCopy(v AccountView) AccountView {
	out := v
	if v.Projects != nil {
		out.Projects = append([]ProjectEntry{}, v.Projects...)
	}
	if v.DeclaredLimits != nil {
		out.DeclaredLimits = append([]Limit{}, v.DeclaredLimits...)
	}
	if v.Capabilities != nil {
		out.Capabilities = append([]adoption.Capability{}, v.Capabilities...)
	}
	return out
}

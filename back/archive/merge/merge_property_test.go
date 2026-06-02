package merge_test

// PROPERTY MIRROR (∀) for archive.merge.MergeSemantic — conceptually stored in the `mirrors`
// schema, materialized here for the Go runner (rapid is the frozen invariant slot, ADR 0003).
//
//	# reflects: archive.merge.MergeSemantic · test_kind: property · cert_language: rapid · authority: below
//
// The invariants are KRD §122/§130 (the mirror decides the conflict, not the text diff), pinned as
// computational properties of the pure MergeSemantic (the merge RULE itself — what a stable cut is —
// is the human's, above the line, pinned by phases.IsStable + the fixture). The properties:
//
//  1. DETERMINISTIC + TOTAL. ∀ inputs ⇒ same MergeResult; status ∈ {clean, conflict, unresolvable}.
//  2. ANY RED ⇒ CONFLICT. A mappable merge whose merged cut has ≥1 red mirror ⇒ conflict (never clean).
//  3. ALL GREEN ⇒ CLEAN. A mappable merge whose merged cut is fully green ⇒ clean ∧ conflicting == [].
//  4. IDENTITY ⇒ CLEAN NO-OP. MergeSemantic(base, base, base) with green base ⇒ clean (no spurious conflict).
//  5. TEXT NEVER OVERRIDES RED. A textually-clean pair (disjoint deltas) with a red merged-cut mirror ⇒ conflict.
//  6. CONFLICT ⇒ REQUIRES AUTHORITY ∧ NAMED. conflict ⇒ requires_authority ∧ conflicting_mirrors non-empty.
//  7. UNRESOLVABLE ⇒ NO FABRICATED CLEAN. no common ancestor ⇒ unresolvable ∧ OpenQuestion ∧ no hash.
//  8. NEVER PANICS. ∀ input (incl. nil cut/sensors/links) ⇒ MergeSemantic yields a verdict, never crashes.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/merge"
	"github.com/steph-frtech/aidos/back/archive/phases"
	"pgregory.net/rapid"
)

const ancestor = "base-v0"

// genSensors draws a small slice of mirror verdicts with arbitrary ids and pass flags.
func genSensors(t *rapid.T, label string) []phases.SensorStatus {
	n := rapid.IntRange(0, 4).Draw(t, label+"-n")
	out := make([]phases.SensorStatus, 0, n)
	for i := 0; i < n; i++ {
		id := rapid.SampledFrom([]string{"refund", "cart.own_mirror", "pay", "amount", "promo", "help"}).Draw(t, label+"-id")
		pass := rapid.Bool().Draw(t, label+"-pass")
		out = append(out, phases.SensorStatus{ID: id, Pass: pass})
	}
	return out
}

// genCut draws a small selection (constraintId → version).
func genCut(t *rapid.T, label string) phases.Cut {
	n := rapid.IntRange(0, 3).Draw(t, label+"-cn")
	c := phases.Cut{}
	for i := 0; i < n; i++ {
		k := rapid.SampledFrom([]string{"refund", "cart", "view", "promo-banner", "help-link"}).Draw(t, label+"-ck")
		v := rapid.SampledFrom([]string{"v1", "v2", "v2-EU", "v2-US"}).Draw(t, label+"-cv")
		c[k] = v
	}
	return c
}

// genMappableMerge draws a base + left + right that DO share the common ancestor (a mappable merge).
func genMappableMerge(t *rapid.T) (merge.Base, merge.Branch, merge.Branch) {
	base := merge.Base{
		ID:      ancestor,
		Cut:     genCut(t, "base"),
		Sensors: genSensors(t, "base"),
	}
	left := merge.Branch{Ancestor: ancestor, Deltas: genCut(t, "left"), AddedSensors: genSensors(t, "left")}
	right := merge.Branch{Ancestor: ancestor, Deltas: genCut(t, "right"), AddedSensors: genSensors(t, "right")}
	return base, left, right
}

// anyRed reports whether the union of base + left + right sensor verdicts contains a red one
// (the merged cut's sensor snapshot reddens). This mirrors the merged-sensor assembly (last-writer
// per id) — it is the oracle the property checks MergeSemantic against, not a re-implementation of it.
func anyRed(base merge.Base, left, right merge.Branch) bool {
	last := map[string]bool{}
	order := func(ss []phases.SensorStatus) {
		for _, s := range ss {
			last[s.ID] = s.Pass
		}
	}
	order(base.Sensors)
	order(left.AddedSensors)
	order(right.AddedSensors)
	for _, pass := range last {
		if !pass {
			return true
		}
	}
	return false
}

// Property 1 — deterministic + total: same input ⇒ same result; status is one of the closed three.
func TestProp_DeterministicTotal(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base, left, right := genMappableMerge(t)
		a := merge.MergeSemantic(base, left, right, nil)
		b := merge.MergeSemantic(base, left, right, nil)
		if a.Status != b.Status || a.MergedCutHash != b.MergedCutHash || a.RequiresAuthority != b.RequiresAuthority {
			t.Fatalf("non-deterministic: %+v vs %+v", a, b)
		}
		switch a.Status {
		case merge.StatusClean, merge.StatusConflict, merge.StatusUnresolvable:
		default:
			t.Fatalf("status %q not in the closed set {clean, conflict, unresolvable}", a.Status)
		}
	})
}

// Properties 2, 3, 5, 6 — the mirror decides (no merged links here ⇒ the sensor union is the oracle).
func TestProp_MirrorDecides(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base, left, right := genMappableMerge(t)
		got := merge.MergeSemantic(base, left, right, nil)
		// A mappable merge with no links is always clean or conflict (never unresolvable).
		if got.Status == merge.StatusUnresolvable {
			t.Fatalf("a mappable merge must not be unresolvable: %+v", got)
		}
		red := anyRed(base, left, right)
		if red {
			// Property 2 + 5: any red mirror on the merged cut ⇒ conflict (text-cleanliness — disjoint
			// deltas — NEVER overrides a red mirror).
			if got.Status != merge.StatusConflict {
				t.Fatalf("a red merged-cut mirror must yield conflict, got %q (%+v)", got.Status, got)
			}
			// Property 6: conflict ⇒ requires authority ∧ named.
			if !got.RequiresAuthority {
				t.Fatalf("conflict must require authority (override): %+v", got)
			}
			if len(got.ConflictingMirrors) == 0 {
				t.Fatalf("conflict must name ≥1 conflicting mirror: %+v", got)
			}
		} else {
			// Property 3: a fully-green merged-cut aggregate ⇒ clean ∧ conflicting_mirrors == [].
			if got.Status != merge.StatusClean {
				t.Fatalf("a fully-green merged cut must be clean, got %q (%+v)", got.Status, got)
			}
			if len(got.ConflictingMirrors) != 0 {
				t.Fatalf("clean must have empty conflicting_mirrors: %+v", got)
			}
			if got.RequiresAuthority {
				t.Fatalf("clean must not require authority: %+v", got)
			}
		}
		// clean/conflict always carry a merged_cut@hash.
		if got.MergedCutHash == "" {
			t.Fatalf("a %s merge must carry a merged_cut@hash: %+v", got.Status, got)
		}
	})
}

// Property 4 — identity ⇒ clean no-op (a green base merged with itself).
func TestProp_IdentityCleanNoOp(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := merge.Base{
			ID:      ancestor,
			Cut:     genCut(t, "base"),
			Sensors: []phases.SensorStatus{{ID: "refund", Pass: true}},
		}
		self := merge.Branch{Ancestor: ancestor} // no deltas, no added sensors
		got := merge.MergeSemantic(base, self, self, nil)
		if got.Status != merge.StatusClean {
			t.Fatalf("identity merge of a green base must be clean, got %q (%+v)", got.Status, got)
		}
		if len(got.ConflictingMirrors) != 0 {
			t.Fatalf("identity clean must have no conflicts: %+v", got)
		}
	})
}

// Property 7 — no common ancestor ⇒ unresolvable ∧ OpenQuestion ∧ no fabricated clean / hash.
func TestProp_UnresolvableNeverFabricatesClean(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := merge.Base{ID: rapid.SampledFrom([]string{"v0", "base-v0"}).Draw(t, "baseid"), Cut: genCut(t, "base")}
		// At least one branch descends from a DIFFERENT ancestor.
		la := rapid.SampledFrom([]string{"a", "b", ""}).Draw(t, "la")
		ra := rapid.SampledFrom([]string{"a", "b", ""}).Draw(t, "ra")
		if la == base.ID && ra == base.ID {
			la = "a" // force a mismatch so the case is genuinely unresolvable
		}
		got := merge.MergeSemantic(base, merge.Branch{Ancestor: la}, merge.Branch{Ancestor: ra}, nil)
		if got.Status != merge.StatusUnresolvable {
			t.Fatalf("a mismatched-ancestor merge must be unresolvable, got %q (%+v)", got.Status, got)
		}
		if got.OpenQuestion == "" {
			t.Fatalf("unresolvable must carry an OpenQuestion (never a fabricated clean): %+v", got)
		}
		if got.MergedCutHash != "" {
			t.Fatalf("unresolvable must not fabricate a merged_cut@hash: %+v", got)
		}
	})
}

// Property 8 — never panics, even on nil cut / sensors / links / heads.
func TestProp_NeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := merge.Base{ID: ancestor, Cut: nil, Sensors: nil, Links: nil, Heads: nil}
		left := merge.Branch{Ancestor: ancestor, Deltas: nil, AddedSensors: nil, Links: nil}
		right := merge.Branch{Ancestor: ancestor, Deltas: nil, AddedSensors: nil, Links: nil}
		_ = merge.MergeSemantic(base, left, right, nil) // must not panic
		// also a totally empty input
		_ = merge.MergeSemantic(merge.Base{}, merge.Branch{}, merge.Branch{}, nil)
	})
}

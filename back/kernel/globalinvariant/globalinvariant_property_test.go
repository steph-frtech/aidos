package globalinvariant_test

// Property mirror (∀) for the cross-cell GlobalInvariant (KRD §49.1). reflects=
// kernel.global_invariant · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (the invariants are computational properties of the pure RedWave / Admit /
// Validate; the §49.1 RULE itself is the human's, above the line, pinned by the fixture). Run
// via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are KRD §49.1:
//
//  1. RedWave TOTAL + DETERMINISTIC. For any invariant + violated cell, RedWave never panics
//     and the same input always yields the same set.
//  2. NO UNDER-PROPAGATION. For a contract_pair / federation_policy invariant, the returned set
//     ALWAYS contains every cell the invariant spans (a cross-cell violation never reddens
//     fewer cells than the invariant's reach). A local_cell invariant reddens exactly one cell.
//  3. Admit TOTAL + DETERMINISTIC. Admit always returns one of {admitted, blocked, escalated},
//     never panics, same input ⇒ same verdict.
//  4. MONOTONE IN RADIUS. A wider blast_radius is admitted only with an equal-or-wider approval
//     tier (global ⇒ never admitted without architecture_owner; widening the radius never
//     widens the set of approvals that admit it — never admitted with a narrower approval).
//  5. ENUM + CARDINALITY GUARDS. An out-of-enum scope/blast_radius/approval_required ⇒ Validate
//     errors; a contract_pair/federation_policy naming < 2 distinct cells ⇒ Validate errors.

import (
	"testing"

	gi "github.com/steph-frtech/aidos/back/kernel/globalinvariant"
	"pgregory.net/rapid"
)

var (
	allScopes      = []gi.Scope{gi.ScopeLocalCell, gi.ScopeContractPair, gi.ScopeFederationPolicy}
	allRadii       = []gi.BlastRadius{gi.BlastRadiusSmall, gi.BlastRadiusBounded, gi.BlastRadiusGlobal}
	allAuthorities = []gi.Authority{gi.AuthorityCellOwner, gi.AuthorityBothContractOwners, gi.AuthorityArchitectureOwner}
	cellPool       = []gi.CellRef{"checkout", "profile", "billing", "order", "payment", "shipping"}
)

func authRank(a gi.Authority) int {
	for i, x := range allAuthorities {
		if x == a {
			return i
		}
	}
	return -1
}

func radiusRank(b gi.BlastRadius) int {
	for i, x := range allRadii {
		if x == b {
			return i
		}
	}
	return -1
}

// drawValidInvariant draws a well-formed invariant (passes Validate): a scope, ≥2 distinct
// cells for cross-cell scopes, and the matching minimum approval tier or wider.
func drawValidInvariant(t *rapid.T) gi.GlobalInvariant {
	scope := allScopes[rapid.IntRange(0, len(allScopes)-1).Draw(t, "scope")]
	radius := allRadii[rapid.IntRange(0, len(allRadii)-1).Draw(t, "radius")]

	// Pick distinct cells: ≥2 for cross-cell, ≥1 for local.
	min := 2
	if scope == gi.ScopeLocalCell {
		min = 1
	}
	n := rapid.IntRange(min, len(cellPool)).Draw(t, "ncells")
	idxs := rapid.SliceOfNDistinct(rapid.IntRange(0, len(cellPool)-1), n, n, func(i int) int { return i }).Draw(t, "cellidx")
	cells := make([]gi.CellRef, 0, len(idxs))
	for _, i := range idxs {
		cells = append(cells, cellPool[i])
	}

	// Approval ≥ the minimum the radius demands (so Validate's consistency check passes).
	minTier := minAuthorityForRadiusTest(radius)
	tier := allAuthorities[rapid.IntRange(authRank(minTier), len(allAuthorities)-1).Draw(t, "tier")]

	return gi.GlobalInvariant{
		Name:             "inv",
		Scope:            scope,
		Cells:            cells,
		Predicate:        "p",
		BlastRadius:      radius,
		ApprovalRequired: tier,
	}
}

// minAuthorityForRadiusTest mirrors the package's precedence rule (small→cell_owner,
// bounded→both_contract_owners, global→architecture_owner) for generating valid inputs.
func minAuthorityForRadiusTest(b gi.BlastRadius) gi.Authority {
	switch b {
	case gi.BlastRadiusGlobal:
		return gi.AuthorityArchitectureOwner
	case gi.BlastRadiusBounded:
		return gi.AuthorityBothContractOwners
	default:
		return gi.AuthorityCellOwner
	}
}

// TestProp_RedWaveTotalDeterministicNoUnderPropagation pins invariants 1 + 2.
func TestProp_RedWaveTotalDeterministicNoUnderPropagation(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		inv := drawValidInvariant(rt)
		violated := cellPool[rapid.IntRange(0, len(cellPool)-1).Draw(rt, "violated")]

		got := gi.RedWave(inv, violated)
		again := gi.RedWave(inv, violated)
		if len(got) != len(again) {
			rt.Fatalf("RedWave not deterministic: %v vs %v", got, again)
		}
		for i := range got {
			if got[i] != again[i] {
				rt.Fatalf("RedWave not deterministic at %d: %v vs %v", i, got, again)
			}
		}

		if inv.Scope == gi.ScopeLocalCell {
			if len(got) != 1 {
				rt.Fatalf("local_cell must redden exactly one cell, got %v", got)
			}
			return
		}
		// No under-propagation: every spanned cell is in the wave.
		set := map[gi.CellRef]bool{}
		for _, c := range got {
			set[c] = true
		}
		for _, c := range inv.Cells {
			if !set[c] {
				rt.Fatalf("under-propagation: spanned cell %q not in wave %v", c, got)
			}
		}
	})
}

// TestProp_AdmitTotalDeterministicMonotone pins invariants 3 + 4.
func TestProp_AdmitTotalDeterministicMonotone(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		inv := drawValidInvariant(rt)
		granted := allAuthorities[rapid.IntRange(0, len(allAuthorities)-1).Draw(rt, "granted")]

		d := gi.Admit(inv, granted)
		again := gi.Admit(inv, granted)
		if d.Decision != again.Decision {
			rt.Fatalf("Admit not deterministic: %q vs %q", d.Decision, again.Decision)
		}
		switch d.Decision {
		case gi.DecisionAdmitted, gi.DecisionBlocked, gi.DecisionEscalated:
		default:
			rt.Fatalf("Admit returned a non-total decision %q", d.Decision)
		}

		required := minAuthorityForRadiusTest(inv.BlastRadius)
		// Monotone: admitted only with an equal-or-wider approval tier.
		if d.Decision == gi.DecisionAdmitted && authRank(granted) < authRank(required) {
			rt.Fatalf("Admit admitted with a narrower approval (%q < required %q for radius %q)",
				granted, required, inv.BlastRadius)
		}
		// Global ⇒ never admitted without architecture_owner.
		if inv.BlastRadius == gi.BlastRadiusGlobal && d.Decision == gi.DecisionAdmitted &&
			granted != gi.AuthorityArchitectureOwner {
			rt.Fatalf("a global invariant must never be admitted without architecture_owner, got %q", granted)
		}
		// A blocked decision always carries an actionable BlockReason.
		if d.Decision == gi.DecisionBlocked {
			if d.BlockReason == nil || len(d.BlockReason.HowToFix) == 0 {
				rt.Fatalf("a blocked decision must carry an actionable BlockReason, got %+v", d.BlockReason)
			}
		}
	})
}

// TestProp_OutOfEnumRejected pins invariant 5 (enum guard).
func TestProp_OutOfEnumRejected(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		base := drawValidInvariant(rt)
		which := rapid.IntRange(0, 2).Draw(rt, "which")
		switch which {
		case 0:
			base.Scope = gi.Scope(rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "badscope"))
			if gi.IsKnownScope(base.Scope) {
				return // drew a valid one by chance — skip
			}
		case 1:
			base.BlastRadius = gi.BlastRadius(rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "badradius"))
			if gi.IsKnownBlastRadius(base.BlastRadius) {
				return
			}
		case 2:
			base.ApprovalRequired = gi.Authority(rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "badauth"))
			if gi.IsKnownAuthority(base.ApprovalRequired) {
				return
			}
		}
		if err := gi.Validate(base); err == nil {
			rt.Fatalf("an out-of-enum invariant must fail Validate: %+v", base)
		}
	})
}

// TestProp_CrossCellNeedsTwoCells pins invariant 5 (cardinality guard).
func TestProp_CrossCellNeedsTwoCells(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		scope := []gi.Scope{gi.ScopeContractPair, gi.ScopeFederationPolicy}[rapid.IntRange(0, 1).Draw(rt, "scope")]
		one := cellPool[rapid.IntRange(0, len(cellPool)-1).Draw(rt, "cell")]
		inv := gi.GlobalInvariant{
			Name:             "inv",
			Scope:            scope,
			Cells:            []gi.CellRef{one},
			Predicate:        "p",
			BlastRadius:      gi.BlastRadiusBounded,
			ApprovalRequired: gi.AuthorityBothContractOwners,
		}
		if err := gi.Validate(inv); err == nil {
			rt.Fatalf("a %q invariant naming a single cell must fail Validate", scope)
		}
	})
}

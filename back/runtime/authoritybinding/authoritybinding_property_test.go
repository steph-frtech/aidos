package authoritybinding

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

// ─────────────────────────────────────────────────────────────────────────────
// S63 REPRODUCIBILITY + INVARIANT MIRROR (rapid, CLAUDE.md §6 determinism-first).
// Same input ⇒ same verdict; the role gradient is monotone; provenance is never a
// placeholder; an override is always a recorded decision. "The judge is deterministic."
// ─────────────────────────────────────────────────────────────────────────────

var allMemberRoles = []membership.Role{membership.RoleOwner, membership.RoleEditor, membership.RoleViewer}

func sampleGraph(t *rapid.T) authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:    rapid.SampledFrom([]string{"checkout", "billing", "auth"}).Draw(t, "domain"),
		TruthKind: "regulatory",
		Approvers: []authority.Role{"product_owner"},
	}
}

func sampleBindings(t *rapid.T) []AuthorityRoleBinding {
	floor := rapid.SampledFrom(allMemberRoles).Draw(t, "floor")
	dom := rapid.SampledFrom([]string{"checkout", "billing", "auth", ""}).Draw(t, "bdom")
	return []AuthorityRoleBinding{
		{Domain: dom, MinProjectRole: floor, Roles: []authority.Role{"product_owner"}},
	}
}

// PROPERTY 1 — DecideProposal is DETERMINISTIC: same input ⇒ byte-identical verdict.
func TestProp_DecideProposal_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := sampleGraph(t)
		bindings := sampleBindings(t)
		ident := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "ident")
		role := rapid.SampledFrom(allMemberRoles).Draw(t, "role")
		hasMember := rapid.Bool().Draw(t, "hasMember")

		var m *membership.Membership
		if hasMember {
			mm, err := membership.NewMembership(ident, "proj", role)
			if err != nil {
				t.Fatalf("NewMembership: %v", err)
			}
			m = &mm
		}
		actor := RealActor{Identity: ident, Display: "Display " + ident}
		truth := authority.Truth{Domain: g.Domain, TruthKind: g.TruthKind}

		a := DecideProposal(g, truth, actor, m, bindings)
		b := DecideProposal(g, truth, actor, m, bindings)
		if a.Admission.Decision != b.Admission.Decision {
			t.Fatalf("non-deterministic decision: %s vs %s", a.Admission.Decision, b.Admission.Decision)
		}
		if (a.BlockReason == nil) != (b.BlockReason == nil) {
			t.Fatalf("non-deterministic block presence")
		}
		if a.BlockReason != nil && a.BlockReason.Code != b.BlockReason.Code {
			t.Fatalf("non-deterministic block code: %s vs %s", a.BlockReason.Code, b.BlockReason.Code)
		}
		if len(a.GrantedRoles) != len(b.GrantedRoles) {
			t.Fatalf("non-deterministic granted set size")
		}
	})
}

// PROPERTY 2 — ROLE GRADIENT MONOTONE: a higher project role grants a SUPERSET of the
// authority roles a lower role grants (owner ⊇ editor ⊇ viewer), for the same bindings.
func TestProp_RoleGradient_Monotone(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		bindings := sampleBindings(t)
		domain := rapid.SampledFrom([]string{"checkout", "billing", "auth"}).Draw(t, "domain")

		owner, _ := membership.NewMembership("u", "p", membership.RoleOwner)
		editor, _ := membership.NewMembership("u", "p", membership.RoleEditor)
		viewer, _ := membership.NewMembership("u", "p", membership.RoleViewer)

		ownerSet := setOf(ResolveGrantedRoles(&owner, domain, bindings))
		editorSet := setOf(ResolveGrantedRoles(&editor, domain, bindings))
		viewerSet := setOf(ResolveGrantedRoles(&viewer, domain, bindings))

		if !isSuperset(ownerSet, editorSet) {
			t.Fatalf("owner must grant ⊇ editor: owner=%v editor=%v", ownerSet, editorSet)
		}
		if !isSuperset(editorSet, viewerSet) {
			t.Fatalf("editor must grant ⊇ viewer: editor=%v viewer=%v", editorSet, viewerSet)
		}
	})
}

// PROPERTY 3 — PLACEHOLDER ACTOR ALWAYS REFUSED: whatever the authority, a placeholder
// actor is blocked PLACEHOLDER_ACTOR (provenance is never a placeholder).
func TestProp_PlaceholderActor_AlwaysRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := sampleGraph(t)
		bindings := sampleBindings(t)
		ph := rapid.SampledFrom([]string{"", " ", "agent", "system", "aidos", "tbd", "placeholder", "anonymous", "unknown"}).Draw(t, "ph")
		owner, _ := membership.NewMembership("u", "p", membership.RoleOwner)

		dec := DecideProposal(g, authority.Truth{Domain: g.Domain, TruthKind: g.TruthKind},
			RealActor{Identity: ph, Display: "X"}, &owner, bindings)
		if dec.BlockReason == nil || dec.BlockReason.Code != CodePlaceholderActor {
			t.Fatalf("placeholder %q must be PLACEHOLDER_ACTOR, got %+v", ph, dec.BlockReason)
		}
	})
}

// PROPERTY 4 — OVERRIDE IS ALWAYS A RECORDED DECISION: NewOverride succeeds IFF all of
// {real actor, changeset, adr, reason} are present; and a successful override is
// content-addressed (idempotent — same fields ⇒ same id).
func TestProp_Override_AlwaysRecordedAndIdempotent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cs := rapid.SampledFrom([]string{"", "cs-1"}).Draw(t, "cs")
		adr := rapid.SampledFrom([]string{"", "ADR 0001"}).Draw(t, "adr")
		reason := rapid.SampledFrom([]string{"", "why"}).Draw(t, "reason")
		ident := rapid.SampledFrom([]string{"", "agent", "user-x"}).Draw(t, "ident")
		actor := RealActor{Identity: ident, Display: "D"}

		o1, br1 := NewOverride(CodeInsufficientAuthority, cs, adr, actor, reason)
		complete := cs != "" && adr != "" && reason != "" && !IsPlaceholder(ident)
		if complete && br1 != nil {
			t.Fatalf("a complete override must be recorded, got %+v", br1)
		}
		if !complete && br1 == nil {
			t.Fatalf("an incomplete override must be refused, fields cs=%q adr=%q reason=%q ident=%q", cs, adr, reason, ident)
		}
		if complete {
			o2, br2 := NewOverride(CodeInsufficientAuthority, cs, adr, actor, reason)
			if br2 != nil || o1.ID != o2.ID || o1.ID == "" {
				t.Fatalf("override must be content-addressed + idempotent: %q vs %q (br=%+v)", o1.ID, o2.ID, br2)
			}
		}
	})
}

// PROPERTY 5 — RESOLVE IS SORTED + DEDUPED: the granted set is sorted and carries no
// duplicate (deterministic output order, the property a consumer relies on).
func TestProp_ResolveGrantedRoles_SortedDeduped(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		domain := rapid.SampledFrom([]string{"checkout", "x"}).Draw(t, "domain")
		bindings := []AuthorityRoleBinding{
			{Domain: domain, MinProjectRole: membership.RoleViewer, Roles: []authority.Role{"b", "a", "a"}},
			{Domain: "", MinProjectRole: membership.RoleViewer, Roles: []authority.Role{"a", "c"}},
		}
		owner, _ := membership.NewMembership("u", "p", membership.RoleOwner)
		got := ResolveGrantedRoles(&owner, domain, bindings)
		for i := 1; i < len(got); i++ {
			if got[i] <= got[i-1] {
				t.Fatalf("granted set not strictly sorted/deduped: %v", got)
			}
		}
	})
}

func setOf(rs []authority.Role) map[authority.Role]struct{} {
	m := map[authority.Role]struct{}{}
	for _, r := range rs {
		m[r] = struct{}{}
	}
	return m
}

func isSuperset(a, b map[authority.Role]struct{}) bool {
	for r := range b {
		if _, ok := a[r]; !ok {
			return false
		}
	}
	return true
}

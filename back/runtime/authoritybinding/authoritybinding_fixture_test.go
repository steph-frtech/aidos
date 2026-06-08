package authoritybinding

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

// ─────────────────────────────────────────────────────────────────────────────
// S63 BDD MIRROR (acceptance fixture). The done-criterion verbatim:
//
//   « une proposition d'écriture-vérité exige l'approbation d'un user détenant
//     l'authority du scope, sinon INSUFFICIENT_AUTHORITY ; un override = décision
//     enregistrée (ChangeSet + ADR + provenance). »
//
// state → command → events, no clock/rng/I-O — the judge is deterministic (§8).
// ─────────────────────────────────────────────────────────────────────────────

// checkoutGraph is the AuthorityGraph governing the checkout domain: a regulatory
// truth requires the product_owner approval (and security may veto). The graph is the
// human's truth (above the line); S63 only enforces it grounded in a real user.
func checkoutGraph() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:     "checkout",
		TruthKind:  "regulatory",
		Approvers:  []authority.Role{"product_owner"},
		Veto:       []authority.Role{"security"},
		Escalation: []authority.Role{"architecture_board"},
	}
}

// ownerBindsProductOwner: an OWNER member of the project holds the product_owner +
// security authority roles in the checkout domain. An editor/viewer (below the floor)
// holds neither.
func checkoutBindings() []AuthorityRoleBinding {
	return []AuthorityRoleBinding{
		{Domain: "checkout", MinProjectRole: membership.RoleOwner, Roles: []authority.Role{"product_owner"}},
		// a security authority awarded only to an owner too (kept simple for the fixture)
		{Domain: "checkout", MinProjectRole: membership.RoleOwner, Roles: []authority.Role{}},
	}
}

func mustMember(t *testing.T, identity, project string, role membership.Role) *membership.Membership {
	t.Helper()
	m, err := membership.NewMembership(identity, project, role)
	if err != nil {
		t.Fatalf("NewMembership(%s,%s,%s): %v", identity, project, role, err)
	}
	return &m
}

// SCENARIO 1 (done-criterion, the GREEN path): a truth-write proposal APPROVED by a
// user who HOLDS the scope's authority is admitted.
//
//	Given an AuthorityGraph governing "checkout" requiring product_owner approval
//	And a declared binding owner → product_owner in "checkout"
//	And Alice is an OWNER member of the project, acting as a real human
//	When Alice proposes a checkout truth-write
//	Then the proposal is ADMITTED (she holds the scope's authority)
func TestProposal_ApprovedByAuthorityHolder_IsAdmitted(t *testing.T) {
	g := checkoutGraph()
	alice := RealActor{Identity: "user-alice", Display: "Alice"}
	m := mustMember(t, "user-alice", "proj-alpha", membership.RoleOwner)

	dec := DecideProposal(g, authority.Truth{Domain: "checkout", TruthKind: "regulatory"}, alice, m, checkoutBindings())

	if dec.Admission.Decision != authority.DecisionAdmitted {
		t.Fatalf("expected admitted, got %s (block=%+v)", dec.Admission.Decision, dec.BlockReason)
	}
	if dec.BlockReason != nil {
		t.Fatalf("admitted proposal must carry no BlockReason, got %+v", dec.BlockReason)
	}
	if len(dec.GrantedRoles) != 1 || dec.GrantedRoles[0] != authority.Role("product_owner") {
		t.Fatalf("expected granted=[product_owner], got %v", dec.GrantedRoles)
	}
}

// SCENARIO 2 (done-criterion, THE RED case): a truth-write proposal by a user who
// does NOT hold the scope's authority is refused INSUFFICIENT_AUTHORITY.
//
//	Given the same checkout AuthorityGraph + binding
//	And Bob is only a VIEWER member (below the owner floor → holds no authority role)
//	When Bob proposes a checkout truth-write
//	Then the proposal is BLOCKED with code INSUFFICIENT_AUTHORITY
//	And the BlockReason names the door (how_to_fix non-empty)
func TestProposal_WithoutScopeAuthority_IsInsufficientAuthority(t *testing.T) {
	g := checkoutGraph()
	bob := RealActor{Identity: "user-bob", Display: "Bob"}
	m := mustMember(t, "user-bob", "proj-alpha", membership.RoleViewer)

	dec := DecideProposal(g, authority.Truth{Domain: "checkout", TruthKind: "regulatory"}, bob, m, checkoutBindings())

	if dec.Admission.Decision != authority.DecisionBlocked {
		t.Fatalf("expected blocked, got %s", dec.Admission.Decision)
	}
	if dec.BlockReason == nil || dec.BlockReason.Code != CodeInsufficientAuthority {
		t.Fatalf("expected INSUFFICIENT_AUTHORITY, got %+v", dec.BlockReason)
	}
	if len(dec.BlockReason.HowToFix) == 0 {
		t.Fatalf("INSUFFICIENT_AUTHORITY must name the door (how_to_fix non-empty)")
	}
	if len(dec.GrantedRoles) != 0 {
		t.Fatalf("a viewer holds no authority role, got %v", dec.GrantedRoles)
	}
}

// SCENARIO 3 (provenance is never a placeholder): a truth-write attributed to a
// placeholder actor is refused PLACEHOLDER_ACTOR, regardless of authority.
//
//	Given the checkout graph + binding
//	When a proposal is attributed to identity "agent" (a placeholder)
//	Then it is BLOCKED with code PLACEHOLDER_ACTOR (the agent never owns truth)
func TestProposal_PlaceholderActor_IsRefused(t *testing.T) {
	g := checkoutGraph()
	// even a would-be owner membership cannot rescue a placeholder actor
	m := mustMember(t, "agent", "proj-alpha", membership.RoleOwner)

	for _, ph := range []string{"agent", "system", "", "  ", "tbd", "placeholder", "anonymous"} {
		dec := DecideProposal(g, authority.Truth{Domain: "checkout", TruthKind: "regulatory"},
			RealActor{Identity: ph, Display: "X"}, m, checkoutBindings())
		if dec.BlockReason == nil || dec.BlockReason.Code != CodePlaceholderActor {
			t.Fatalf("placeholder %q must be refused PLACEHOLDER_ACTOR, got %+v", ph, dec.BlockReason)
		}
	}
	// a real actor with a blank display is also a placeholder
	dec := DecideProposal(g, authority.Truth{Domain: "checkout", TruthKind: "regulatory"},
		RealActor{Identity: "user-alice", Display: "   "}, m, checkoutBindings())
	if dec.BlockReason == nil || dec.BlockReason.Code != CodePlaceholderActor {
		t.Fatalf("blank display must be refused PLACEHOLDER_ACTOR, got %+v", dec.BlockReason)
	}
}

// SCENARIO 4 (veto grounded in a real user): a security veto by a real holder blocks
// admission regardless of approvers — surfaced verbatim (VETOED) under the S63 shape.
func TestProposal_VetoHolder_BlocksAdmission(t *testing.T) {
	g := checkoutGraph()
	// a binding that awards the security veto role to an owner in checkout
	bindings := []AuthorityRoleBinding{
		{Domain: "checkout", MinProjectRole: membership.RoleOwner, Roles: []authority.Role{"product_owner", "security"}},
	}
	alice := RealActor{Identity: "user-alice", Display: "Alice"}
	m := mustMember(t, "user-alice", "proj-alpha", membership.RoleOwner)

	dec := DecideProposal(g, authority.Truth{Domain: "checkout", TruthKind: "regulatory"}, alice, m, bindings)

	if dec.Admission.Decision != authority.DecisionBlocked {
		t.Fatalf("a held veto must block, got %s", dec.Admission.Decision)
	}
	if dec.BlockReason == nil || dec.BlockReason.Code != BlockCode(authority.CodeVetoed) {
		t.Fatalf("expected VETOED, got %+v", dec.BlockReason)
	}
}

// SCENARIO 5 (override = recorded decision): an override REQUIRES ChangeSet + ADR +
// provenance; one missing any of the three is refused OVERRIDE_NOT_RECORDED.
//
//	Given Bob was refused INSUFFICIENT_AUTHORITY
//	When an owner records an override WITH changeset + adr + real-actor + reason
//	Then the override is recorded (content-addressed, append-only)
//	But an override MISSING the ADR is refused OVERRIDE_NOT_RECORDED
//	And an override attributed to a placeholder is refused PLACEHOLDER_ACTOR
func TestOverride_RequiresChangeSetADRProvenance(t *testing.T) {
	owner := RealActor{Identity: "user-owner", Display: "Olga (owner)"}

	// the recorded override: all three present
	ov, br := NewOverride(CodeInsufficientAuthority, "cs-123", "ADR 0042", owner, "exception réglementaire validée")
	if br != nil {
		t.Fatalf("a fully recorded override must be accepted, got %+v", br)
	}
	if ov.ID == "" {
		t.Fatalf("a recorded override is content-addressed (id non-empty)")
	}
	if ov.ChangeSetRef != "cs-123" || ov.ADRRef != "ADR 0042" || ov.Actor.Identity != "user-owner" {
		t.Fatalf("override must carry its changeset+adr+provenance, got %+v", ov)
	}

	// missing the ADR → OVERRIDE_NOT_RECORDED
	if _, br := NewOverride(CodeInsufficientAuthority, "cs-123", "", owner, "reason"); br == nil || br.Code != CodeOverrideNotRecorded {
		t.Fatalf("override missing ADR must be refused OVERRIDE_NOT_RECORDED, got %+v", br)
	}
	// missing the ChangeSet → OVERRIDE_NOT_RECORDED
	if _, br := NewOverride(CodeInsufficientAuthority, "", "ADR 0042", owner, "reason"); br == nil || br.Code != CodeOverrideNotRecorded {
		t.Fatalf("override missing ChangeSet must be refused OVERRIDE_NOT_RECORDED, got %+v", br)
	}
	// missing the reason → OVERRIDE_NOT_RECORDED
	if _, br := NewOverride(CodeInsufficientAuthority, "cs-123", "ADR 0042", owner, "  "); br == nil || br.Code != CodeOverrideNotRecorded {
		t.Fatalf("override missing reason must be refused OVERRIDE_NOT_RECORDED, got %+v", br)
	}
	// placeholder actor → PLACEHOLDER_ACTOR (provenance never a placeholder)
	if _, br := NewOverride(CodeInsufficientAuthority, "cs-123", "ADR 0042",
		RealActor{Identity: "system", Display: "sys"}, "reason"); br == nil || br.Code != CodePlaceholderActor {
		t.Fatalf("override by a placeholder must be refused PLACEHOLDER_ACTOR, got %+v", br)
	}
}

// SCENARIO 5b (Go↔TS content-address parity): the override id is byte-identical to the
// lib/authority-binding.ts twin (verified: this exact override = a5c38ff1…). Pins the two
// twins to one canonical-body hashing scheme (records.Hash over sorted keys).
func TestOverride_ContentAddressMatchesTSTwin(t *testing.T) {
	o, br := NewOverride(CodeInsufficientAuthority, "cs-123", "ADR 0042",
		RealActor{Identity: "user-owner", Display: "Olga"}, "exception")
	if br != nil {
		t.Fatalf("unexpected block: %+v", br)
	}
	const wantTS = "a5c38ff113a25a9f70bfc87a36f2249339bbdda3b8fbf977a3d8f6dae724046b"
	if o.ID != wantTS {
		t.Fatalf("Go↔TS override content-address drift: Go=%s TS=%s", o.ID, wantTS)
	}
}

// SCENARIO 6 (provenance carries the real human): ToProvenanceDetail attributes the
// intent to the named human, never a placeholder.
func TestProvenanceDetail_NamesTheRealHuman(t *testing.T) {
	alice := RealActor{Identity: "user-alice", Display: "Alice"}
	got := ToProvenanceDetail(alice, "je veux une remise checkout")
	want := "Alice <user-alice>: je veux une remise checkout"
	if got != want {
		t.Fatalf("provenance detail: got %q want %q", got, want)
	}
}

// SCENARIO 7 (a non-member grants nothing): a valid actor who is NOT a member of the
// project holds no authority role → INSUFFICIENT_AUTHORITY.
func TestProposal_NonMember_HoldsNoAuthority(t *testing.T) {
	g := checkoutGraph()
	carol := RealActor{Identity: "user-carol", Display: "Carol"}

	dec := DecideProposal(g, authority.Truth{Domain: "checkout", TruthKind: "regulatory"}, carol, nil, checkoutBindings())

	if dec.BlockReason == nil || dec.BlockReason.Code != CodeInsufficientAuthority {
		t.Fatalf("a non-member holds no authority → INSUFFICIENT_AUTHORITY, got %+v", dec.BlockReason)
	}
	if len(dec.GrantedRoles) != 0 {
		t.Fatalf("a non-member grants nothing, got %v", dec.GrantedRoles)
	}
}

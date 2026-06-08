// membership_property_test.go — the S62 INVARIANT mirror (∀, rapid) + the determinism-first
// reproducibility property. reflects=runtime.membership-gradient · test_kind=invariant ·
// cert_language=rapid · authority=below · liveness=live.
//
// It pins the role-gradient invariants over ALL inputs and the reproducibility property
// (same input ⇒ same decision; NewMembership is content-addressed/idempotent — CLAUDE.md §6
// determinism-first).
package membership

import (
	"testing"

	"pgregory.net/rapid"
)

var allRoles = []Role{RoleOwner, RoleEditor, RoleViewer}
var allOps = []OpKind{OpRead, OpMutate, OpAdminister}

// ∀ membership for THIS project + ∀ op: a viewer is NEVER allowed to mutate or administer;
// an editor is NEVER allowed to administer; an owner is ALWAYS allowed everything; every
// member may read.
func TestProp_RoleGradient(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		proj := rapid.SampledFrom([]string{"p1", "p2", "alpha"}).Draw(t, "proj")
		role := rapid.SampledFrom(allRoles).Draw(t, "role")
		op := rapid.SampledFrom(allOps).Draw(t, "op")
		ident := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "ident")

		m := member(rapidT{t}, ident, proj, role)
		d := Authorize(m, proj, op)

		switch {
		case op == OpRead:
			if d.Verdict != VerdictAllow {
				t.Fatalf("any member must READ: role=%s got %s", role, d.Verdict)
			}
		case role == RoleViewer:
			if d.Verdict != VerdictDeny || d.BlockReason.Code != CodeRoleForbidden {
				t.Fatalf("viewer must be DENIED %s with ROLE_FORBIDDEN, got %+v", op, d)
			}
		case role == RoleEditor && op == OpAdminister:
			if d.Verdict != VerdictDeny || d.BlockReason.Code != CodeRoleForbidden {
				t.Fatalf("editor must be DENIED administer, got %+v", d)
			}
		case role == RoleEditor && op == OpMutate:
			if d.Verdict != VerdictAllow {
				t.Fatalf("editor must MUTATE, got %s", d.Verdict)
			}
		case role == RoleOwner:
			if d.Verdict != VerdictAllow {
				t.Fatalf("owner must be allowed everything: op=%s got %s", op, d.Verdict)
			}
		}
	})
}

// ∀ identity, ∀ op: a membership for ANOTHER project is a NON-MEMBER for the target project
// (NOT_A_MEMBER). Project isolation of membership.
func TestProp_MembershipIsPerProject(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		role := rapid.SampledFrom(allRoles).Draw(t, "role")
		op := rapid.SampledFrom(allOps).Draw(t, "op")
		ident := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "ident")

		m := member(rapidT{t}, ident, "project-A", role)
		d := Authorize(m, "project-B", op)
		if d.Verdict != VerdictDeny || d.BlockReason.Code != CodeNotAMember {
			t.Fatalf("a member of A is a NON-member of B: got %+v", d)
		}
	})
}

// Determinism-first: NewMembership is content-addressed and idempotent — the same
// (identity, project, role) always yields a byte-identical id; Authorize is a pure function
// (same input ⇒ same decision).
func TestProp_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ident := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "ident")
		proj := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "proj")
		role := rapid.SampledFrom(allRoles).Draw(t, "role")
		op := rapid.SampledFrom(allOps).Draw(t, "op")

		a, errA := NewMembership(ident, proj, role)
		b, errB := NewMembership(ident, proj, role)
		if errA != nil || errB != nil {
			t.Fatalf("valid input must not error: %v / %v", errA, errB)
		}
		if a.ID != b.ID {
			t.Fatalf("content address not idempotent: %s != %s", a.ID, b.ID)
		}
		// Decision holds a *BlockReason; compare by value (verdict + code), not by pointer.
		da, db := Authorize(&a, proj, op), Authorize(&b, proj, op)
		if da.Verdict != db.Verdict {
			t.Fatal("Authorize verdict not deterministic")
		}
		if (da.BlockReason == nil) != (db.BlockReason == nil) {
			t.Fatal("Authorize block-reason presence not deterministic")
		}
		if da.BlockReason != nil && da.BlockReason.Code != db.BlockReason.Code {
			t.Fatal("Authorize block-reason code not deterministic")
		}
	})
}

// rapidT adapts *rapid.T to the testing.T-shaped Helper/Fatalf the member() fixture helper
// needs, so the property test reuses the same constructor.
type rapidT struct{ t *rapid.T }

func (r rapidT) Helper()                           {}
func (r rapidT) Fatalf(format string, args ...any) { r.t.Fatalf(format, args...) }

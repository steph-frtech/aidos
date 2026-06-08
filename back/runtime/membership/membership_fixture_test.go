// membership_fixture_test.go — the S62 WORKFLOW mirror (fixture, state→command→events).
// reflects=runtime.membership-authority · test_kind=workflow · cert_language=fixture ·
// authority=below · liveness=live.
//
// It pins the two fixture done-criteria DIRECTLY (pure, no DB — the deterministic authority
// is the judge):
//
//   - NON-MEMBER refused NOT_A_MEMBER: a VALID, authenticated identity that holds no
//     membership row in the target project is refused with NOT_A_MEMBER for EVERY op (read,
//     mutate, administer) — independent of authentication (the third layer).
//   - A VIEWER cannot MUTATE: a viewer membership reads (allow) but a mutate is refused with
//     ROLE_FORBIDDEN; an editor mutates (allow) but cannot administer; an owner administers
//     (allow) — the project.owner_ref resolves to a real owner.
//
// The fixture is the canonical (initial state) → (command) → (expected events) table the
// ROADMAP S62 mirror names. The "events" are the Authorize/CanAdminister verdicts.
package membership

import "testing"

// fataler is the minimal testing surface member() needs — satisfied by both *testing.T and
// the rapidT adapter (so the fixture constructor is reused by the property mirror).
type fataler interface {
	Helper()
	Fatalf(format string, args ...any)
}

// member builds a membership for the fixtures (fails the test on a bad row — the table is fixed).
func member(t fataler, identity, project string, role Role) *Membership {
	t.Helper()
	m, err := NewMembership(identity, project, role)
	if err != nil {
		t.Fatalf("NewMembership(%s,%s,%s): %v", identity, project, role, err)
	}
	return &m
}

func TestFixture_NonMemberRefusedNotAMember(t *testing.T) {
	const proj = "proj-alpha"
	cases := []struct {
		name string
		m    *Membership // the membership the identity holds for proj-alpha (nil = none)
		op   OpKind
	}{
		{"no row at all → read", nil, OpRead},
		{"no row at all → mutate", nil, OpMutate},
		{"no row at all → administer", nil, OpAdminister},
		// A member of a DIFFERENT project is a non-member of proj-alpha.
		{"member of another project → read", member(t, "bob", "proj-beta", RoleOwner), OpRead},
		{"member of another project → mutate", member(t, "bob", "proj-beta", RoleEditor), OpMutate},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			d := Authorize(tc.m, proj, tc.op)
			if d.Verdict != VerdictDeny {
				t.Fatalf("non-member must be DENIED, got %s", d.Verdict)
			}
			if d.BlockReason == nil || d.BlockReason.Code != CodeNotAMember {
				t.Fatalf("expected NOT_A_MEMBER, got %+v", d.BlockReason)
			}
			if d.BlockReason.Severity != "error" || len(d.BlockReason.HowToFix) == 0 {
				t.Fatalf("NOT_A_MEMBER must be an actionable error with how_to_fix: %+v", d.BlockReason)
			}
		})
	}
}

func TestFixture_ViewerCannotMutate(t *testing.T) {
	const proj = "proj-alpha"
	viewer := member(t, "vic", proj, RoleViewer)

	// A viewer READS (allow).
	if d := Authorize(viewer, proj, OpRead); d.Verdict != VerdictAllow {
		t.Fatalf("viewer must READ (allow), got %s (%+v)", d.Verdict, d.BlockReason)
	}
	// A viewer MUTATE is refused ROLE_FORBIDDEN (the done-criterion).
	d := Authorize(viewer, proj, OpMutate)
	if d.Verdict != VerdictDeny {
		t.Fatalf("viewer must NOT mutate, got %s", d.Verdict)
	}
	if d.BlockReason == nil || d.BlockReason.Code != CodeRoleForbidden {
		t.Fatalf("expected ROLE_FORBIDDEN, got %+v", d.BlockReason)
	}
	// A viewer ADMINISTER is also refused.
	if d := Authorize(viewer, proj, OpAdminister); d.Verdict != VerdictDeny ||
		d.BlockReason == nil || d.BlockReason.Code != CodeRoleForbidden {
		t.Fatalf("viewer must NOT administer, got %s (%+v)", d.Verdict, d.BlockReason)
	}
}

func TestFixture_RoleGradient(t *testing.T) {
	const proj = "proj-alpha"
	editor := member(t, "ed", proj, RoleEditor)
	owner := member(t, "oz", proj, RoleOwner)

	// Editor: reads + mutates (allow), but cannot administer (ROLE_FORBIDDEN).
	if d := Authorize(editor, proj, OpMutate); d.Verdict != VerdictAllow {
		t.Fatalf("editor must mutate, got %s (%+v)", d.Verdict, d.BlockReason)
	}
	if d := Authorize(editor, proj, OpAdminister); d.Verdict != VerdictDeny ||
		d.BlockReason.Code != CodeRoleForbidden {
		t.Fatalf("editor must NOT administer, got %s (%+v)", d.Verdict, d.BlockReason)
	}
	if CanAdminister(editor, proj) {
		t.Fatal("CanAdminister must be false for an editor")
	}

	// Owner: reads + mutates + administers — the real owner the project.owner_ref resolves to.
	for _, op := range []OpKind{OpRead, OpMutate, OpAdminister} {
		if d := Authorize(owner, proj, op); d.Verdict != VerdictAllow {
			t.Fatalf("owner must be allowed %s, got %s (%+v)", op, d.Verdict, d.BlockReason)
		}
	}
	if !CanAdminister(owner, proj) {
		t.Fatal("CanAdminister must be true for an owner")
	}
}

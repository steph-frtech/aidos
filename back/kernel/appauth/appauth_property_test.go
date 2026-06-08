package appauth

// appauth_property_test.go — the S80 REPRODUCIBILITY mirror (RED FIRST, rapid). It pins the
// done-criterion verbatim:
//
//   « property — attacher `app-auth` expanse des entités+operations+policies d'auth byte-identiques. »
//
// On arbitrary target app names it proves the load-bearing properties of `app-auth`:
//
//   - DETERMINISM: same target ⇒ byte-identical Subsystem (same entities/operations/policies, same
//     canonical names, same ExpansionID). The expansion is a PURE function, never an LLM judgment.
//   - IDEMPOTENCE / STABILITY: re-expanding the same target yields the identical ExpansionID (the
//     macro has no hidden state, no clock, no RNG).
//   - THE WALL: every expansion WroteKernel=false; ExpansionID is always a content-address (non-empty).
//   - THE AUTH SHAPE: the subsystem ALWAYS carries the three entities (User/Role/Session) and the two
//     operations (login/logout) — the auth subsystem is complete, never partially expanded.
//   - RUNTIME AUTHZ IS A PURE MONOTONE GATE: a role is allowed iff its rank ≥ the operation's minimum;
//     a strictly weaker role is always denied (same input ⇒ same verdict).

import (
	"testing"

	"pgregory.net/rapid"
)

// targetGen draws a non-empty app target name.
func targetGen(t *rapid.T) string {
	return rapid.StringMatching(`[a-z][a-z0-9-]{0,15}`).Draw(t, "target")
}

// TestExpandAppAuth_Deterministic: same target ⇒ byte-identical Subsystem + ExpansionID.
func TestExpandAppAuth_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		target := targetGen(t)
		a, errA := ExpandAppAuth(target)
		b, errB := ExpandAppAuth(target)
		if errA != nil || errB != nil {
			t.Fatalf("expand errored: %v / %v", errA, errB)
		}
		if a.ExpansionID == "" {
			t.Fatalf("ExpansionID must be a non-empty content-address")
		}
		if a.ExpansionID != b.ExpansionID {
			t.Fatalf("same target produced different ExpansionID: %s vs %s", a.ExpansionID, b.ExpansionID)
		}
		na, nb := SortedNames(a), SortedNames(b)
		if len(na) != len(nb) {
			t.Fatalf("byte-identity broken: %v vs %v", na, nb)
		}
		for i := range na {
			if na[i] != nb[i] {
				t.Fatalf("byte-identity broken at %d: %q vs %q", i, na[i], nb[i])
			}
		}
	})
}

// TestExpandAppAuth_CompleteAuthShape: the subsystem always carries the full auth shape.
func TestExpandAppAuth_CompleteAuthShape(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		sub, err := ExpandAppAuth(targetGen(t))
		if err != nil {
			t.Fatalf("expand: %v", err)
		}
		names := SortedNames(sub)
		for _, must := range []string{
			"ent:User", "ent:Role", "ent:Session", "op:login", "op:logout",
			"pol:authz-login", "pol:authz-logout", "pol:authz-manageRoles",
		} {
			if !contains(names, must) {
				t.Fatalf("auth subsystem incomplete: missing %q in %v", must, names)
			}
		}
		// every policy is an OPERATION-scoped DENY-below-min-role rule (the runtime gate).
		for _, p := range sub.Policies {
			if p.Scope != "OPERATION" || p.Effect != "DENY" {
				t.Fatalf("authz policy not OPERATION/DENY: %+v", p)
			}
			if _, ok := roleRank[p.MinRole]; !ok {
				t.Fatalf("policy min role %q not in the declared role set", p.MinRole)
			}
		}
	})
}

// TestExpandAppAuth_WritesNoKernelTruth: the dry-run creates no truth (the wall).
func TestExpandAppAuth_WritesNoKernelTruth(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		sub, err := ExpandAppAuth(targetGen(t))
		if err != nil {
			t.Fatalf("expand: %v", err)
		}
		if sub.WroteKernel {
			t.Fatalf("expansion must not write the kernel (the wall)")
		}
	})
}

// TestCheckAccess_PureMonotoneGate: a role is allowed iff its rank ≥ the operation's minimum; a
// strictly weaker role is always denied. Same (role, op) ⇒ same verdict.
func TestCheckAccess_PureMonotoneGate(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		roleIdx := rapid.IntRange(0, len(roleOrder)-1).Draw(t, "roleIdx")
		role := roleOrder[roleIdx]
		op := rapid.SampledFrom(authzBand).Draw(t, "op")

		d1, err1 := CheckAccess(role, op.Name)
		d2, err2 := CheckAccess(role, op.Name)
		if err1 != nil || err2 != nil {
			t.Fatalf("CheckAccess errored on declared inputs: %v / %v", err1, err2)
		}
		if d1 != d2 {
			t.Fatalf("CheckAccess not deterministic: %+v vs %+v", d1, d2)
		}
		want := roleRank[role] >= roleRank[op.MinRole]
		if d1.Allowed != want {
			t.Fatalf("CheckAccess(%q, %q): allowed=%v, want %v (rank %d vs min %d)",
				role, op.Name, d1.Allowed, want, roleRank[role], roleRank[op.MinRole])
		}
	})
}

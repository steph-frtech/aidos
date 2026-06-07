// authn_property_test.go — the S61 INVARIANT mirror (∀, rapid).
// reflects=runtime.authn-unauthenticated · test_kind=invariant · cert_language=rapid ·
// authority=below · liveness=live.
//
// It pins the property done-criterion: an UNAUTHENTICATED call to a truth-write endpoint
// is refused with UNAUTHENTICATED and reaches no data — for ANY tool disposition, and a
// resolved principal is always authenticated; plus the determinism-first reproducibility
// property (same input ⇒ same decision; NewUser is content-addressed/idempotent).
package authn

import (
	"testing"

	"pgregory.net/rapid"
)

// ∀ an anonymous principal (empty subject), Authenticate refuses with UNAUTHENTICATED for
// EVERY disposition — including truth_write (the property done-criterion: refused upstream,
// reaching no data). It NEVER returns a principal on an anonymous caller (fail-closed).
func TestProp_AnonymousAlwaysRefusedUnauthenticated(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// An anonymous principal: empty/whitespace identity, arbitrary email/provider.
		ws := rapid.SampledFrom([]string{"", "   ", "\t", "\n"}).Draw(t, "ws")
		email := rapid.String().Draw(t, "email")
		prov := IdentityProvider(rapid.String().Draw(t, "prov"))
		disp := rapid.SampledFrom([]Disposition{DispositionTruthWrite, DispositionBelowLine}).
			Draw(t, "disp")

		d := Authenticate(Principal{Identity: ws, Email: email, Provider: prov}, disp)

		if d.Outcome != OutcomeUnauthenticated {
			t.Fatalf("anonymous (disp=%s) not refused: %s", disp, d.Outcome)
		}
		if d.Principal != nil {
			t.Fatalf("anonymous resolved a principal — leaked identity: %+v", *d.Principal)
		}
		if d.BlockReason == nil || d.BlockReason.Code != CodeUnauthenticated {
			t.Fatalf("expected UNAUTHENTICATED BlockReason, got %+v", d.BlockReason)
		}
		if d.BlockReason.Severity != "error" || len(d.BlockReason.HowToFix) == 0 {
			t.Fatalf("BlockReason not actionable: %+v", d.BlockReason)
		}
	})
}

// ∀ a resolved (non-empty subject) principal, Authenticate authenticates it and returns
// the SAME identity — the one value that propagates to both walls.
func TestProp_ResolvedAlwaysAuthenticated(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		id := rapid.StringMatching(`[a-z0-9]{1,20}`).Draw(t, "id")
		disp := rapid.SampledFrom([]Disposition{DispositionTruthWrite, DispositionBelowLine}).
			Draw(t, "disp")
		p := Principal{Identity: id, Email: "u@x", Provider: "oidc"}

		d := Authenticate(p, disp)

		if d.Outcome != OutcomeAuthenticated {
			t.Fatalf("resolved principal not authenticated: %s", d.Outcome)
		}
		if d.Principal == nil || d.Principal.Identity != id {
			t.Fatalf("authenticated principal identity drifted: %+v want %q", d.Principal, id)
		}
		if d.BlockReason != nil {
			t.Fatalf("authenticated call carried a BlockReason: %+v", d.BlockReason)
		}
	})
}

// Determinism: Authenticate is a pure function — same input ⇒ identical decision.
func TestProp_AuthenticateDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		id := rapid.String().Draw(t, "id")
		disp := rapid.SampledFrom([]Disposition{DispositionTruthWrite, DispositionBelowLine}).
			Draw(t, "disp")
		p := Principal{Identity: id, Email: rapid.String().Draw(t, "e"), Provider: "oidc"}

		a := Authenticate(p, disp)
		b := Authenticate(p, disp)
		if a.Outcome != b.Outcome {
			t.Fatalf("non-deterministic outcome: %s vs %s", a.Outcome, b.Outcome)
		}
	})
}

// Determinism + content-address: NewUser is idempotent — same (email, provider) ⇒
// byte-identical id; different inputs ⇒ different id (no collision).
func TestProp_NewUserContentAddressed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		email := rapid.String().Draw(t, "email")
		prov := IdentityProvider(rapid.String().Draw(t, "prov"))

		u1, err1 := NewUser(email, prov)
		u2, err2 := NewUser(email, prov)
		if err1 != nil || err2 != nil {
			t.Fatalf("NewUser errored: %v / %v", err1, err2)
		}
		if u1.ID != u2.ID {
			t.Fatalf("NewUser not idempotent: %q != %q", u1.ID, u2.ID)
		}
		if u1.AsPrincipal().Identity != u1.ID {
			t.Fatalf("principal identity != user id: %q != %q", u1.AsPrincipal().Identity, u1.ID)
		}
		// A different email must change the address.
		other, err := NewUser(email+"x", prov)
		if err != nil {
			t.Fatalf("NewUser other: %v", err)
		}
		if other.ID == u1.ID {
			t.Fatalf("distinct emails collided to %q", u1.ID)
		}
	})
}

// GUCs: an anonymous principal yields an EMPTY app.identity GUC (the RLS then sees zero
// rows — the second, independent layer); a resolved principal carries its trimmed subject.
func TestProp_GUCsFailClosedForAnonymous(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ws := rapid.SampledFrom([]string{"", "  ", "\t"}).Draw(t, "ws")
		if g := (Principal{Identity: ws}).GUCs(); g.Identity != "" {
			t.Fatalf("anonymous GUC identity not empty: %q", g.Identity)
		}
		id := rapid.StringMatching(`[a-z0-9]{1,12}`).Draw(t, "id")
		if g := (Principal{Identity: id}).GUCs(); g.Identity != id {
			t.Fatalf("resolved GUC identity drifted: %q want %q", g.Identity, id)
		}
	})
}

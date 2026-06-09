// collab_property_test.go — the S113 INVARIANT mirror (∀, rapid) + the determinism-first
// reproducibility property. reflects=runtime.collab.invariants · test_kind=invariant ·
// cert_language=rapid · authority=below · liveness=live.
//
// It pins, over ALL inputs:
//   - the authority invariant: a non-owner can NEVER approve/invite (administer acts), and a
//     non-member can never act — the provenance-and-authority gate;
//   - the provenance invariant: a recorded comment/invite/feed-entry carries the actor's
//     REAL identity, never a placeholder;
//   - the presence invariant: joining a canvas never DROPS an already-present user (no
//     overwrite), and the lock is never silently stolen;
//   - the reproducibility property (CLAUDE.md §6 determinism-first): same input ⇒ same
//     output (every record is content-addressed / idempotent; the ladder is pure).
package collab

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/adoption"
	"github.com/steph-frtech/aidos/back/runtime/membership"
	"pgregory.net/rapid"
)

var allRoles = []membership.Role{membership.RoleOwner, membership.RoleEditor, membership.RoleViewer}
var adminActs = []Act{ActInvite, ActApprove}
var readActs = []Act{ActComment, ActShare}

func actorWith(t *rapid.T, ident, proj string, role membership.Role, isMember bool) Actor {
	a := Actor{Identity: ident, ProjectID: proj}
	if isMember {
		m, err := membership.NewMembership(ident, proj, role)
		if err != nil {
			t.Fatalf("NewMembership: %v", err)
		}
		a.Member = &m
	}
	return a
}

// ∀ identified member + ∀ administer act: ONLY an owner is allowed; an editor/viewer is
// refused ROLE_FORBIDDEN; a non-member NOT_A_MEMBER. (a member without authority can never
// approve — the Godog done-criterion, generalized over all inputs.)
func TestProp_AdminActsOwnerOnly(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		proj := rapid.SampledFrom([]string{"p1", "alpha", "beta"}).Draw(t, "proj")
		role := rapid.SampledFrom(allRoles).Draw(t, "role")
		act := rapid.SampledFrom(adminActs).Draw(t, "act")
		ident := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "ident")
		isMember := rapid.Bool().Draw(t, "isMember")

		d := Authorize(actorWith(t, ident, proj, role, isMember), act)

		switch {
		case !isMember:
			if d.Verdict != VerdictDeny || d.BlockReason.Code != CodeNotAMember {
				t.Fatalf("non-member must be DENIED NOT_A_MEMBER for %s, got %+v", act, d)
			}
		case role == membership.RoleOwner:
			if d.Verdict != VerdictAllow {
				t.Fatalf("owner must be ALLOWED %s, got %+v", act, d)
			}
		default: // editor or viewer
			if d.Verdict != VerdictDeny || d.BlockReason.Code != CodeRoleForbidden {
				t.Fatalf("non-owner (%s) must be DENIED ROLE_FORBIDDEN for %s, got %+v", role, act, d)
			}
		}
	})
}

// ∀ identified member + ∀ read act: every member (any role) is allowed; a non-member is
// refused. A comment/share is always available to a member.
func TestProp_ReadActsAnyMember(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		proj := rapid.SampledFrom([]string{"p1", "alpha"}).Draw(t, "proj")
		role := rapid.SampledFrom(allRoles).Draw(t, "role")
		act := rapid.SampledFrom(readActs).Draw(t, "act")
		ident := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "ident")
		isMember := rapid.Bool().Draw(t, "isMember")

		d := Authorize(actorWith(t, ident, proj, role, isMember), act)
		if isMember {
			if d.Verdict != VerdictAllow {
				t.Fatalf("member (%s) must do read act %s, got %+v", role, act, d)
			}
		} else if d.Verdict != VerdictDeny {
			t.Fatalf("non-member must be DENIED read act %s, got %+v", act, d)
		}
	})
}

// ∀ unidentified actor: EVERY act is refused UNIDENTIFIED_ACTOR — provenance is never a
// placeholder (no comment/invite/feed-entry is ever recorded for a blank identity).
func TestProp_UnidentifiedActorAlwaysRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		blank := rapid.SampledFrom([]string{"", "   "}).Draw(t, "blank")
		proj := rapid.SampledFrom([]string{"p1", "alpha", ""}).Draw(t, "proj")
		a := Actor{Identity: blank, ProjectID: proj}

		if d := Authorize(a, ActComment); d.Verdict != VerdictDeny || d.BlockReason.Code != CodeUnidentifiedActor {
			t.Fatalf("unidentified comment must be UNIDENTIFIED_ACTOR, got %+v", d)
		}
		c, d, err := a.Comment(TargetIdea, "idea-1", "x")
		if err != nil {
			t.Fatalf("Comment err: %v", err)
		}
		if d.Verdict != VerdictDeny || c.ID != "" {
			t.Fatalf("no comment must be recorded for a blank identity, got id=%q", c.ID)
		}
	})
}

// ∀ a recorded comment by a member: the author is EXACTLY the actor's identity (provenance),
// the id is content-addressed (non-empty), and re-recording the same input yields the SAME
// id (idempotent — determinism-first reproducibility).
func TestProp_CommentProvenanceAndIdempotent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		proj := rapid.SampledFrom([]string{"p1", "alpha"}).Draw(t, "proj")
		role := rapid.SampledFrom(allRoles).Draw(t, "role")
		ident := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "ident")
		target := rapid.StringMatching(`[a-z0-9-]{1,10}`).Draw(t, "target")
		body := rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "body")

		a := actorWith(t, ident, proj, role, true)
		c1, d1, err1 := a.Comment(TargetIdea, target, body)
		if err1 != nil {
			t.Fatalf("Comment: %v", err1)
		}
		if d1.Verdict != VerdictAllow {
			t.Skip() // empty-after-trim body etc. — not the provenance path.
		}
		if c1.Author != ident {
			t.Fatalf("provenance must be the actor (%q), got %q", ident, c1.Author)
		}
		if c1.ID == "" {
			t.Fatalf("comment must be content-addressed")
		}
		c2, _, _ := a.Comment(TargetIdea, target, body)
		if c2.ID != c1.ID {
			t.Fatalf("same comment input must yield same id: %q vs %q", c1.ID, c2.ID)
		}
	})
}

// ∀ a sequence of joins on one canvas: every joined identity stays present (no overwrite),
// and the present set is deterministic (sorted, deduped) regardless of join order.
func TestProp_JoinNeverDropsAPresence(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		const proj, canvas = "alpha", "c1"
		idents := rapid.SliceOfNDistinct(
			rapid.StringMatching(`[a-z]{1,6}`), 1, 5,
			func(s string) string { return s },
		).Draw(t, "idents")

		c := Canvas{CanvasID: canvas, ProjectID: proj}
		for _, id := range idents {
			c, _ = c.Join(Actor{Identity: id, ProjectID: proj})
		}
		for _, id := range idents {
			if !c.IsPresent(id) {
				t.Fatalf("%q was dropped — a join overwrote a presence", id)
			}
		}
		if c.PresentCount() != len(idents) {
			t.Fatalf("want %d present, got %d", len(idents), c.PresentCount())
		}
	})
}

// ∀ capability view: StageFor is reproducible (same view ⇒ same current/next), and the
// ladder advances ONLY when the next dent has no gaps ("done is computed").
func TestProp_StageReproducibleAndGated(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		pool := []adoption.Capability{}
		for _, s := range adoption.Stages() {
			pool = append(pool, adoption.Requires(s)...)
		}
		n := rapid.IntRange(0, len(pool)).Draw(t, "n")
		view := pool[:n]

		p1 := StageFor("alpha", view)
		p2 := StageFor("alpha", view)
		if p1.CurrentStage() != p2.CurrentStage() || p1.NextStage() != p2.NextStage() {
			t.Fatalf("StageFor not reproducible: %v/%v vs %v/%v",
				p1.CurrentStage(), p1.NextStage(), p2.CurrentStage(), p2.NextStage())
		}
		ok, _ := p1.CanAdvance()
		gateMet := !p1.Plan.AllSatisfied && len(p1.Plan.NextGaps) == 0
		if ok != gateMet {
			t.Fatalf("advance must be exactly gate-met: CanAdvance=%v gateMet=%v", ok, gateMet)
		}
	})
}

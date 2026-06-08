package behaviorcapture_test

// S67 — the ATTACH-AT-CAPTURE reproducibility mirror (RED FIRST, rapid). It pins the EXACT
// done-criteria of S67 on every catalogue behavior × arbitrary already-present shapes:
//
//   - SINGLE FUNCTION / BYTE-IDENTICAL: the expansion the attach carries equals
//     behavior.Expand(attachment) VERBATIM (same pieces, same ExpansionID) — S67 consumes the
//     ONE authoritative S76 expander, never a second implementation. (the load-bearing clause.)
//   - RENDERED AS A PROPOSED CHANGESET: every Proposal carries a DRAFT ChangeSet (Status=DRAFT,
//     never APPLIED) whose spec_delta body IS the expansion (a proposal, never an apply).
//   - DETERMINISM: same (ideaRef, attachment) ⇒ byte-identical Proposal (same ChangeSet id,
//     same ProposalID). The attach is a pure function, never a learned/LLM judgment.
//   - THE WALL: the carried expansion WroteKernel=false; the dry-run + DRAFT propose, write no
//     truth (freezing goes via /goal).
//
// These are the EXACT clauses of S67's done-criteria: "l'expansion attachée à la capture est
// byte-identique à celle de S76 (une seule fonction, un seul résultat) ; rendue comme
// ChangeSet proposé ; expansion = fonction pure, jamais un LLM, jamais dupliquée."

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
	"github.com/steph-frtech/aidos/back/runtime/behaviorcapture"
	"pgregory.net/rapid"
)

// drawAttachment draws an arbitrary valid attachment (mirrors S76's generator): a catalogue
// behavior, a non-empty entity name, and an arbitrary (possibly overlapping) existing shape.
func drawAttachment(t *rapid.T) behaviorcapture.Attachment {
	cat := behavior.Catalogue()
	b := cat[rapid.IntRange(0, len(cat)-1).Draw(t, "behavior_idx")]
	entity := rapid.StringMatching(`[A-Z][a-z]{0,8}`).Draw(t, "entity")
	names := rapid.SliceOfN(rapid.StringMatching(`[a-z_]{1,10}`), 0, 6)
	return behaviorcapture.Attachment{
		Behavior: b,
		Entity:   entity,
		Existing: behavior.Shape{
			Attributes: names.Draw(t, "attrs"),
			Relations:  names.Draw(t, "rels"),
			Operations: names.Draw(t, "ops"),
			Policies:   names.Draw(t, "pols"),
			Fixtures:   names.Draw(t, "fixs"),
		},
	}
}

// THE LOAD-BEARING PROPERTY: the attach carries S76's expansion byte-identically (single fn).
func TestAttach_ExpansionByteIdenticalToS76(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		idea := rapid.StringMatching(`idea-[a-z0-9]{4,10}`).Draw(t, "idea")
		a := drawAttachment(t)

		// The ONE authoritative expander (S76) — the reference.
		want, errRef := behavior.Expand(a)
		if errRef != nil {
			t.Fatalf("reference Expand errored on a valid attachment: %v", errRef)
		}

		p, err := behaviorcapture.AttachBehaviorAtCapture(idea, a, "phase-0")
		if err != nil {
			t.Fatalf("AttachBehaviorAtCapture errored on a valid attachment: %v", err)
		}
		if !reflect.DeepEqual(p.Expansion, want) {
			t.Fatalf("attach did NOT carry S76's expansion byte-identically:\n got  %+v\n want %+v", p.Expansion, want)
		}
		if p.Expansion.ExpansionID != want.ExpansionID {
			t.Fatalf("ExpansionID diverged from S76: %q vs %q (a second implementation crept in)", p.Expansion.ExpansionID, want.ExpansionID)
		}
	})
}

// RENDERED AS A PROPOSED CHANGESET (DRAFT, never applied) whose spec_delta IS the expansion.
func TestAttach_RenderedAsDraftChangeSet(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		idea := rapid.StringMatching(`idea-[a-z0-9]{4,10}`).Draw(t, "idea")
		a := drawAttachment(t)
		p, err := behaviorcapture.AttachBehaviorAtCapture(idea, a, "phase-0")
		if err != nil {
			t.Fatalf("attach errored: %v", err)
		}
		if p.ChangeSet.Status != changeset.StatusDraft {
			t.Fatalf("the proposal's ChangeSet must be DRAFT (a proposal, never applied), got %q", p.ChangeSet.Status)
		}
		if p.ChangeSet.SpecDelta == nil {
			t.Fatal("the DRAFT ChangeSet must carry a spec_delta (the proposed expansion)")
		}
		if p.ChangeSet.SpecDelta.Target != a.Entity {
			t.Fatalf("the spec_delta must target the attachment's entity %q, got %q", a.Entity, p.ChangeSet.SpecDelta.Target)
		}
		// A pure-computation attach never persists / applies: APPLIED is impossible here.
		if p.ChangeSet.ID == "" {
			t.Fatal("the DRAFT ChangeSet has no content-address id")
		}
	})
}

// DETERMINISM: same (ideaRef, attachment) ⇒ byte-identical Proposal (id + changeset id stable).
func TestAttach_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		idea := rapid.StringMatching(`idea-[a-z0-9]{4,10}`).Draw(t, "idea")
		a := drawAttachment(t)
		p1, err1 := behaviorcapture.AttachBehaviorAtCapture(idea, a, "phase-0")
		p2, err2 := behaviorcapture.AttachBehaviorAtCapture(idea, a, "phase-0")
		if err1 != nil || err2 != nil {
			t.Fatalf("attach errored on a valid attachment: %v / %v", err1, err2)
		}
		if !reflect.DeepEqual(p1, p2) {
			t.Fatalf("non-deterministic proposal:\n %+v\n != %+v", p1, p2)
		}
		id1, e1 := behaviorcapture.ProposalID(p1)
		id2, e2 := behaviorcapture.ProposalID(p2)
		if e1 != nil || e2 != nil {
			t.Fatalf("ProposalID errored: %v / %v", e1, e2)
		}
		if id1 == "" || id1 != id2 {
			t.Fatalf("ProposalID not a stable content-address: %q vs %q", id1, id2)
		}
	})
}

// THE WALL: the carried expansion writes no truth (dry-run); the proposal is DRAFT.
func TestAttach_WritesNoKernelTruth(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		idea := rapid.StringMatching(`idea-[a-z0-9]{4,10}`).Draw(t, "idea")
		a := drawAttachment(t)
		p, err := behaviorcapture.AttachBehaviorAtCapture(idea, a, "phase-0")
		if err != nil {
			t.Fatalf("attach errored: %v", err)
		}
		if p.Expansion.WroteKernel {
			t.Fatal("WALL VIOLATION: the attached expansion reports WroteKernel=true — the dry-run must write no truth (freeze via /goal)")
		}
		if p.ChangeSet.Status != changeset.StatusDraft {
			t.Fatalf("WALL VIOLATION: the proposal must be DRAFT, got %q", p.ChangeSet.Status)
		}
	})
}

// PieceCount / PreviewNames defer to S76 (one source of truth for the count + the preview).
func TestAttach_CountAndPreviewDeferToS76(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		idea := rapid.StringMatching(`idea-[a-z0-9]{4,10}`).Draw(t, "idea")
		a := drawAttachment(t)
		p, err := behaviorcapture.AttachBehaviorAtCapture(idea, a, "phase-0")
		if err != nil {
			t.Fatalf("attach errored: %v", err)
		}
		if behaviorcapture.PieceCount(p) != behavior.PieceCount(p.Expansion) {
			t.Fatal("PieceCount diverged from S76 (a second count crept in)")
		}
		if !reflect.DeepEqual(behaviorcapture.PreviewNames(p), behavior.SortedNames(p.Expansion)) {
			t.Fatal("PreviewNames diverged from S76 (a second preview crept in)")
		}
	})
}

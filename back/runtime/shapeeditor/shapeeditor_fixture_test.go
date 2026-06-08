package shapeeditor_test

// S68 — the DRAFT-LEVEL CONCURRENCY fixture mirror (state → command → events). It pins the
// load-bearing concurrency criterion of S68: two concurrent edits of the SAME draft MERGE
// (disjoint fields) or LOCK (same field, different value) — NEVER a silent last-write-wins.
//
//	state   (a draft at version 0, two authors editing it concurrently against base 0)
//	  → command (MergeEdits a, b)
//	  → events  (disjoint → merged at version 1 ; same-field-clash → DRAFT_EDIT_CONFLICT lock,
//	            both candidates surfaced, version NOT advanced)
//
// This is a DRAFT-level (pre-ChangeSet, below-the-wall) conflict — distinct from the truth-write
// conflict of S110 (optimistic-lock on the head).

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/shapeeditor"
)

func newDraft(t *testing.T) shapeeditor.Draft {
	t.Helper()
	d, err := shapeeditor.OpenDraft("proj-1", records.LayerRef{LayerID: "Order.discount", Version: "v1"}, shapeeditor.NatureWorkflow)
	if err != nil {
		t.Fatalf("OpenDraft: %v", err)
	}
	return d
}

func sp(s string) *string { return &s }

// Disjoint edits MERGE — author A sets the title, author B sets the source. Both survive.
func TestConcurrency_DisjointEdits_Merge(t *testing.T) {
	d := newDraft(t)
	a := shapeeditor.Edit{Author: "alice", BaseVersion: 0, Title: sp("Discount fixture")}
	b := shapeeditor.Edit{Author: "bob", BaseVersion: 0, Source: sp("fixture: f\nstate: s\ncommand: c\nevent: e")}

	merged, conflicts, err := shapeeditor.MergeEdits(d, a, b)
	if err != nil {
		t.Fatalf("disjoint edits must merge, got error %v", err)
	}
	if len(conflicts) != 0 {
		t.Fatalf("disjoint edits must not conflict, got %+v", conflicts)
	}
	if merged.Title != "Discount fixture" {
		t.Fatalf("alice's title lost: %q", merged.Title)
	}
	if merged.Source == "" {
		t.Fatal("bob's source lost — last-write-wins would have dropped one of them")
	}
	if merged.Version != 1 {
		t.Fatalf("merged version must bump to 1, got %d", merged.Version)
	}
}

// Same-field clash LOCKS — never last-write-wins. Both candidates surface; the version stays put.
func TestConcurrency_SameFieldClash_Locks_NotLastWriteWins(t *testing.T) {
	d := newDraft(t)
	a := shapeeditor.Edit{Author: "alice", BaseVersion: 0, Title: sp("Alice title")}
	b := shapeeditor.Edit{Author: "bob", BaseVersion: 0, Title: sp("Bob title")}

	merged, conflicts, err := shapeeditor.MergeEdits(d, a, b)
	if !errors.Is(err, shapeeditor.ErrDraftConflict) {
		t.Fatalf("same-field clash must lock with ErrDraftConflict, got %v", err)
	}
	if len(conflicts) != 1 || conflicts[0].Field != "title" {
		t.Fatalf("the title conflict must be surfaced, got %+v", conflicts)
	}
	if conflicts[0].ValueA == conflicts[0].ValueB {
		t.Fatal("both candidate values must be surfaced for human resolution")
	}
	// The draft is NOT advanced — neither write silently won.
	if merged.Version != 0 || merged.Title != "" {
		t.Fatalf("a lock must NOT advance the draft (no last-write-wins), got v=%d title=%q", merged.Version, merged.Title)
	}
}

// Same field, SAME value → idempotent merge (no conflict).
func TestConcurrency_SameFieldSameValue_Merges(t *testing.T) {
	d := newDraft(t)
	a := shapeeditor.Edit{Author: "alice", BaseVersion: 0, Title: sp("Same")}
	b := shapeeditor.Edit{Author: "bob", BaseVersion: 0, Title: sp("Same")}
	merged, conflicts, err := shapeeditor.MergeEdits(d, a, b)
	if err != nil || len(conflicts) != 0 {
		t.Fatalf("same value must merge cleanly, got err=%v conflicts=%+v", err, conflicts)
	}
	if merged.Title != "Same" || merged.Version != 1 {
		t.Fatalf("merged wrong: title=%q v=%d", merged.Title, merged.Version)
	}
}

// A stale base is rejected — never a last-write-wins over a moved draft.
func TestConcurrency_StaleBase_Rejected(t *testing.T) {
	d := newDraft(t)
	moved, err := shapeeditor.ApplyEdit(d, shapeeditor.Edit{Author: "alice", BaseVersion: 0, Title: sp("v1")})
	if err != nil {
		t.Fatalf("ApplyEdit: %v", err)
	}
	// Bob edits against the now-stale base 0.
	_, _, err = shapeeditor.MergeEdits(moved, shapeeditor.Edit{Author: "bob", BaseVersion: 0, Title: sp("late")}, shapeeditor.Edit{Author: "carol", BaseVersion: 0})
	if !errors.Is(err, shapeeditor.ErrStaleBase) {
		t.Fatalf("a stale base must be rejected, got %v", err)
	}
}

// ProposeMirror over a draft → a DRAFT ChangeSet carrying a red, project-scoped mirror; no truth written.
func TestProposeMirror_DraftChangeSet_RedProjectScoped_NoWrite(t *testing.T) {
	d := newDraft(t)
	d.Source = "fixture: discount applied\nstate: cart with item\ncommand: apply discount\nevent: discount applied"
	d.Title = "discount fixture"

	p, err := shapeeditor.ProposeMirror(d, "phase-0")
	if err != nil {
		t.Fatalf("ProposeMirror: %v", err)
	}
	if p.WroteMirror {
		t.Fatal("the wall: WroteMirror must be false")
	}
	if p.ChangeSet.Status != "DRAFT" {
		t.Fatalf("changeset must be DRAFT, got %q", p.ChangeSet.Status)
	}
	if p.ChangeSet.SpecDelta != nil || p.ChangeSet.MirrorDelta == nil {
		t.Fatal("a mirror authoring carries only a mirror_delta (no spec_delta)")
	}
	if p.ProjectID != "proj-1" {
		t.Fatalf("mirror must be project-scoped, got %q", p.ProjectID)
	}
	if p.Mirror.TestKind != records.TestKindFixture || p.Mirror.CertLanguage != records.CertFixture {
		t.Fatalf("workflow nature must derive a fixture mirror, got %q/%q", p.Mirror.TestKind, p.Mirror.CertLanguage)
	}
	if !shapeeditor.IsRed(p) {
		t.Fatal("the authored mirror must be born RED (watch it fail)")
	}
}

// An unparseable source is refused — never a mirror persisted from invalid text.
func TestProposeMirror_UnparseableSource_Refused(t *testing.T) {
	d := newDraft(t)
	d.Source = "this is not a fixture"
	if _, err := shapeeditor.ProposeMirror(d, "phase-0"); !errors.Is(err, shapeeditor.ErrParse) {
		t.Fatalf("an unparseable source must be refused with ErrParse, got %v", err)
	}
}

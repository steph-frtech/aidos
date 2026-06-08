package behavior

// library_fixture_test.go — the S79 WORKED-EXAMPLE mirror (KRD §24.6, app-builder EPIC 7). It pins
// the done-criterion verbatim:
//
//   « attacher `owner-scoping` à une entité prévisualise des policies+fixtures scopées et les
//     atterrit via changeset approuvé. »
//
// It is a state → command → events fixture (the N2 workflow form, CLAUDE.md §1): a library holding
// an `ownable` record, the ATTACH command on an entity, then the asserted events — the previewed
// scoped policy (owner-scoping) + scoped fixtures, and the APPROVED (APPLIED) ChangeSet landing.

import (
	"testing"
	"time"
)

// the ownable record the project library holds (the §24.6 owner-scoping behaviour).
func ownableRecord() Record {
	return Record{
		Kind:    Ownable,
		Owner:   "alice",
		Version: 1,
		Tags:    []string{"scoping", "security"},
		Labels:  map[string]string{"fr": "Possédé par un propriétaire", "en": "Owner-scoped"},
	}
}

// TestLibrary_AttachOwnerScoping_PreviewsScopedAndLandsViaApprovedChangeSet is the done-criterion.
func TestLibrary_AttachOwnerScoping_PreviewsScopedAndLandsViaApprovedChangeSet(t *testing.T) {
	// state: a project library holding the ownable record.
	lib, recID, err := NewLibrary("proj-shop").Add(ownableRecord())
	if err != nil {
		t.Fatalf("Add ownable record: %v", err)
	}

	// command: attach owner-scoping to the Order entity (fresh shape) and LAND it.
	approvedAt := time.Date(2026, 6, 8, 12, 0, 0, 0, time.UTC)
	landed, br, err := lib.LandAttach(recID, "Order", Shape{}, "phase-0", approvedAt)
	if err != nil {
		t.Fatalf("LandAttach: %v", err)
	}
	if br != nil {
		t.Fatalf("LandAttach refused: %s", br.Error())
	}

	// event 1: the PREVIEW shows the scoped owner-scoping POLICY.
	pol := landed.Preview.Expansion.Policies
	if len(pol) != 1 || pol[0].Name != "owner-scoping" {
		t.Fatalf("expected previewed policy owner-scoping, got %+v", pol)
	}
	if pol[0].Scope != "OPERATION" || pol[0].Effect != "DENY" {
		t.Fatalf("owner-scoping policy not scoped OPERATION/DENY: %+v", pol[0])
	}

	// event 2: the PREVIEW shows the scoped FIXTURES (the proof obligations).
	wantFix := map[string]bool{"owner-only-mutation-allowed": true, "non-owner-mutation-denied": true}
	if len(landed.Preview.Expansion.Fixtures) != len(wantFix) {
		t.Fatalf("expected %d previewed fixtures, got %+v", len(wantFix), landed.Preview.Expansion.Fixtures)
	}
	for _, f := range landed.Preview.Expansion.Fixtures {
		if !wantFix[f.Name] {
			t.Fatalf("unexpected previewed fixture %q", f.Name)
		}
	}

	// event 3: the DRAFT preview wrote NOTHING (the wall) — WroteKernel false.
	if landed.Preview.Expansion.WroteKernel {
		t.Fatalf("preview must not write the kernel (the wall)")
	}

	// event 4: it LANDED via an APPROVED changeset — status APPLIED, scoped to the entity, with a
	// commit stamp.
	if landed.Applied.Status != "APPLIED" {
		t.Fatalf("expected APPLIED landing, got %s", landed.Applied.Status)
	}
	if landed.Applied.AppliedAt == nil || !landed.Applied.AppliedAt.Equal(approvedAt) {
		t.Fatalf("applied stamp wrong: %+v", landed.Applied.AppliedAt)
	}
	wantTarget := "behavior-expansion@Order"
	if landed.Applied.SpecDelta == nil || landed.Applied.SpecDelta.Target != wantTarget {
		t.Fatalf("expected spec_delta target %q, got %+v", wantTarget, landed.Applied.SpecDelta)
	}
	if landed.Applied.MirrorDelta == nil {
		t.Fatalf("approved landing must carry its mirror_delta (completeness)")
	}
}

// TestLibrary_BrowseSearchTagPublishSoftDeleteComment exercises the other six library gestures.
func TestLibrary_BrowseSearchTagPublishSoftDeleteComment(t *testing.T) {
	lib, ownID, err := NewLibrary("proj-shop").Add(ownableRecord())
	if err != nil {
		t.Fatalf("Add ownable: %v", err)
	}
	lib, _, err = lib.Add(Record{
		Kind: SoftDeletable, Owner: "bob", Version: 1,
		Labels: map[string]string{"fr": "Archivable", "en": "Soft-deletable"},
	})
	if err != nil {
		t.Fatalf("Add soft-deletable: %v", err)
	}

	// BROWSE: two live entries, in canonical (catalogue) order — ownable first.
	live := lib.Browse(false)
	if len(live) != 2 || live[0].Record.Kind != Ownable || live[1].Record.Kind != SoftDeletable {
		t.Fatalf("browse order wrong: %+v", live)
	}

	// SEARCH: a deterministic match on the owner "alice" returns only the ownable record.
	hits := lib.Search("alice")
	if len(hits) != 1 || hits[0].Record.Owner != "alice" {
		t.Fatalf("search alice wrong: %+v", hits)
	}
	// SEARCH on a tag matches; an unrelated query matches nothing (no false positive).
	if len(lib.Search("scoping")) != 1 {
		t.Fatalf("search scoping should hit the ownable record")
	}
	if len(lib.Search("zzz-nothing")) != 0 {
		t.Fatalf("search of a non-existent token must match nothing")
	}

	// TAG: tagging re-keys (a record is its tags) and the new id is searchable on the tag.
	tagged, newID, err := lib.Tag(ownID, "audited")
	if err != nil {
		t.Fatalf("Tag: %v", err)
	}
	if newID == ownID {
		t.Fatalf("tagging must produce a new content id")
	}
	if len(tagged.Search("audited")) != 1 {
		t.Fatalf("the new tag must be searchable")
	}

	// PUBLISH.
	pub, err := tagged.Publish(newID)
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if !pub.Entries[newID].Published {
		t.Fatalf("publish flag not set")
	}

	// SOFTDEL: hides from default browse, stays in the trash view, never destroyed.
	del, err := pub.SoftDelete(newID)
	if err != nil {
		t.Fatalf("SoftDelete: %v", err)
	}
	if len(del.Browse(false)) != 1 {
		t.Fatalf("soft-deleted entry must be hidden from default browse")
	}
	if len(del.Browse(true)) != 2 {
		t.Fatalf("soft-deleted entry must remain in the trash view (never destroyed)")
	}

	// COMMENT: append-only thread.
	at := time.Date(2026, 6, 8, 9, 0, 0, 0, time.UTC)
	comm, err := del.Comment(newID, "carol", "réutilisé sur 3 entités", at)
	if err != nil {
		t.Fatalf("Comment: %v", err)
	}
	if len(comm.Entries[newID].Comments) != 1 || comm.Entries[newID].Comments[0].Author != "carol" {
		t.Fatalf("comment not appended: %+v", comm.Entries[newID].Comments)
	}

	// missing-record gestures are typed errors, never silent.
	if _, err := del.Publish("nope"); err != ErrRecordNotInLibrary {
		t.Fatalf("publish of a missing record should be ErrRecordNotInLibrary, got %v", err)
	}
}

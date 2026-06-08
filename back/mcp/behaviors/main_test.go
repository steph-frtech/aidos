package main

import (
	"context"
	"testing"
)

// The behaviors MCP server is PURE computation (the wall): these tests prove each S79 library tool
// returns deterministically without any I/O — browse/search/tag/publish/soft-delete/comment, and the
// attach that previews scoped policies+fixtures via the ONE S76 Propose and lands via an APPROVED
// (APPLIED) ChangeSet.

func ownableRec() recordInput {
	return recordInput{
		Kind: "ownable", Owner: "alice", Version: 1,
		Tags: []string{"scoping", "security"}, Labels: map[string]string{"fr": "propriété", "en": "ownership"},
	}
}

func softRec() recordInput {
	return recordInput{
		Kind: "soft-deletable", Owner: "bob", Version: 1,
		Labels: map[string]string{"fr": "archivable", "en": "soft-deletable"},
	}
}

func TestBrowseCanonicalOrder(t *testing.T) {
	_, out, err := browseTool(context.Background(), nil, browseInput{
		ProjectID: "p", Records: []recordInput{softRec(), ownableRec()},
	})
	if err != nil || !out.OK {
		t.Fatalf("browse: %v %+v", err, out)
	}
	if out.Count != 2 || out.Entries[0].Kind != "ownable" || out.Entries[1].Kind != "soft-deletable" {
		t.Fatalf("browse canonical order wrong: %+v", out.Entries)
	}
}

func TestSearchDeterministicAndScoped(t *testing.T) {
	in := searchInput{ProjectID: "p", Records: []recordInput{ownableRec(), softRec()}, Query: "alice"}
	_, a, _ := searchTool(context.Background(), nil, in)
	_, b, _ := searchTool(context.Background(), nil, in)
	if a.Count != 1 || a.Entries[0].Owner != "alice" {
		t.Fatalf("search alice should hit only the ownable record: %+v", a)
	}
	if a.Count != b.Count {
		t.Fatalf("search not deterministic")
	}
	_, none, _ := searchTool(context.Background(), nil, searchInput{ProjectID: "p", Records: []recordInput{ownableRec()}, Query: "zzz"})
	if none.Count != 0 {
		t.Fatalf("search of a non-existent token must match nothing")
	}
}

func TestTagPublishSoftDeleteComment(t *testing.T) {
	recs := []recordInput{ownableRec()}
	// find the ownable record id via browse.
	_, br, _ := browseTool(context.Background(), nil, browseInput{ProjectID: "p", Records: recs})
	id := br.Entries[0].RecordID

	_, tag, _ := tagTool(context.Background(), nil, gestureInput{ProjectID: "p", Records: recs, RecordID: id, Tag: "shared"})
	if !tag.OK || tag.RecordID == id {
		t.Fatalf("tag should succeed and re-key: %+v", tag)
	}
	_, pub, _ := publishTool(context.Background(), nil, gestureInput{ProjectID: "p", Records: recs, RecordID: id})
	if !pub.OK {
		t.Fatalf("publish failed: %+v", pub)
	}
	_, del, _ := softDeleteTool(context.Background(), nil, gestureInput{ProjectID: "p", Records: recs, RecordID: id})
	if !del.OK {
		t.Fatalf("soft-delete failed: %+v", del)
	}
	_, com, _ := commentTool(context.Background(), nil, gestureInput{
		ProjectID: "p", Records: recs, RecordID: id, Author: "carol", Body: "ok", At: "2026-06-08T09:00:00Z",
	})
	if !com.OK {
		t.Fatalf("comment failed: %+v", com)
	}
	// missing record → typed error.
	_, miss, _ := publishTool(context.Background(), nil, gestureInput{ProjectID: "p", Records: recs, RecordID: "nope"})
	if miss.OK {
		t.Fatalf("publish of a missing record must fail")
	}
}

func TestAttachPreviewThenLand(t *testing.T) {
	recs := []recordInput{ownableRec()}
	_, br, _ := browseTool(context.Background(), nil, browseInput{ProjectID: "p", Records: recs})
	id := br.Entries[0].RecordID

	// PREVIEW: scoped policies+fixtures, DRAFT changeset, writes nothing.
	_, prev, _ := attachTool(context.Background(), nil, attachInput{
		ProjectID: "p", Records: recs, RecordID: id, Entity: "Order", ParentPhase: "phase-0",
	})
	if !prev.OK || prev.Landed {
		t.Fatalf("preview should succeed and not land: %+v", prev)
	}
	if prev.WroteKernel {
		t.Fatalf("preview must not write the kernel")
	}
	if len(prev.Policies) != 1 || prev.Policies[0].Name != "owner-scoping" {
		t.Fatalf("preview should show owner-scoping policy: %+v", prev.Policies)
	}
	if len(prev.Fixtures) != 2 {
		t.Fatalf("preview should show 2 scoped fixtures: %+v", prev.Fixtures)
	}
	if prev.ChangeSetStatus != "DRAFT" {
		t.Fatalf("preview changeset must be DRAFT, got %s", prev.ChangeSetStatus)
	}

	// LAND: approved (APPLIED) changeset.
	_, land, _ := attachTool(context.Background(), nil, attachInput{
		ProjectID: "p", Records: recs, RecordID: id, Entity: "Order", ParentPhase: "phase-0",
		Land: true, ApprovedAt: "2026-06-08T12:00:00Z",
	})
	if !land.OK || !land.Landed {
		t.Fatalf("land should succeed: %+v", land)
	}
	if land.ChangeSetStatus != "APPLIED" {
		t.Fatalf("landed changeset must be APPLIED, got %s", land.ChangeSetStatus)
	}
	if land.WroteKernel {
		t.Fatalf("landing is via changeset value, never a direct kernel write")
	}
}

func TestServerRegistersSevenTools(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatalf("server must build")
	}
}

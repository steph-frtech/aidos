package linksrv

import (
	"context"
	"testing"
)

func pinned(id, v string) refIn { return refIn{ID: id, Version: v} }

// TestKindsTool — the six closed §41 link kinds, canonical order.
func TestKindsTool(t *testing.T) {
	_, out, _ := kinds(context.Background(), nil, kindsInput{})
	if len(out.Kinds) != 6 || out.Kinds[0] != "projects_to" || out.Kinds[5] != "mirrors" {
		t.Fatalf("kinds wrong closed set: %+v", out.Kinds)
	}
}

// TestValidateTool — a pinned link of a known kind is valid; an unpinned target is a monster.
func TestValidateTool(t *testing.T) {
	_, ok, _ := validate(context.Background(), nil, linkIn{Kind: "mirrors", From: pinned("spec", "v1"), To: pinned("mir", "v1")})
	if !ok.OK {
		t.Fatalf("a pinned mirrors link must validate: %+v", ok)
	}
	_, bad, _ := validate(context.Background(), nil, linkIn{Kind: "mirrors", From: pinned("spec", "v1"), To: pinned("mir", "")})
	if bad.OK {
		t.Fatalf("an unpinned `to` must be refused (a monster, §41): %+v", bad)
	}
	_, unk, _ := validate(context.Background(), nil, linkIn{Kind: "ghost", From: pinned("a", "v1"), To: pinned("b", "v1")})
	if unk.OK {
		t.Fatalf("an unknown kind must be refused (closed set): %+v", unk)
	}
}

// TestResolveTool — the §41–§42 staleness check: green (pinned to head), stale (non-head), absent.
func TestResolveTool(t *testing.T) {
	link := linkIn{Kind: "projects_to", From: pinned("ent", "v1"), To: pinned("Order", "v2")}
	_, green, _ := resolve(context.Background(), nil, resolveInput{Link: link, Heads: map[string]string{"Order": "v2"}})
	if !green.OK || green.Status != "green" {
		t.Fatalf("pinned to head ⇒ green: %+v", green)
	}
	_, stale, _ := resolve(context.Background(), nil, resolveInput{Link: link, Heads: map[string]string{"Order": "v3"}})
	if stale.Status != "stale" {
		t.Fatalf("pinned to a non-head version ⇒ stale (the red-wave seed): %+v", stale)
	}
	_, absent, _ := resolve(context.Background(), nil, resolveInput{Link: link, Heads: map[string]string{}})
	if absent.Status != "absent" {
		t.Fatalf("no head at all ⇒ absent: %+v", absent)
	}
}

// TestGraphTool — validate + resolve a graph, fold the counts + the all-pinned guarantee.
func TestGraphTool(t *testing.T) {
	_, out, _ := graph(context.Background(), nil, graphInput{
		Links: []linkIn{
			{Kind: "projects_to", From: pinned("a", "v1"), To: pinned("X", "v1")}, // green
			{Kind: "derives_from", From: pinned("b", "v1"), To: pinned("Y", "v1")}, // stale (head v2)
			{Kind: "mirrors", From: pinned("c", "v1"), To: pinned("Z", "v1")},      // absent (no head)
		},
		Heads: map[string]string{"X": "v1", "Y": "v2"},
	})
	if !out.OK || !out.AllPinned {
		t.Fatalf("a fully-pinned graph must report all_pinned: %+v", out)
	}
	if out.GreenCount != 1 || out.StaleCount != 1 || out.AbsentCount != 1 {
		t.Fatalf("counts wrong: green=%d stale=%d absent=%d", out.GreenCount, out.StaleCount, out.AbsentCount)
	}
}

// TestGraphUnpinnedNotAllPinned — an unpinned link drops all_pinned (the §41 guarantee fails).
func TestGraphUnpinnedNotAllPinned(t *testing.T) {
	_, out, _ := graph(context.Background(), nil, graphInput{
		Links: []linkIn{{Kind: "mirrors", From: pinned("a", "v1"), To: pinned("X", "")}},
		Heads: map[string]string{},
	})
	if out.AllPinned {
		t.Fatalf("an unpinned `to` must drop all_pinned: %+v", out)
	}
	if out.Links[0].Valid {
		t.Fatalf("the unpinned link must be marked invalid: %+v", out.Links[0])
	}
}

func TestServerBuilds(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("NewServer returned nil")
	}
}

package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/memory"
)

// TestMemoryMCP_WriteRecallGet exercises the three tools end-to-end through the MCP handlers,
// backed by the deterministic MockStore (the injection seam — no DB needed). It proves the
// capability door behaves: write returns a content-addressed id, recall returns the nearest hit
// first with its taint/provenance, get reads a row back.
func TestMemoryMCP_WriteRecallGet(t *testing.T) {
	ctx := context.Background()
	s := &server{store: memory.NewMockStore(memory.NewHashEmbedder(embedderSeed))}

	for _, in := range []writeInput{
		{Kind: "episodic", Content: "incident 42 deploy failed", Branch: "main", Taint: []string{"incident_derived"}},
		{Kind: "semantic", Content: "shopping cart term means basket of items", Branch: "main", Provenance: "glossary"},
		{Kind: "procedural", Content: "grill with docs sharpens intention", Branch: "main"},
		{Kind: "structural", Content: "context map dependency graph", Branch: "main"},
	} {
		_, _, err := s.write(ctx, nil, in)
		if err != nil {
			t.Fatalf("write %s: %v", in.Kind, err)
		}
	}

	_, rec, err := s.recall(ctx, nil, recallInput{Query: "shopping cart basket", K: 2})
	if err != nil {
		t.Fatalf("recall: %v", err)
	}
	if len(rec.Hits) != 2 {
		t.Fatalf("len(hits) = %d, want 2", len(rec.Hits))
	}
	if rec.Hits[0].Kind != "semantic" {
		t.Fatalf("nearest hit kind = %q, want semantic", rec.Hits[0].Kind)
	}
	if rec.Hits[0].Score < rec.Hits[1].Score {
		t.Fatalf("hits not score-desc: %v < %v", rec.Hits[0].Score, rec.Hits[1].Score)
	}

	_, got, err := s.get(ctx, nil, getInput{ID: rec.Hits[0].ID})
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Hit.ID != rec.Hits[0].ID || got.Hit.Kind != "semantic" {
		t.Fatalf("get mismatch: %+v", got.Hit)
	}
}

// TestMemoryMCP_KindBranchFilter proves the recall tool honours the kind/branch filters.
func TestMemoryMCP_KindBranchFilter(t *testing.T) {
	ctx := context.Background()
	s := &server{store: memory.NewMockStore(memory.NewHashEmbedder(embedderSeed))}
	for _, in := range []writeInput{
		{Kind: "semantic", Content: "cart on main", Branch: "main"},
		{Kind: "semantic", Content: "cart on branch x", Branch: "branch-x"},
		{Kind: "episodic", Content: "cart incident", Branch: "main"},
	} {
		if _, _, err := s.write(ctx, nil, in); err != nil {
			t.Fatalf("write: %v", err)
		}
	}
	_, rec, err := s.recall(ctx, nil, recallInput{Query: "cart", Kind: "semantic", Branch: "main", K: 5})
	if err != nil {
		t.Fatalf("recall: %v", err)
	}
	if len(rec.Hits) != 1 {
		t.Fatalf("filtered recall = %d hits, want 1", len(rec.Hits))
	}
	if rec.Hits[0].Kind != "semantic" || rec.Hits[0].Branch != "main" {
		t.Fatalf("filter leaked: %+v", rec.Hits[0])
	}
}

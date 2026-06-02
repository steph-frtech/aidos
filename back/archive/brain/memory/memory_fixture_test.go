package memory_test

// BDD MIRROR — write-then-recall fixture (mirrors schema · reflects: brain.memory_item +
// memory.Store "memory-write-recall" · test_kind: fixture · cert_language: fixture · authority:
// above). Materialized here (the mirrors Postgres schema persists it; this file IS the runnable
// red→green proof). It runs as state → command → events, PARAMETRIZED over backend ∈ {mock, pgx}
// and against BOTH — that identical pass IS the "both backends injectable" done criterion.
//
// THE DONE CASE: TestFixture_WriteThenRecall is the canonical done case. A MemoryItem written
// across the four kinds (episodic/semantic/procedural/structural) has id == content_hash(content)
// (S01 reused) and is then recallable; recall returns the nearest-by-similarity first, ordered by
// score desc, len ≤ k; the kind/branch filters narrow the set; a superseding write INSERTS a new
// row (count increments) rather than editing (the append-only case).

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/memory"
)

// fixtureSeed is the FIXED embedder seed — recall is deterministic under it (ADR 0025).
const fixtureSeed uint64 = 31

// backendCase couples a name with a freshly-built Store + a Count() reader, so each fixture row can
// run against {mock, pgx} interchangeably.
type backendCase struct {
	name  string
	store memory.Store
	count func() int
}

// backends builds the {mock, pgx} cases sharing the SAME deterministic embedder, so the two are
// observationally equivalent on recall ordering for the fixture vectors. The pgx case spins up a
// pgvector Testcontainer.
func backends(t *testing.T) []backendCase {
	t.Helper()
	emb := memory.NewHashEmbedder(fixtureSeed)

	mock := memory.NewMockStore(emb)
	cases := []backendCase{{name: "mock", store: mock, count: mock.Count}}

	pool := startPgvectorPostgres(t)
	pgx := memory.NewPgxStore(pool, emb)
	cases = append(cases, backendCase{
		name:  "pgx",
		store: pgx,
		count: func() int {
			n, err := pgx.Count(context.Background())
			if err != nil {
				t.Fatalf("pgx count: %v", err)
			}
			return n
		},
	})
	return cases
}

func TestFixture_WriteThenRecall(t *testing.T) {
	ctx := context.Background()
	for _, bc := range backends(t) {
		t.Run(bc.name, func(t *testing.T) {
			// ── GIVEN an empty store, WHEN we write a semantic item → Written; id == content hash.
			id, err := bc.store.Write(ctx, memory.WriteInput{
				Kind: memory.KindSemantic, Content: "cart", Branch: "main", Confidence: 0.5,
			})
			if err != nil {
				t.Fatalf("write: %v", err)
			}
			wantID, err := memory.MemoryItem{Kind: memory.KindSemantic, Content: "cart", Branch: "main", Confidence: 0.5}.ComputeID()
			if err != nil {
				t.Fatalf("compute id: %v", err)
			}
			if id != wantID {
				t.Fatalf("id = %s, want content hash %s", id, wantID)
			}
			got, err := bc.store.Get(ctx, id)
			if err != nil {
				t.Fatalf("get after write: %v", err)
			}
			if got.Kind != memory.KindSemantic || got.ID != wantID {
				t.Fatalf("recalled item mismatch: %+v", got)
			}

			// ── GIVEN the four kinds, WHEN we recall ~"shopping cart" k=2 → Recalled; nearest is
			//    the semantic cart term; len ≤ k; ordered by score desc.
			writeFour(ctx, t, bc.store)
			hits, err := bc.store.Recall(ctx, memory.RecallQuery{QueryText: "shopping cart basket", K: 2})
			if err != nil {
				t.Fatalf("recall: %v", err)
			}
			if len(hits) != 2 {
				t.Fatalf("len(hits) = %d, want 2", len(hits))
			}
			if hits[0].Item.Kind != memory.KindSemantic {
				t.Fatalf("nearest hit kind = %q, want semantic", hits[0].Item.Kind)
			}
			if hits[0].Score < hits[1].Score {
				t.Fatalf("hits not ordered by score desc: %v < %v", hits[0].Score, hits[1].Score)
			}

			// ── GIVEN kind+branch filters, recall narrows the set ──
			if _, err := bc.store.Write(ctx, memory.WriteInput{Kind: memory.KindSemantic, Content: "cart on branch x", Branch: "branch-x"}); err != nil {
				t.Fatalf("write branch-x: %v", err)
			}
			filtered, err := bc.store.Recall(ctx, memory.RecallQuery{
				QueryText: "cart", Kind: memory.KindSemantic, Branch: "main", K: 5,
			})
			if err != nil {
				t.Fatalf("filtered recall: %v", err)
			}
			if len(filtered) == 0 {
				t.Fatalf("filtered recall returned nothing")
			}
			for _, h := range filtered {
				if h.Item.Kind != memory.KindSemantic || h.Item.Branch != "main" {
					t.Fatalf("filter leaked: %+v", h.Item)
				}
			}

			// ── THE APPEND-ONLY CASE: a superseding write is a NEW row, never an in-place edit ──
			before := bc.count()
			if _, err := bc.store.Write(ctx, memory.WriteInput{
				Kind: memory.KindSemantic, Content: "cart superseded", Branch: "main", Confidence: 0.9,
			}); err != nil {
				t.Fatalf("superseding write: %v", err)
			}
			if after := bc.count(); after != before+1 {
				t.Fatalf("append-only violated: count %d → %d (want +1)", before, after)
			}
			// Idempotent: re-writing the SAME body does NOT add a row.
			again := bc.count()
			if _, err := bc.store.Write(ctx, memory.WriteInput{
				Kind: memory.KindSemantic, Content: "cart superseded", Branch: "main", Confidence: 0.9,
			}); err != nil {
				t.Fatalf("idempotent write: %v", err)
			}
			if after := bc.count(); after != again {
				t.Fatalf("idempotency violated: count %d → %d (want unchanged)", again, after)
			}
		})
	}
}

func writeFour(ctx context.Context, t *testing.T, s memory.Store) {
	t.Helper()
	rows := []memory.WriteInput{
		{Kind: memory.KindEpisodic, Content: "incident 42 deploy failed", Branch: "main", Taint: []memory.Taint{memory.TaintIncidentDerived}},
		{Kind: memory.KindSemantic, Content: "shopping cart term means basket of items", Branch: "main"},
		{Kind: memory.KindProcedural, Content: "grill with docs gesture sharpens intention", Branch: "main"},
		{Kind: memory.KindStructural, Content: "context map dependency graph", Branch: "main"},
	}
	for _, r := range rows {
		if _, err := s.Write(ctx, r); err != nil {
			t.Fatalf("write four: %v", err)
		}
	}
}

package memory

import "context"

// MockStore is the in-memory, deterministic Store backend (ADR 0025). It keeps an APPEND-ONLY
// slice of MemoryItems and recalls via the SHARED pure rankHits core (exact cosine over the
// injected Embedder). It needs no Postgres and no model, so the write-then-recall fixture and the
// rapid property run against it without a container — and it is observationally equivalent to
// PgxStore on recall ordering for the fixture vectors.
//
// APPEND-ONLY: Write appends a row. Re-writing the SAME body is idempotent (same content hash ⇒
// the row is already present, count unchanged); a CHANGED body is a NEW row (count increments). No
// method ever edits or deletes a row — supersession is a new row, expiry is ExpiresAt.
type MockStore struct {
	emb   Embedder
	items []MemoryItem
	byID  map[string]MemoryItem
}

// NewMockStore builds a deterministic in-memory store with the injected Embedder (constructor
// injection, no global).
func NewMockStore(emb Embedder) *MockStore {
	return &MockStore{emb: emb, byID: map[string]MemoryItem{}}
}

// Write appends a content-addressed MemoryItem and returns its id. Idempotent on the same body;
// append-only on a changed body. The provenance records the embedder name (model-swap audit).
func (s *MockStore) Write(_ context.Context, in WriteInput) (string, error) {
	item, err := itemFromInput(in)
	if err != nil {
		return "", err
	}
	if _, seen := s.byID[item.ID]; seen {
		return item.ID, nil // idempotent: same body, same address, no new row
	}
	s.items = append(s.items, item)
	s.byID[item.ID] = item
	return item.ID, nil
}

// Recall returns at most q.K hits ordered by score descending, honouring the kind/branch filters.
// It reads only the in-memory items — never the truth schemas.
func (s *MockStore) Recall(_ context.Context, q RecallQuery) ([]Hit, error) {
	return rankHits(s.emb, q, s.items), nil
}

// Get reads a MemoryItem by id. Returns ErrNotFound if absent.
func (s *MockStore) Get(_ context.Context, id string) (MemoryItem, error) {
	item, ok := s.byID[id]
	if !ok {
		return MemoryItem{}, ErrNotFound
	}
	return item, nil
}

// Count returns the number of stored rows (test helper proving append-only behaviour).
func (s *MockStore) Count() int { return len(s.items) }

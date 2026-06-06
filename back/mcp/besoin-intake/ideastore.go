package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
)

// ideaStore is the EL05 emission door: the besoin-intake server reuses the `ideas.idea` table (the
// legal capture door, idea_capture provenance human) to persist the Ideas a MAPPING rung emits. It
// carries ONLY the ideas-schema reuse grant — NEVER a kernel grant. It is the SAME shape the
// idea-intake MCP (S27) uses, so an emitted Idea round-trips through the standard triage queue.
//
// DETERMINISM-FIRST: the id is the content-hash of the idea sketch (ideas.Capture). Re-emitting the
// identical sketch lands on the SAME id (ON CONFLICT DO NOTHING) — idempotent, append-only.
type ideaStore struct {
	pool *pgxpool.Pool
}

func newIdeaStore(ctx context.Context, dsn string) (*ideaStore, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("besoin-intake: open idea store: %w", err)
	}
	return &ideaStore{pool: pool}, nil
}

func newIdeaStoreFromPool(pool *pgxpool.Pool) *ideaStore { return &ideaStore{pool: pool} }

func (s *ideaStore) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// persistedIdea is the JSONB written to ideas.idea — the SAME shape the idea-intake MCP uses (S27).
type persistedIdea struct {
	Proposes   ideas.Proposes   `json:"proposes"`
	Intent     string           `json:"intent"`
	Provenance ideas.Provenance `json:"provenance"`
	Status     ideas.Status     `json:"status"`
}

// Insert persists an emitted Idea (capture above the wall). The id is the content hash of the sketch,
// so re-emitting the same need-rung Idea is a NO-OP (ON CONFLICT DO NOTHING) — never a duplicate.
func (s *ideaStore) Insert(ctx context.Context, i ideas.Idea) error {
	body, err := json.Marshal(persistedIdea{
		Proposes: i.Proposes, Intent: i.Intent, Provenance: i.Provenance, Status: i.Status,
	})
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version) VALUES ($1, $2::jsonb, $3) ON CONFLICT (id) DO NOTHING",
		i.ID, string(body), i.ID)
	return err
}

// Count returns how many Ideas are staged (the triage queue depth). Used by the mirror to assert a
// NoEmit rung captured NONE and a MAPPING rung captured exactly one.
func (s *ideaStore) Count(ctx context.Context) (int, error) {
	n := 0
	err := s.pool.QueryRow(ctx, "SELECT count(*) FROM ideas.idea").Scan(&n)
	return n, err
}

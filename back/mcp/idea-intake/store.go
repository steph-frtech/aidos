package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
)

// Store is the idea-intake persistence over the `ideas.idea` table (staging ABOVE
// the wall, CLAUDE.md §2). It carries the lifecycle-grant DSN (INSERT/SELECT/UPDATE
// — never DELETE; a rejected idea is kept). It NEVER touches kernel/mirrors. The
// lifecycle DECISIONS are the pure ideas.* functions; this Store only persists an
// already-decided transition (determinism-first: the algorithm wins, the store
// defers).
type Store struct {
	pool *pgxpool.Pool
}

// NewStore opens the idea-intake store against a DSN. The DSN is the role with the
// ideas-schema lifecycle grant.
func NewStore(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("idea-intake: open: %w", err)
	}
	return &Store{pool: pool}, nil
}

// NewStoreFromPool wraps an existing pool (used by the test harness).
func NewStoreFromPool(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Close releases the pool.
func (s *Store) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// persistedBody is the JSONB written to ideas.idea: the canonical sketch plus the
// lifecycle status and (when rejected) the traced reason. The id stays the hash of
// the sketch — status is metadata, not identity.
type persistedBody struct {
	Proposes     ideas.Proposes   `json:"proposes"`
	Intent       string           `json:"intent"`
	Provenance   ideas.Provenance `json:"provenance"`
	Status       ideas.Status     `json:"status"`
	RejectReason string           `json:"reject_reason,omitempty"`
}

func toBody(i ideas.Idea) ([]byte, error) {
	return json.Marshal(persistedBody{
		Proposes:     i.Proposes,
		Intent:       i.Intent,
		Provenance:   i.Provenance,
		Status:       i.Status,
		RejectReason: i.RejectReason,
	})
}

func fromRow(id string, body []byte) (ideas.Idea, error) {
	var pb persistedBody
	if err := json.Unmarshal(body, &pb); err != nil {
		return ideas.Idea{}, fmt.Errorf("idea-intake: decode row: %w", err)
	}
	return ideas.Idea{
		ID:           id,
		Proposes:     pb.Proposes,
		Intent:       pb.Intent,
		Provenance:   pb.Provenance,
		Status:       pb.Status,
		RejectReason: pb.RejectReason,
	}, nil
}

// Insert persists a freshly captured idea (INSERT — capture above the wall).
func (s *Store) Insert(ctx context.Context, i ideas.Idea) error {
	body, err := toBody(i)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version) VALUES ($1, $2::jsonb, $3)",
		i.ID, string(body), i.ID)
	return err
}

// Update persists an advanced idea (UPDATE — advance status / trace reject). The id
// is unchanged (the sketch is the same); only the body's status/reason move.
func (s *Store) Update(ctx context.Context, i ideas.Idea) error {
	body, err := toBody(i)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		"UPDATE ideas.idea SET body = $2::jsonb WHERE id = $1", i.ID, string(body))
	return err
}

// Get reads one idea by id.
func (s *Store) Get(ctx context.Context, id string) (ideas.Idea, error) {
	var body []byte
	err := s.pool.QueryRow(ctx, "SELECT body FROM ideas.idea WHERE id = $1", id).Scan(&body)
	if err != nil {
		if err == pgx.ErrNoRows {
			return ideas.Idea{}, fmt.Errorf("idea-intake: idea %q not found", id)
		}
		return ideas.Idea{}, err
	}
	return fromRow(id, body)
}

// List reads all ideas, optionally filtered by status. Ordered by id for a stable,
// deterministic listing.
func (s *Store) List(ctx context.Context, status string) ([]ideas.Idea, error) {
	q := "SELECT id, body FROM ideas.idea"
	args := []any{}
	if status != "" {
		q += " WHERE body->>'status' = $1"
		args = append(args, status)
	}
	q += " ORDER BY id"
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ideas.Idea
	for rows.Next() {
		var id string
		var body []byte
		if err := rows.Scan(&id, &body); err != nil {
			return nil, err
		}
		i, err := fromRow(id, body)
		if err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

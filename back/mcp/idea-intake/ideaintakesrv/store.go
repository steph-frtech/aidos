package ideaintakesrv

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

// Insert persists a freshly captured idea (INSERT — capture above the wall). The id is the content
// hash of the sketch, so capturing the SAME sketch twice (e.g. re-ingesting the same document
// through MK03's idempotent door) is a NO-OP, not a duplicate-key error: ON CONFLICT DO NOTHING
// keeps the first capture untouched (append-only — never overwrites a staged idea, never deletes).
func (s *Store) Insert(ctx context.Context, i ideas.Idea) error {
	return s.InsertScoped(ctx, i, "")
}

// InsertScoped persists a freshly captured idea SCOPED TO A PROJECT (S64). When projectID is empty
// the row falls back to the table DEFAULT (the __system__ seed, S54), so old callers keep working;
// when set, the idea joins that project's inbox. The id stays the content hash of the SKETCH —
// project_id is a SCOPE column, never part of identity (CLAUDE.md §2 / S54). Append-only:
// ON CONFLICT DO NOTHING keeps the first staged row untouched, never overwrites, never deletes.
func (s *Store) InsertScoped(ctx context.Context, i ideas.Idea, projectID string) error {
	body, err := toBody(i)
	if err != nil {
		return err
	}
	if projectID == "" {
		_, err = s.pool.Exec(ctx,
			"INSERT INTO ideas.idea (id, body, version) VALUES ($1, $2::jsonb, $3) ON CONFLICT (id) DO NOTHING",
			i.ID, string(body), i.ID)
		return err
	}
	_, err = s.pool.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version, project_id) VALUES ($1, $2::jsonb, $3, $4) ON CONFLICT (id) DO NOTHING",
		i.ID, string(body), i.ID, projectID)
	return err
}

// ScopedIdea pairs an idea with the project it is scoped to (S64) — what the per-project inbox lists.
type ScopedIdea struct {
	Idea      ideas.Idea
	ProjectID string
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
// deterministic listing. Unscoped — the per-project inbox uses ListScoped (S64).
func (s *Store) List(ctx context.Context, status string) ([]ideas.Idea, error) {
	scoped, err := s.ListScoped(ctx, status, "")
	if err != nil {
		return nil, err
	}
	out := make([]ideas.Idea, len(scoped))
	for i, sc := range scoped {
		out[i] = sc.Idea
	}
	return out, nil
}

// ListScoped reads ideas of ONE project (S64 inbox), optionally filtered by status. An empty
// projectID lists every project (the global triage queue, back-compat). Ordered by id for a stable,
// deterministic listing (determinism-first: same rows → same order). Each row carries its scope so
// the inbox can prove "this idea belongs to the active project".
func (s *Store) ListScoped(ctx context.Context, status, projectID string) ([]ScopedIdea, error) {
	q := "SELECT id, body, project_id FROM ideas.idea"
	args := []any{}
	conds := []string{}
	if status != "" {
		args = append(args, status)
		conds = append(conds, fmt.Sprintf("body->>'status' = $%d", len(args)))
	}
	if projectID != "" {
		args = append(args, projectID)
		conds = append(conds, fmt.Sprintf("project_id = $%d", len(args)))
	}
	for n, c := range conds {
		if n == 0 {
			q += " WHERE " + c
		} else {
			q += " AND " + c
		}
	}
	q += " ORDER BY id"
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ScopedIdea
	for rows.Next() {
		var id, proj string
		var body []byte
		if err := rows.Scan(&id, &body, &proj); err != nil {
			return nil, err
		}
		i, err := fromRow(id, body)
		if err != nil {
			return nil, err
		}
		out = append(out, ScopedIdea{Idea: i, ProjectID: proj})
	}
	return out, rows.Err()
}

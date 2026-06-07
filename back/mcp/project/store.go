package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/project"
)

// Store is the project persistence over the `projects.project` + `projects.dag_root`
// tables (BELOW the wall, CLAUDE.md §2 — projects is not kernel/mirrors/fitness). It
// carries the below-the-line grant (INSERT/SELECT/UPDATE — never DELETE; soft delete
// only, append-only). The project DECISIONS are the pure project.* functions; this
// Store only persists an already-decided, content-addressed row (determinism-first:
// the algorithm wins, the store defers). It NEVER touches kernel/mirrors.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore opens the project store against a DSN.
func NewStore(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("project: open: %w", err)
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

func toBody(p project.Project) ([]byte, error) {
	return p.CanonicalBody()
}

func fromRow(id string, body []byte) (project.Project, error) {
	var b struct {
		Slug      string            `json:"slug"`
		Name      string            `json:"name"`
		OwnerRef  string            `json:"owner_ref"`
		CreatedAt string            `json:"created_at"`
		Lifecycle project.Lifecycle `json:"lifecycle"`
	}
	if err := json.Unmarshal(body, &b); err != nil {
		return project.Project{}, fmt.Errorf("project: decode row: %w", err)
	}
	return project.Project{
		ID:        id,
		Slug:      b.Slug,
		Name:      b.Name,
		OwnerRef:  b.OwnerRef,
		CreatedAt: b.CreatedAt,
		Lifecycle: b.Lifecycle,
		Version:   id,
	}, nil
}

// Heads reads the current HEAD rows (superseded_by IS NULL) — the live projects.
// Ordered by id for a stable, deterministic listing. Used to build the pure
// uniqueness Registry before a create.
func (s *Store) Heads(ctx context.Context) ([]project.Project, error) {
	rows, err := s.pool.Query(ctx,
		"SELECT id, body FROM projects.project WHERE superseded_by IS NULL ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []project.Project
	for rows.Next() {
		var id string
		var body []byte
		if err := rows.Scan(&id, &body); err != nil {
			return nil, err
		}
		p, err := fromRow(id, body)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Insert persists a freshly created project AND its per-project DAG root in one
// transaction (the genesis node, S53). Idempotent on the project id (re-creating an
// identical project is a NO-OP, append-only — never overwrites). The DAG root row
// is also ON CONFLICT DO NOTHING (one root per project).
func (s *Store) Insert(ctx context.Context, p project.Project) error {
	body, err := toBody(p)
	if err != nil {
		return err
	}
	root := project.RootNode(p)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx,
		"INSERT INTO projects.project (id, body, version) VALUES ($1, $2::jsonb, $3) ON CONFLICT (id) DO NOTHING",
		p.ID, string(body), p.ID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		"INSERT INTO projects.dag_root (project_id, node_id, label) VALUES ($1, $2, $3) ON CONFLICT (project_id) DO NOTHING",
		p.ID, root.ID, root.Label); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Supersede appends a NEW lifecycle row (append-only) and closes the prior head's
// superseded_by to the new id — the head moves, nothing is destroyed. Used by
// archive/restore/softDelete. The new DAG root (if any) stays the original project's.
func (s *Store) Supersede(ctx context.Context, prior, next project.Project) error {
	body, err := toBody(next)
	if err != nil {
		return err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx,
		"INSERT INTO projects.project (id, body, version) VALUES ($1, $2::jsonb, $3) ON CONFLICT (id) DO NOTHING",
		next.ID, string(body), next.ID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		"UPDATE projects.project SET superseded_by = $2 WHERE id = $1", prior.ID, next.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Get reads one project HEAD by id.
func (s *Store) Get(ctx context.Context, id string) (project.Project, error) {
	var body []byte
	err := s.pool.QueryRow(ctx, "SELECT body FROM projects.project WHERE id = $1", id).Scan(&body)
	if err != nil {
		if err == pgx.ErrNoRows {
			return project.Project{}, fmt.Errorf("project: %q not found", id)
		}
		return project.Project{}, err
	}
	return fromRow(id, body)
}

package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/besoin"
)

// Store is the besoin-intake persistence over the `besoin.node` table (a NEED store ABOVE the wall,
// CLAUDE.md §2 — DISTINCT from the truth-store, not an exception). It carries the besoin-schema grant
// (INSERT/SELECT/UPDATE — never DELETE; the need graph is append-only) and reuses the ideas grant for
// the Ideas the mapping rungs emit (EL05). It NEVER touches kernel/mirrors/fitness (no grant exists).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the BesoinGraph build + the routing DECISIONS are the pure
// besoin.* functions; this Store only persists an already-decided, already-hashed graph. The id of a
// captured row is the BesoinGraph graph_hash (records.Hash(Canonicalize)) — content-addressed, so a
// re-capture of the identical graph is a NO-OP (ON CONFLICT DO NOTHING), append-only, never overwrites.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore opens the besoin-intake store against a DSN. The DSN is the role with the besoin-schema
// grant (and the ideas-schema reuse grant). The session is scoped to `project` via the RLS GUC.
func NewStore(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("besoin-intake: open: %w", err)
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

// scoped runs fn inside a transaction whose session GUC `aidos.project` is set to project — the RLS
// key (S55 forward dependency, modelled in the EL15 migration). A query on this connection sees ONLY
// rows of `project` (project A's graph is invisible to a B-scoped session). The GUC is LOCAL to the
// transaction so it never leaks to the next checkout from the pool. Determinism: no clock/rng.
func (s *Store) scoped(ctx context.Context, project string, fn func(pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// set_config(..., true) → LOCAL to this transaction; the RLS policy reads current_setting('aidos.project').
	if _, err := tx.Exec(ctx, "SELECT set_config('aidos.project', $1, true)", project); err != nil {
		return fmt.Errorf("besoin-intake: scope project: %w", err)
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// AppendGraph persists a captured BesoinGraph as an append-only row, content-addressed by its
// graph_hash. The level names the rung the turn was about. Re-appending the identical graph is a
// NO-OP (ON CONFLICT DO NOTHING) — idempotent, never a duplicate-key error, never an overwrite. The
// graph is canonicalized + hashed HERE so the id is the SAME address the pure package computes.
func (s *Store) AppendGraph(ctx context.Context, g besoin.BesoinGraph, level besoin.Level) (string, error) {
	body, err := g.Canonicalize()
	if err != nil {
		return "", fmt.Errorf("besoin-intake: canonicalize: %w", err)
	}
	id := records.Hash(body)
	err = s.scoped(ctx, g.Project, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx,
			"INSERT INTO besoin.node (id, project, level, body) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (id) DO NOTHING",
			id, g.Project, string(level), string(body))
		return e
	})
	if err != nil {
		return "", err
	}
	return id, nil
}

// LoadGraph reads the CURRENT BesoinGraph of a project — the most recently captured row. ok=false when
// the project has no captured node yet (a fresh project: the caller starts from NewGraph). Project
// isolation is enforced by the RLS GUC: a B-scoped session never sees A's rows. Determinism: ordered
// by created_at DESC then id so the read is stable for a fixed row set.
func (s *Store) LoadGraph(ctx context.Context, project string) (besoin.BesoinGraph, bool, error) {
	var body []byte
	found := false
	err := s.scoped(ctx, project, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx,
			"SELECT body FROM besoin.node WHERE project = $1 ORDER BY created_at DESC, id DESC LIMIT 1", project)
		e := row.Scan(&body)
		if e == pgx.ErrNoRows {
			return nil
		}
		if e != nil {
			return e
		}
		found = true
		return nil
	})
	if err != nil {
		return besoin.BesoinGraph{}, false, err
	}
	if !found {
		return besoin.NewGraph(project), false, nil
	}
	g, err := besoin.Unmarshal(body)
	if err != nil {
		return besoin.BesoinGraph{}, false, fmt.Errorf("besoin-intake: decode graph: %w", err)
	}
	return g, true, nil
}

// CountNodes returns how many append-only rows a project has captured (the history depth). Used by the
// state tool to surface the append-only row count. RLS-scoped to the project.
func (s *Store) CountNodes(ctx context.Context, project string) (int, error) {
	n := 0
	err := s.scoped(ctx, project, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "SELECT count(*) FROM besoin.node WHERE project = $1", project).Scan(&n)
	})
	return n, err
}

// CanWriteKernel probes whether this role can write the kernel (it must NOT — the wall). It attempts a
// kernel write and reports whether it SUCCEEDED. The mirror asserts this is ALWAYS false (WroteKernel
// stays false): the agent role carries no kernel grant. The probe is rolled back regardless.
func (s *Store) CanWriteKernel(ctx context.Context) bool {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false
	}
	defer func() { _ = tx.Rollback(ctx) }()
	_, err = tx.Exec(ctx,
		"INSERT INTO kernel.truth (id, body, version) VALUES ('besoin-intake-probe', '{}'::jsonb, 'v0')")
	return err == nil
}

package changeset

// store.go — the persistence adapter for the ChangeSet envelope, writing through the `aidos` writer
// role (the MCP server carries that DSN; the agent role is SELECT-only — the wall). The envelope
// BODY (the atomic spec+mirror pair, content-addressed) goes to the S02 changesets.changeset table;
// the LIFECYCLE STAMP (status, applied_at, reverts) goes to the S20 changesets.changeset_lifecycle
// side table, APPEND-ONLY (a status change is a NEW version row, never an in-place edit — an APPLIED
// envelope is IMMUTABLE).
//
// This adapter does I/O; the DECISION (whether a commit/edit/revert is admitted) stays in the pure
// functions (Open/Apply/Edit/Revert/Discard/StampReverted). The adapter only persists an already-
// decided transition — it never re-implements the gate.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when an envelope id is absent.
var ErrNotFound = errors.New("changeset: not found")

// Store persists ChangeSet envelopes through the writer role.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore opens a pool to the given DSN (the `aidos` writer DSN in the MCP server).
func NewStore(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("changeset: open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("changeset: ping: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close releases the pool.
func (s *Store) Close() { s.pool.Close() }

// nextVersion returns the next lifecycle version label for an id (v1, v2, …). Append-only: each
// stamp is a new version row, the head being the highest version.
func (s *Store) nextVersion(ctx context.Context, tx pgx.Tx, id string) (string, int, error) {
	var n int
	if err := tx.QueryRow(ctx,
		`SELECT count(*) FROM changesets.changeset_lifecycle WHERE id = $1`, id).Scan(&n); err != nil {
		return "", 0, err
	}
	return fmt.Sprintf("v%d", n+1), n + 1, nil
}

// Persist writes a DRAFT envelope: its content-addressed body to changesets.changeset (idempotent)
// and its first DRAFT lifecycle row. The body and the stamp are written in ONE transaction so spec
// and mirror can never be stored apart.
func (s *Store) Persist(ctx context.Context, cs ChangeSet) error {
	body, err := cs.CanonicalBody()
	if err != nil {
		return err
	}
	return withTx(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`INSERT INTO changesets.changeset (id, body, version) VALUES ($1, $2::jsonb, $1)
			 ON CONFLICT (id) DO NOTHING`, cs.ID, string(body)); err != nil {
			return fmt.Errorf("changeset: persist body: %w", err)
		}
		ver, _, err := s.nextVersion(ctx, tx, cs.ID)
		if err != nil {
			return err
		}
		if err := insertLifecycle(ctx, tx, cs, ver); err != nil {
			return err
		}
		return nil
	})
}

// Stamp appends a new lifecycle row for an envelope's transition (DRAFT→APPLIED, APPLIED→REVERTED).
// Append-only: it INSERTs a new version, never UPDATEs (an APPLIED envelope is immutable). The body
// is never touched — only the stamp moves.
func (s *Store) Stamp(ctx context.Context, cs ChangeSet) error {
	return withTx(ctx, s.pool, func(tx pgx.Tx) error {
		ver, _, err := s.nextVersion(ctx, tx, cs.ID)
		if err != nil {
			return err
		}
		return insertLifecycle(ctx, tx, cs, ver)
	})
}

func insertLifecycle(ctx context.Context, tx pgx.Tx, cs ChangeSet, version string) error {
	var revertsArg, parentArg interface{}
	if cs.Reverts != "" {
		revertsArg = cs.Reverts
	}
	if cs.ParentPhase != "" {
		parentArg = cs.ParentPhase
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO changesets.changeset_lifecycle (id, status, parent_phase, reverts, applied_at, version)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		cs.ID, string(cs.Status), parentArg, revertsArg, cs.AppliedAt, version); err != nil {
		return fmt.Errorf("changeset: stamp lifecycle: %w", err)
	}
	return nil
}

// Discarded removes a DRAFT envelope's body + its lifecycle rows (a hard-errored DRAFT is removed,
// never marked FAILED). It is the one delete the model permits, and only for a DRAFT — the caller
// (the MCP server) checks Discard(cs) first. An APPLIED/REVERTED envelope is append-only, never
// deleted.
func (s *Store) Discarded(ctx context.Context, id string) error {
	return withTx(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM changesets.changeset_lifecycle WHERE id = $1`, id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM changesets.changeset WHERE id = $1`, id); err != nil {
			return err
		}
		return nil
	})
}

// EnvelopeRow is the read-model surfaced by the changesets.changeset_envelope view.
type EnvelopeRow struct {
	ID          string          `json:"id"`
	Label       string          `json:"label"`
	Status      string          `json:"status"`
	ParentPhase string          `json:"parent_phase"`
	SpecDelta   json.RawMessage `json:"spec_delta"`
	MirrorDelta json.RawMessage `json:"mirror_delta"`
	Reverts     string          `json:"reverts"`
}

// Get reads the head envelope (latest lifecycle stamp) for an id via the view. ErrNotFound if absent.
func (s *Store) Get(ctx context.Context, id string) (EnvelopeRow, error) {
	var r EnvelopeRow
	var status, parent, reverts *string
	err := s.pool.QueryRow(ctx,
		`SELECT id, label, status, parent_phase, spec_delta, mirror_delta, reverts
		 FROM changesets.changeset_envelope
		 WHERE id = $1
		 ORDER BY length(lifecycle_version) DESC, lifecycle_version DESC
		 LIMIT 1`, id).
		Scan(&r.ID, &r.Label, &status, &parent, &r.SpecDelta, &r.MirrorDelta, &reverts)
	if errors.Is(err, pgx.ErrNoRows) {
		return EnvelopeRow{}, ErrNotFound
	}
	if err != nil {
		return EnvelopeRow{}, fmt.Errorf("changeset: get: %w", err)
	}
	r.Status = derefStr(status)
	r.ParentPhase = derefStr(parent)
	r.Reverts = derefStr(reverts)
	return r, nil
}

// List returns up to 100 envelopes (latest stamp per id), newest first.
func (s *Store) List(ctx context.Context) ([]EnvelopeRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT ON (id) id, label, status, parent_phase, spec_delta, mirror_delta, reverts
		 FROM changesets.changeset_envelope
		 ORDER BY id, length(lifecycle_version) DESC, lifecycle_version DESC
		 LIMIT 100`)
	if err != nil {
		return nil, fmt.Errorf("changeset: list: %w", err)
	}
	defer rows.Close()
	var out []EnvelopeRow
	for rows.Next() {
		var r EnvelopeRow
		var status, parent, reverts *string
		if err := rows.Scan(&r.ID, &r.Label, &status, &parent, &r.SpecDelta, &r.MirrorDelta, &reverts); err != nil {
			return nil, err
		}
		r.Status = derefStr(status)
		r.ParentPhase = derefStr(parent)
		r.Reverts = derefStr(reverts)
		out = append(out, r)
	}
	return out, rows.Err()
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func withTx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}

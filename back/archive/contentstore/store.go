// Package contentstore implements the Archive content-addressed append-only store.
// Objects are stored by SHA-256 hash (hex). Puts are idempotent; edits produce
// new hashes. The head pointer is mutable; content and history are append-only.
package contentstore

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	archivegen "github.com/steph-frtech/aidos/back/gen/archive"
)

// ErrNotFound is returned when a hash or head key is absent.
var ErrNotFound = errors.New("contentstore: not found")

// HeadMove is one entry in the head history, oldest-first.
type HeadMove struct {
	Key        string
	Hash       string
	ParentHash *string // nil for the first move on a key
}

// Store is a content-addressed append-only object store backed by Postgres.
type Store struct {
	pool    *pgxpool.Pool
	queries *archivegen.Queries
}

// New opens a connection pool to the given DSN and returns a ready Store.
func New(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("contentstore: open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("contentstore: ping: %w", err)
	}
	return &Store{
		pool:    pool,
		queries: archivegen.New(pool),
	}, nil
}

// Close releases the connection pool.
func (s *Store) Close() { s.pool.Close() }

// Hash returns the canonical SHA-256 hex digest of b.
func Hash(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Put stores b under its content hash and returns that hash.
// Calling Put twice with the same bytes is idempotent: one row, same hash.
func (s *Store) Put(ctx context.Context, b []byte) (string, error) {
	h := Hash(b)
	if err := s.queries.InsertContent(ctx, archivegen.InsertContentParams{
		Hash: h,
		Data: b,
	}); err != nil {
		return "", fmt.Errorf("contentstore: put: %w", err)
	}
	return h, nil
}

// Get retrieves the bytes stored at hash. Returns ErrNotFound if absent.
func (s *Store) Get(ctx context.Context, hash string) ([]byte, error) {
	data, err := s.queries.GetContent(ctx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("contentstore: get: %w", err)
	}
	return data, nil
}

// SetHead atomically sets the head key to hash and appends a history row.
// The previous head hash becomes the parent_hash in history (nil for first set).
func (s *Store) SetHead(ctx context.Context, key, hash string) error {
	return withTx(ctx, s.pool, func(tx pgx.Tx) error {
		q := archivegen.New(tx)

		// Read previous head (may not exist).
		var parentHash *string
		prev, err := q.GetHead(ctx, key)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("contentstore: set_head get prior: %w", err)
		}
		if err == nil {
			parentHash = &prev
		}

		// Upsert head pointer.
		if err := q.UpsertHead(ctx, archivegen.UpsertHeadParams{Key: key, Hash: hash}); err != nil {
			return fmt.Errorf("contentstore: set_head upsert: %w", err)
		}

		// Append history row.
		if err := q.InsertHistory(ctx, archivegen.InsertHistoryParams{
			Key:        key,
			Hash:       hash,
			ParentHash: parentHash,
		}); err != nil {
			return fmt.Errorf("contentstore: set_head history: %w", err)
		}
		return nil
	})
}

// GetHead returns the current hash for the given head key. ErrNotFound if absent.
func (s *Store) GetHead(ctx context.Context, key string) (string, error) {
	hash, err := s.queries.GetHead(ctx, key)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("contentstore: get_head: %w", err)
	}
	return hash, nil
}

// History returns the head moves for key, oldest-first. Returns ErrNotFound if
// there are no moves recorded (key never set).
func (s *Store) History(ctx context.Context, key string) ([]HeadMove, error) {
	rows, err := s.queries.GetHistory(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("contentstore: history: %w", err)
	}
	if len(rows) == 0 {
		return nil, ErrNotFound
	}
	moves := make([]HeadMove, len(rows))
	for i, r := range rows {
		moves[i] = HeadMove{Key: r.Key, Hash: r.Hash, ParentHash: r.ParentHash}
	}
	return moves, nil
}

// ListContent returns up to 100 content rows (hash, size) newest-first.
func (s *Store) ListContent(ctx context.Context) ([]archivegen.ListContentRow, error) {
	return s.queries.ListContent(ctx)
}

// ListHeads returns up to 100 head pointers.
func (s *Store) ListHeads(ctx context.Context) ([]archivegen.ArchiveHead, error) {
	return s.queries.ListHeads(ctx)
}

// withTx runs fn inside a transaction, rolling back on error.
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

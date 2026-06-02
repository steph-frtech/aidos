package memory

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PgxStore is the REAL Store backend (ADR 0025): brain.memory_item over pgvector via pgx, HNSW
// cosine ANN. It is interchangeable with MockStore behind the Store interface — the
// write-then-recall fixture passes identically against both (the "both backends injectable" done
// criterion).
//
// THE WALL + APPEND-ONLY (CLAUDE.md §2): the agent role holds SELECT + INSERT on brain.memory_item
// only — no UPDATE/DELETE. Write is an INSERT (idempotent on the content hash via ON CONFLICT DO
// NOTHING — a re-write of the same body is the same row; a changed body is a new row). Recall is a
// SELECT ordered by the cosine operator. Neither ever touches the kernel/mirrors/fitness schemas.
//
// The embedding is passed as a pgvector text literal ("[v1,v2,...]") cast to vector — no external
// vector codec dependency; pgx + the `vector` type handle the cast. The recall SQL pushes the
// kind/branch filters into the WHERE clause (ADR 0025) so the ordering matches MockStore.
type PgxStore struct {
	pool *pgxpool.Pool
	emb  Embedder
}

// NewPgxStore builds the real store over the given pool with the injected Embedder (constructor
// injection, no global).
func NewPgxStore(pool *pgxpool.Pool, emb Embedder) *PgxStore {
	return &PgxStore{pool: pool, emb: emb}
}

// vectorLiteral renders a float32 slice as a pgvector text literal "[a,b,c]".
func vectorLiteral(vec []float32) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, v := range vec {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(float64(v), 'g', -1, 32))
	}
	b.WriteByte(']')
	return b.String()
}

// Write inserts a content-addressed MemoryItem and returns its id. Idempotent on the same body
// (ON CONFLICT (id) DO NOTHING — the content hash is the PK); append-only on a changed body. The
// body JSONB carries the S30 brain.memory_item shape (kind discriminator "memory_item",
// no-mirror/no-version) so the S30 CHECK constraints hold; the indexable columns carry the recall
// keys + embedding.
func (s *PgxStore) Write(ctx context.Context, in WriteInput) (string, error) {
	item, err := itemFromInput(in)
	if err != nil {
		return "", err
	}
	body, err := item.CanonicalBody()
	if err != nil {
		return "", err
	}
	taint := make([]string, len(item.Taint))
	for i, t := range item.Taint {
		taint[i] = string(t)
	}
	var expires any
	if item.ExpiresAt != "" {
		expires = item.ExpiresAt
	}
	var scope any
	if item.ValidityScope != "" {
		scope = item.ValidityScope
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO brain.memory_item
		    (id, body, branch, created_at, kind, content, embedding, provenance,
		     validity_scope, expires_at, confidence, taint)
		VALUES ($1, $2, $3, now(), $4, $5, $6::vector, $7, $8, $9, $10, $11)
		ON CONFLICT (id) DO NOTHING`,
		item.ID, body, item.Branch, string(item.Kind), item.Content,
		vectorLiteral(s.emb.Embed(item.Content)), item.Provenance,
		scope, expires, item.Confidence, taint,
	)
	if err != nil {
		return "", fmt.Errorf("memory: pgx write: %w", err)
	}
	return item.ID, nil
}

// Recall returns at most q.K hits ordered by cosine similarity descending, honouring the optional
// kind/branch filters (pushed into the WHERE clause). Score = 1 - cosine_distance (the `<=>`
// operator). Reads brain.memory_item only.
func (s *PgxStore) Recall(ctx context.Context, q RecallQuery) ([]Hit, error) {
	k := q.K
	if k < 0 {
		k = 0
	}
	args := []any{vectorLiteral(s.emb.Embed(q.QueryText))}
	where := []string{}
	if q.Kind != "" {
		args = append(args, string(q.Kind))
		where = append(where, fmt.Sprintf("kind = $%d", len(args)))
	}
	if q.Branch != "" {
		args = append(args, q.Branch)
		where = append(where, fmt.Sprintf("branch = $%d", len(args)))
	}
	whereSQL := ""
	if len(where) > 0 {
		whereSQL = "WHERE " + strings.Join(where, " AND ")
	}
	args = append(args, k)
	query := fmt.Sprintf(`
		SELECT id, kind, content, provenance, validity_scope, expires_at, confidence, taint, branch,
		       1 - (embedding <=> $1::vector) AS score
		FROM brain.memory_item
		%s
		ORDER BY score DESC, id ASC
		LIMIT $%d`, whereSQL, len(args))

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("memory: pgx recall: %w", err)
	}
	defer rows.Close()

	var hits []Hit
	for rows.Next() {
		var (
			it      MemoryItem
			kind    string
			scope   *string
			expires *string
			taint   []string
			score   float64
		)
		if err := rows.Scan(&it.ID, &kind, &it.Content, &it.Provenance, &scope, &expires,
			&it.Confidence, &taint, &it.Branch, &score); err != nil {
			return nil, fmt.Errorf("memory: pgx recall scan: %w", err)
		}
		it.Kind = Kind(kind)
		if scope != nil {
			it.ValidityScope = *scope
		}
		if expires != nil {
			it.ExpiresAt = *expires
		}
		it.Taint = make([]Taint, len(taint))
		for i, t := range taint {
			it.Taint[i] = Taint(t)
		}
		hits = append(hits, Hit{Item: it, Score: score})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("memory: pgx recall rows: %w", err)
	}
	return hits, nil
}

// Get reads a MemoryItem by id. Returns ErrNotFound if absent.
func (s *PgxStore) Get(ctx context.Context, id string) (MemoryItem, error) {
	var (
		it      MemoryItem
		kind    string
		scope   *string
		expires *string
		taint   []string
	)
	err := s.pool.QueryRow(ctx, `
		SELECT id, kind, content, provenance, validity_scope, expires_at, confidence, taint, branch
		FROM brain.memory_item WHERE id = $1`, id).
		Scan(&it.ID, &kind, &it.Content, &it.Provenance, &scope, &expires, &it.Confidence, &taint, &it.Branch)
	if errors.Is(err, pgx.ErrNoRows) {
		return MemoryItem{}, ErrNotFound
	}
	if err != nil {
		return MemoryItem{}, fmt.Errorf("memory: pgx get: %w", err)
	}
	it.Kind = Kind(kind)
	if scope != nil {
		it.ValidityScope = *scope
	}
	if expires != nil {
		it.ExpiresAt = *expires
	}
	it.Taint = make([]Taint, len(taint))
	for i, t := range taint {
		it.Taint[i] = Taint(t)
	}
	return it, nil
}

// Count returns the number of stored rows (test helper proving append-only behaviour).
func (s *PgxStore) Count(ctx context.Context) (int, error) {
	var n int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM brain.memory_item`).Scan(&n); err != nil {
		return 0, fmt.Errorf("memory: pgx count: %w", err)
	}
	return n, nil
}

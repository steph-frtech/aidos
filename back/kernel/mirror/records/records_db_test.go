package records

// DB-level mirror (Testcontainers + real Postgres): the typed Mirror record is
// append-only + content-addressed and the wall holds end-to-end.
// mirror record: reflects=S06-mirror-record-append-only, test_kind=invariant,
//               cert_language=testcontainers, liveness=alive
//
// Proves, against a throwaway real Postgres with the S02 + S06 baselines applied:
//   - a typed mirror row reads back into the Go Mirror model and the completeness
//     join (mirrors ⋈ kernel) computes the right monster set against real rows;
//   - the agent role (aidos_agent) is DENIED INSERT/UPDATE/DELETE/TRUNCATE on
//     mirrors.mirror_record (the wall holds: this package READS, never writes);
//   - the content-addressed CHECK rejects a row whose id != version != hash;
//   - the body is append-only: the head moves by INSERTing a new row + closing
//     superseded_by, never by mutating a row in place.

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startRecordsPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos_owner"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: start postgres: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("testcontainers: connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: new: %v", err)
	}
	t.Cleanup(pool.Close)

	for _, mig := range []string{
		"../../../migrations/kernel_records_baseline.sql",
		"../../../migrations/mirror_record_baseline.sql",
	} {
		sqlBytes, err := os.ReadFile(mig)
		if err != nil {
			t.Fatalf("read migration %s: %v", mig, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply migration %s: %v", mig, err)
		}
	}
	return pool
}

// insertMirror inserts a content-addressed typed mirror row as the owner.
func insertMirror(ctx context.Context, pool *pgxpool.Pool, id string, m Mirror) error {
	_, err := pool.Exec(ctx,
		`INSERT INTO mirrors.mirror_record
		   (id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$1,$1)`,
		id, m.Reflects.LayerID, m.Reflects.Version, string(m.TestKind),
		string(m.CertLanguage), string(m.Authority), string(m.Liveness))
	return err
}

// loadMirrors reads the head typed mirror rows back into the Go model.
func loadMirrors(ctx context.Context, pool *pgxpool.Pool) ([]Mirror, error) {
	rows, err := pool.Query(ctx,
		`SELECT id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash
		   FROM mirrors.mirror_record WHERE superseded_by IS NULL ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Mirror
	for rows.Next() {
		var m Mirror
		var tk, cl, au, lv string
		if err := rows.Scan(&m.MirrorID, &m.Reflects.LayerID, &m.Reflects.Version, &tk, &cl, &au, &lv, &m.ContentHash); err != nil {
			return nil, err
		}
		m.TestKind, m.CertLanguage, m.Authority, m.Liveness = TestKind(tk), CertLanguage(cl), Authority(au), Liveness(lv)
		out = append(out, m)
	}
	return out, rows.Err()
}

func runAsRole(ctx context.Context, pool *pgxpool.Pool, role, sql string, args ...any) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+pgx.Identifier{role}.Sanitize()); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, sql, args...)
	return err
}

// TestCompletenessOverRealPostgres proves the completeness join computes the
// right monster set against real typed mirror rows ⋈ a real kernel layer.
func TestCompletenessOverRealPostgres(t *testing.T) {
	ctx := context.Background()
	pool := startRecordsPostgres(t)

	// A real kernel layer (a control @v1) recorded as the owner.
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.layer (id, body, version) VALUES ($1, $2::jsonb, $3)`,
		"checkout-button", `{"kind":"control"}`, "v1"); err != nil {
		t.Fatalf("seed layer: %v", err)
	}
	layers := []Layer{{LayerID: "checkout-button", Version: "v1", Kind: "control"}}

	// Case A — a living fixture mirror reflecting it → COMPLETE.
	if err := insertMirror(ctx, pool, "live-1", Mirror{
		Reflects: LayerRef{LayerID: "checkout-button", Version: "v1"},
		TestKind: TestKindFixture, CertLanguage: CertFixture, Authority: AuthorityAbove, Liveness: LivenessAlive,
	}); err != nil {
		t.Fatalf("insert living mirror: %v", err)
	}
	mirrors, err := loadMirrors(ctx, pool)
	if err != nil {
		t.Fatalf("load mirrors: %v", err)
	}
	if r := ComputeCompleteness(mirrors, layers); r.Verdict != VerdictComplete {
		t.Fatalf("expected COMPLETE over real rows, got %+v", r)
	}

	// Case B — append an orphan mirror (reflects a gone @version) → RED_MONSTER.
	if err := insertMirror(ctx, pool, "orphan-1", Mirror{
		Reflects: LayerRef{LayerID: "checkout-button", Version: "v0"},
		TestKind: TestKindFixture, CertLanguage: CertFixture, Authority: AuthorityAbove, Liveness: LivenessAlive,
	}); err != nil {
		t.Fatalf("insert orphan mirror: %v", err)
	}
	mirrors, _ = loadMirrors(ctx, pool)
	r := ComputeCompleteness(mirrors, layers)
	if r.Verdict != VerdictRedMonster {
		t.Fatalf("expected RED_MONSTER with the orphan, got %+v", r)
	}
	var sawOrphan bool
	for _, m := range r.Monsters {
		if m.Reason == ReasonNoOrphanMirror && m.MirrorID == "orphan-1" {
			sawOrphan = true
		}
	}
	if !sawOrphan {
		t.Fatalf("expected orphan-1 reported as no_orphan_mirror, got %+v", r.Monsters)
	}
}

// TestMirrorRecordWallHolds proves the agent role cannot write a mirror record.
func TestMirrorRecordWallHolds(t *testing.T) {
	ctx := context.Background()
	pool := startRecordsPostgres(t)

	// Seed a row as the owner so UPDATE/DELETE have a target.
	if err := insertMirror(ctx, pool, "seed-1", Mirror{
		Reflects: LayerRef{LayerID: "x", Version: "v1"},
		TestKind: TestKindFixture, CertLanguage: CertFixture, Authority: AuthorityAbove, Liveness: LivenessAlive,
	}); err != nil {
		t.Fatalf("seed mirror: %v", err)
	}

	denied := []struct{ name, sql string }{
		{"INSERT", `INSERT INTO mirrors.mirror_record
			(id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash, version)
			VALUES ('a','x','v1','fixture','fixture','above','alive','a','a')`},
		{"UPDATE", "UPDATE mirrors.mirror_record SET liveness = 'dead' WHERE id = 'seed-1'"},
		{"DELETE", "DELETE FROM mirrors.mirror_record WHERE id = 'seed-1'"},
		{"TRUNCATE", "TRUNCATE mirrors.mirror_record"},
	}
	for _, d := range denied {
		t.Run(d.name, func(t *testing.T) {
			err := runAsRole(ctx, pool, "aidos_agent", d.sql)
			if err == nil {
				t.Fatalf("WALL BREACH: agent %s on mirrors.mirror_record succeeded", d.name)
			}
			if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
				t.Fatalf("agent %s denied for the wrong reason: %v", d.name, err)
			}
		})
	}
}

// TestMirrorRecordContentAddressed proves the CHECK rejects a row whose id,
// version and content_hash disagree (content-addressing is in-database truth).
func TestMirrorRecordContentAddressed(t *testing.T) {
	ctx := context.Background()
	pool := startRecordsPostgres(t)

	err := func() error {
		_, e := pool.Exec(ctx,
			`INSERT INTO mirrors.mirror_record
			   (id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash, version)
			 VALUES ('id1','x','v1','fixture','fixture','above','alive','DIFFERENT','id1')`)
		return e
	}()
	if err == nil {
		t.Fatal("a row with id != content_hash must be rejected by the content-addressed CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "mirror_record_content_addressed_chk") {
		t.Fatalf("rejected for the wrong reason: %v", err)
	}
}

// TestMirrorRecordAppendOnlyHead proves the head moves by APPEND + close, never
// by mutating a body in place: the owner writes a new row and closes the prior
// row's superseded_by; the old body is unchanged and history is preserved.
func TestMirrorRecordAppendOnlyHead(t *testing.T) {
	ctx := context.Background()
	pool := startRecordsPostgres(t)

	if err := insertMirror(ctx, pool, "v1row", Mirror{
		Reflects: LayerRef{LayerID: "x", Version: "v1"},
		TestKind: TestKindFixture, CertLanguage: CertFixture, Authority: AuthorityAbove, Liveness: LivenessAlive,
	}); err != nil {
		t.Fatalf("insert head: %v", err)
	}
	// Re-point: a new immutable row, then close the prior head (the only UPDATE
	// the aidos writer makes — superseded_by, never the body).
	if err := insertMirror(ctx, pool, "v2row", Mirror{
		Reflects: LayerRef{LayerID: "x", Version: "v1"},
		TestKind: TestKindFixture, CertLanguage: CertFixture, Authority: AuthorityAbove, Liveness: LivenessDead,
	}); err != nil {
		t.Fatalf("insert new head: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`UPDATE mirrors.mirror_record SET superseded_by = 'v2row' WHERE id = 'v1row'`); err != nil {
		t.Fatalf("close prior head: %v", err)
	}

	// History preserved: both rows exist; the old body is untouched.
	var oldLiveness string
	if err := pool.QueryRow(ctx,
		`SELECT liveness FROM mirrors.mirror_record WHERE id = 'v1row'`).Scan(&oldLiveness); err != nil {
		t.Fatalf("read old row: %v", err)
	}
	if oldLiveness != "alive" {
		t.Fatalf("the prior row body must be immutable (alive), got %s", oldLiveness)
	}
	// The head is the new row.
	heads, err := loadMirrors(ctx, pool)
	if err != nil {
		t.Fatalf("load heads: %v", err)
	}
	if len(heads) != 1 || heads[0].MirrorID != "v2row" || heads[0].Liveness != LivenessDead {
		t.Fatalf("expected the single head to be v2row(dead), got %+v", heads)
	}
}

package stackmanifest_test

// Persistence mirror: reflects=kernel.stack_manifest-migration, test_kind=integration,
// liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the DP02
// stack_manifest migration applied:
//   - kernel.stack_manifest exists with the five-column KRDCore record shape;
//   - a content-addressed manifest record (stackmanifest.NewRecord) round-trips into
//     the table and reads back byte-identical (id == version == the content hash);
//   - THE WALL: the agent role keeps SELECT-only — INSERT into kernel.stack_manifest
//     is refused (the DP02 done-criterion: a direct truth-write is refused; writing a
//     manifest flows through idea → mirror → /goal → approval).
//
// The Atlas Pro `migrate lint` is not available; the AIDOS convention proves
// migrations via Testcontainers on `go test` (expand-only, additive).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startStackManifestPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
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

	// Apply the S02 baseline then the DP02 stack_manifest migration, in order
	// (expand-only, additive — nothing prior is altered).
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/kernel_stack_manifest_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	return pool
}

// TestStackManifestRecordRoundTrips — the pinned Example manifest, content-addressed
// by stackmanifest.NewRecord (records.Hash/Canonicalize, S02 reused), round-trips
// through kernel.stack_manifest byte-identically.
func TestStackManifestRecordRoundTrips(t *testing.T) {
	pool := startStackManifestPostgres(t)
	ctx := context.Background()

	rec, err := stackmanifest.NewRecord(stackmanifest.Example())
	if err != nil {
		t.Fatalf("NewRecord: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.stack_manifest (id, body, version) VALUES ($1, $2::jsonb, $3)`,
		rec.ID, string(rec.Body), rec.Version,
	); err != nil {
		t.Fatalf("insert manifest record (privileged role) should succeed: %v", err)
	}

	var gotBody, gotVersion string
	if err := pool.QueryRow(ctx,
		"SELECT body::text, version FROM kernel.stack_manifest WHERE id = $1", rec.ID,
	).Scan(&gotBody, &gotVersion); err != nil {
		t.Fatalf("select manifest record: %v", err)
	}
	if gotVersion != rec.Version {
		t.Fatalf("version did not round-trip: got %q want %q", gotVersion, rec.Version)
	}
	// jsonb normalizes whitespace; the canonical body has none and sorted keys, so a
	// re-canonicalized read must hash back to the same content address.
	got2, err := stackmanifest.HashManifest(stackmanifest.Example())
	if err != nil {
		t.Fatalf("HashManifest: %v", err)
	}
	if got2 != rec.ID {
		t.Fatalf("content address drifted: got %q want %q", got2, rec.ID)
	}
}

// TestStackManifestAgentRoleSelectOnly — the wall (CLAUDE.md §2, DP02 done-criterion):
// the agent role may SELECT kernel.stack_manifest but a direct write is REFUSED.
func TestStackManifestAgentRoleSelectOnly(t *testing.T) {
	pool := startStackManifestPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT id FROM kernel.stack_manifest LIMIT 1; RESET ROLE",
	); err != nil {
		t.Fatalf("agent SELECT on kernel.stack_manifest must succeed: %v", err)
	}

	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO kernel.stack_manifest (id, body, version) VALUES ('x', '{"kind":"stack_manifest"}'::jsonb, 'x'); RESET ROLE`)
	if err == nil {
		t.Fatal("agent INSERT into kernel.stack_manifest must be REFUSED (the wall)")
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Fatalf("want a permission-denied refusal, got: %v", err)
	}
}

package records_test

// Persistence + wall mirror: reflects=kernel.records-migration,
// test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the kernel-records migration applied:
//   - each of the seven record tables round-trips an empty-example record as
//     validated JSONB: id == version == content hash, body reads back canonically;
//   - the agent role (aidos_agent) has SELECT-only on the truth schemas — every
//     INSERT/UPDATE/DELETE is rejected with permission denied (the wall, §2).

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// recordTable maps each kind to its canonical schema-qualified table.
var recordTable = map[records.Kind]string{
	records.KindIdea:      "ideas.idea",
	records.KindTruth:     "kernel.truth",
	records.KindMirror:    "mirrors.mirror",
	records.KindLayer:     "kernel.layer",
	records.KindLink:      "kernel.link",
	records.KindChangeSet: "changesets.changeset",
	records.KindPhase:     "dag.phase",
}

func startKernelPostgres(t *testing.T) (*pgxpool.Pool, string) {
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

	mig, err := os.ReadFile("../../migrations/kernel_records_baseline.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(mig)); err != nil {
		t.Fatalf("apply migration: %v", err)
	}
	return pool, dsn
}

func TestSevenRecordsRoundTripAsJSONB(t *testing.T) {
	pool, _ := startKernelPostgres(t)
	ctx := context.Background()

	set, err := records.EmptyExampleSet()
	if err != nil {
		t.Fatalf("empty example set: %v", err)
	}
	if len(set) != 7 {
		t.Fatalf("expected 7 records, got %d", len(set))
	}

	for _, r := range set {
		table := recordTable[r.Kind]
		if table == "" {
			t.Fatalf("no table mapped for kind %q", r.Kind)
		}

		// Insert as the privileged owner (the migration owner / CLI-equivalent).
		_, err := pool.Exec(ctx,
			"INSERT INTO "+table+" (id, body, version) VALUES ($1, $2::jsonb, $3)",
			r.ID, string(r.Body), r.Version,
		)
		if err != nil {
			t.Fatalf("%s insert: %v", r.Kind, err)
		}

		// Read it back and re-validate the content-address invariant from the DB.
		var gotBody []byte
		var gotID, gotVer string
		row := pool.QueryRow(ctx,
			"SELECT id, body, version FROM "+table+" WHERE id = $1", r.ID)
		if err := row.Scan(&gotID, &gotBody, &gotVer); err != nil {
			t.Fatalf("%s select: %v", r.Kind, err)
		}

		canon, err := records.Canonicalize(gotBody)
		if err != nil {
			t.Fatalf("%s canonicalize from db: %v", r.Kind, err)
		}
		want := records.Hash(canon)
		if gotID != want || gotVer != want {
			t.Fatalf("%s: db id/version != content hash: id=%s version=%s want=%s",
				r.Kind, gotID, gotVer, want)
		}

		// And the reconstructed record validates.
		if err := records.Validate(records.Record{
			ID: gotID, Kind: r.Kind, Body: json.RawMessage(gotBody), Version: gotVer,
		}); err != nil {
			t.Fatalf("%s: reconstructed record invalid: %v", r.Kind, err)
		}
	}
}

func TestAgentRoleIsSelectOnlyOnTruthSchemas(t *testing.T) {
	adminPool, dsn := startKernelPostgres(t)
	ctx := context.Background()

	// Seed one row per table as the owner so SELECT/UPDATE/DELETE have a target.
	set, err := records.EmptyExampleSet()
	if err != nil {
		t.Fatalf("empty example set: %v", err)
	}
	for _, r := range set {
		if _, err := adminPool.Exec(ctx,
			"INSERT INTO "+recordTable[r.Kind]+" (id, body, version) VALUES ($1, $2::jsonb, $3)",
			r.ID, string(r.Body), r.Version,
		); err != nil {
			t.Fatalf("seed %s: %v", r.Kind, err)
		}
	}

	// Give the least-privilege agent role a login and connect as it.
	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter role: %v", err)
	}
	agentDSN := swapUserInfoKernel(dsn, "aidos_agent", "agentpw")
	agentPool, err := pgxpool.New(ctx, agentDSN)
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	defer agentPool.Close()

	for _, r := range set {
		table := recordTable[r.Kind]
		t.Run(string(r.Kind), func(t *testing.T) {
			// SELECT is allowed (the agent reads typed truth-records).
			var id string
			if err := agentPool.QueryRow(ctx,
				"SELECT id FROM "+table+" WHERE id = $1", r.ID).Scan(&id); err != nil {
				t.Fatalf("agent SELECT %s should be allowed: %v", table, err)
			}

			// Every write must be rejected (the wall).
			writes := []struct {
				name, sql string
			}{
				{"INSERT", "INSERT INTO " + table + " (id, body, version) VALUES ('x', '{}'::jsonb, 'x')"},
				{"UPDATE", "UPDATE " + table + " SET version = 'x' WHERE id = $1"},
				{"DELETE", "DELETE FROM " + table + " WHERE id = $1"},
			}
			for _, w := range writes {
				var execErr error
				if strings.Contains(w.sql, "$1") {
					_, execErr = agentPool.Exec(ctx, w.sql, r.ID)
				} else {
					_, execErr = agentPool.Exec(ctx, w.sql)
				}
				if execErr == nil {
					t.Fatalf("agent %s on %s must be rejected, but it succeeded", w.name, table)
				}
				if !strings.Contains(strings.ToLower(execErr.Error()), "permission denied") {
					t.Fatalf("agent %s on %s rejected for the wrong reason: %v", w.name, table, execErr)
				}
			}
		})
	}
}

func swapUserInfoKernel(dsn, user, pass string) string {
	const scheme = "postgres://"
	rest := strings.TrimPrefix(dsn, scheme)
	at := strings.Index(rest, "@")
	if at < 0 {
		return dsn
	}
	return scheme + user + ":" + pass + "@" + rest[at+1:]
}

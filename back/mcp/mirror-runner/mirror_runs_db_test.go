package mirrorrunner

// DB-level mirror (Testcontainers + real Postgres): the cliquet run-log is
// append-only and the wall holds end-to-end.
// mirror record: reflects=S05-mirror-runs-append-only, test_kind=invariant,
//               cert_language=testcontainers, liveness=live
//
// Proves, against a throwaway real Postgres with the S02 + S05 baselines applied:
//   - PgRunLog appends runs and PgMirrorSource reads the mirror set;
//   - the agent role (aidos_agent) may INSERT + SELECT runtime.mirror_runs but is
//     DENIED UPDATE/DELETE/TRUNCATE there (append-only, in-database — §5 honesty);
//   - the agent role is DENIED INSERT into mirrors.mirror (the wall holds: the
//     runner reads the mirror set, it never writes truth);
//   - the regressed CHECK constraint rejects a row claiming regressed=true that
//     is not actually green→red.

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

func startRatchetPostgres(t *testing.T) (*pgxpool.Pool, string) {
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

	// Apply S02 (kernel/mirrors tables + roles) then S05 (runtime.mirror_runs).
	for _, mig := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/mirror_runs_baseline.sql",
	} {
		sqlBytes, err := os.ReadFile(mig)
		if err != nil {
			t.Fatalf("read migration %s: %v", mig, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply migration %s: %v", mig, err)
		}
	}
	return pool, dsn
}

// TestPgRunLogRoundTrip proves the production seams: append runs, read them back
// as the baseline, and list the latest per mirror.
func TestPgRunLogRoundTrip(t *testing.T) {
	ctx := context.Background()
	pool, _ := startRatchetPostgres(t)

	// Seed one living mirror in mirrors.mirror (as the privileged owner).
	if _, err := pool.Exec(ctx,
		`INSERT INTO mirrors.mirror (id, body, version) VALUES ($1, $2::jsonb, $3)`,
		"m1", `{"reflects":"demo"}`, "v1"); err != nil {
		t.Fatalf("seed mirror: %v", err)
	}

	log := &PgRunLog{pool: pool}
	green := StatusGreen
	if err := log.Record(ctx, RunRecord{
		RunID: "r1", MirrorID: "m1", MirrorVersion: "v1", ContentHash: "h1",
		Status: StatusGreen, BaselineStatus: nil, Regressed: false, Ref: "base",
	}); err != nil {
		t.Fatalf("record green: %v", err)
	}
	base, err := log.Baseline(ctx)
	if err != nil {
		t.Fatalf("baseline: %v", err)
	}
	if base["m1"] != StatusGreen {
		t.Fatalf("expected m1 green baseline, got %v", base["m1"])
	}

	// Append a red regressed run; latest baseline must now reflect it.
	if err := log.Record(ctx, RunRecord{
		RunID: "r2", MirrorID: "m1", MirrorVersion: "v1", ContentHash: "h1",
		Status: StatusRed, BaselineStatus: &green, Regressed: true, Ref: "cand",
	}); err != nil {
		t.Fatalf("record red: %v", err)
	}
	latest, err := log.LatestPerMirror(ctx)
	if err != nil {
		t.Fatalf("latest: %v", err)
	}
	if len(latest) != 1 || latest[0].Status != StatusRed || !latest[0].Regressed {
		t.Fatalf("expected latest m1 red+regressed, got %+v", latest)
	}

	src := &PgMirrorSource{pool: pool}
	living, err := src.LivingMirrors(ctx)
	if err != nil {
		t.Fatalf("living mirrors: %v", err)
	}
	if len(living) != 1 || living[0].ID != "m1" || living[0].ContentHash == "" {
		t.Fatalf("expected one living mirror m1 with a content hash, got %+v", living)
	}
}

// runAsRole runs sql under SET LOCAL ROLE inside a rolled-back transaction.
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

// TestMirrorRunsAppendOnlyForAgent proves the run-log is append-only in-database.
func TestMirrorRunsAppendOnlyForAgent(t *testing.T) {
	ctx := context.Background()
	pool, _ := startRatchetPostgres(t)

	// Seed a row as the owner so UPDATE/DELETE have something to target.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.mirror_runs (run_id, mirror_id, mirror_version, content_hash, status, regressed)
		 VALUES ('r0','m1','v1','h1','green', false)`); err != nil {
		t.Fatalf("seed run: %v", err)
	}

	// The agent CAN append a run.
	if err := runAsRole(ctx, pool, "aidos_agent",
		`INSERT INTO runtime.mirror_runs (run_id, mirror_id, mirror_version, content_hash, status, regressed)
		 VALUES ('r1','m2','v1','h2','green', false)`); err != nil {
		t.Fatalf("agent INSERT into runtime.mirror_runs must be allowed: %v", err)
	}

	// The agent CANNOT mutate the run-log (append-only).
	destructive := []struct{ name, sql string }{
		{"UPDATE", "UPDATE runtime.mirror_runs SET status = 'red' WHERE run_id = 'r0'"},
		{"DELETE", "DELETE FROM runtime.mirror_runs WHERE run_id = 'r0'"},
		{"TRUNCATE", "TRUNCATE runtime.mirror_runs"},
	}
	for _, d := range destructive {
		t.Run(d.name, func(t *testing.T) {
			err := runAsRole(ctx, pool, "aidos_agent", d.sql)
			if err == nil {
				t.Fatalf("%s on runtime.mirror_runs must be denied for the agent, but it succeeded", d.name)
			}
			if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
				t.Fatalf("%s denied for the wrong reason: %v", d.name, err)
			}
		})
	}
}

// TestWallHoldsForRunner proves the runner cannot write truth: the agent role is
// denied INSERT into mirrors.mirror (it only reads the mirror set).
func TestWallHoldsForRunner(t *testing.T) {
	ctx := context.Background()
	pool, _ := startRatchetPostgres(t)

	err := runAsRole(ctx, pool, "aidos_agent",
		`INSERT INTO mirrors.mirror (id, body, version) VALUES ('x', '{}'::jsonb, 'v1')`)
	if err == nil {
		t.Fatalf("WALL BREACH: agent INSERT into mirrors.mirror succeeded")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Fatalf("agent INSERT into mirrors.mirror denied for the wrong reason: %v", err)
	}
}

// TestRegressedCheckConstraint proves the DB rejects a dishonest regressed flag:
// regressed=true is only valid when baseline_status='green' AND status='red'.
func TestRegressedCheckConstraint(t *testing.T) {
	ctx := context.Background()
	pool, _ := startRatchetPostgres(t)

	// regressed=true but status=green ⇒ violates the CHECK constraint.
	_, err := pool.Exec(ctx,
		`INSERT INTO runtime.mirror_runs (run_id, mirror_id, mirror_version, content_hash, status, baseline_status, regressed)
		 VALUES ('rx','m1','v1','h1','green','green', true)`)
	if err == nil {
		t.Fatalf("a dishonest regressed=true (green status) must violate the CHECK constraint")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("expected a constraint violation, got: %v", err)
	}
}

package main

// DB-level mirror (Testcontainers + real Postgres) for S07 sensor_runs.
// mirror record: reflects=runtime.sensor_runs, test_kind=invariant,
//               cert_language=testcontainers, liveness=live, authority=below.
//
// Proves, against a throwaway real Postgres with the S02 + S05 + S07 baselines:
//   - PgRunLog appends a sensor run + its per-check rows and reads them back;
//   - the agent role (aidos_agent) may INSERT + SELECT runtime.sensor_runs /
//     runtime.sensor_check_results but is DENIED UPDATE/DELETE/TRUNCATE there
//     (append-only audit log, below the waterline — §5 honesty);
//   - the agent role is DENIED INSERT into mirrors.mirror (the wall holds: the
//     sensor records its own run-log, it never writes truth);
//   - the verdict CHECK constraint rejects a third verdict (block|allow only).

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

func startSensorsPostgres(t *testing.T) *pgxpool.Pool {
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
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/mirror_runs_baseline.sql",
		"../../migrations/sensor_runs_baseline.sql",
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

func TestPgSensorRunLogRoundTrip(t *testing.T) {
	ctx := context.Background()
	pool := startSensorsPostgres(t)

	log := &PgRunLog{Pool: pool}
	run := SensorRun{
		RunID:     "run-1",
		EventHash: "h-abc",
		Target:    "back/gen/order.go",
		Verdict:   VerdictBlock,
		Ref:       "cand",
		Results: []CheckResult{
			{Name: "gofmt", Pass: true, DurationMS: 3},
			{Name: "affected", Pass: false, Output: "TestOrder failed", DurationMS: 42},
		},
	}
	if err := log.Record(ctx, run); err != nil {
		t.Fatalf("record sensor run: %v", err)
	}

	latest, err := log.Latest(ctx)
	if err != nil {
		t.Fatalf("latest: %v", err)
	}
	if latest.RunID != "run-1" || latest.Verdict != VerdictBlock {
		t.Fatalf("latest run mismatch: %+v", latest)
	}
	if len(latest.Results) != 2 {
		t.Fatalf("expected 2 per-check rows, got %d: %+v", len(latest.Results), latest.Results)
	}
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

func TestSensorRunsAppendOnlyForAgent(t *testing.T) {
	ctx := context.Background()
	pool := startSensorsPostgres(t)

	// Seed a row as the owner so UPDATE/DELETE have something to target.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.sensor_runs (run_id, event_hash, target, verdict)
		 VALUES ('r0','h0','back/gen/x.go','allow')`); err != nil {
		t.Fatalf("seed run: %v", err)
	}

	// The agent CAN append a run.
	if err := runAsRole(ctx, pool, "aidos_agent",
		`INSERT INTO runtime.sensor_runs (run_id, event_hash, target, verdict)
		 VALUES ('r1','h1','back/gen/y.go','block')`); err != nil {
		t.Fatalf("agent INSERT into runtime.sensor_runs must be allowed: %v", err)
	}

	destructive := []struct{ name, sql string }{
		{"UPDATE", "UPDATE runtime.sensor_runs SET verdict = 'allow' WHERE run_id = 'r0'"},
		{"DELETE", "DELETE FROM runtime.sensor_runs WHERE run_id = 'r0'"},
		{"TRUNCATE", "TRUNCATE runtime.sensor_runs"},
	}
	for _, d := range destructive {
		t.Run(d.name, func(t *testing.T) {
			err := runAsRole(ctx, pool, "aidos_agent", d.sql)
			if err == nil {
				t.Fatalf("%s on runtime.sensor_runs must be denied for the agent", d.name)
			}
			if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
				t.Fatalf("%s denied for the wrong reason: %v", d.name, err)
			}
		})
	}
}

func TestWallHoldsForSensors(t *testing.T) {
	ctx := context.Background()
	pool := startSensorsPostgres(t)

	err := runAsRole(ctx, pool, "aidos_agent",
		`INSERT INTO mirrors.mirror (id, body, version) VALUES ('x', '{}'::jsonb, 'v1')`)
	if err == nil {
		t.Fatalf("WALL BREACH: agent INSERT into mirrors.mirror succeeded")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Fatalf("agent INSERT into mirrors.mirror denied for the wrong reason: %v", err)
	}
}

func TestVerdictCheckConstraint(t *testing.T) {
	ctx := context.Background()
	pool := startSensorsPostgres(t)

	_, err := pool.Exec(ctx,
		`INSERT INTO runtime.sensor_runs (run_id, event_hash, target, verdict)
		 VALUES ('rx','hx','back/gen/z.go','warn')`)
	if err == nil {
		t.Fatalf("a third verdict 'warn' must violate the CHECK constraint")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("expected a constraint violation, got: %v", err)
	}
}

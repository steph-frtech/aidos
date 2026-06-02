package selftest

// DB-level mirror (Testcontainers + real Postgres) for S39 self_test_runs + the wall
// GRANT proof. mirror record: reflects=runtime.self_test_runs + hooks.sessionstart.Run
// (the wall probe), test_kind=invariant, cert_language=testcontainers, liveness=live,
// authority=below.
//
// Proves, against a throwaway real Postgres with the S02 + S04 + S07 + S39 baselines:
//   - PgRunLog appends a self-test run (via the privileged writer role) and reads it back;
//   - the agent role (aidos_agent) is DENIED INSERT/UPDATE/DELETE on runtime.self_test_runs
//     (the ledger is written by the writer role; the agent reads it SELECT-only);
//   - the wall HOLDS: an agent-role write above the line on kernel / mirrors / fitness is
//     refused (permission denied) — PgHarness.ProbeWall reports refused == true;
//   - a healthy PgHarness Run is GREEN end-to-end (wall refused on all three, fitness
//     unchanged) — the done criterion against a real database;
//   - the verdict CHECK constraint rejects a third verdict (green|red only).

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

func startSelfTestPostgres(t *testing.T) *pgxpool.Pool {
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
		"../../../migrations/wall_grants_baseline.sql",
		"../../../migrations/sensor_runs_baseline.sql",
		"../../../migrations/self_test_runs_baseline.sql",
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

func TestPgSelfTestRunLedgerRoundTrip(t *testing.T) {
	ctx := context.Background()
	pool := startSelfTestPostgres(t)

	log := &PgRunLog{Pool: pool}
	report, br := Run(healthyHarness(), at)
	run := RunToLedger(report, br)
	if err := log.Record(ctx, run); err != nil {
		t.Fatalf("record self-test run: %v", err)
	}

	latest, err := log.Latest(ctx)
	if err != nil {
		t.Fatalf("latest: %v", err)
	}
	if latest.Verdict != VerdictGreen {
		t.Fatalf("latest verdict = %q, want green", latest.Verdict)
	}
	if latest.SensorsFired != 5 || latest.SensorsTotal != 5 {
		t.Fatalf("sensors %d/%d, want 5/5", latest.SensorsFired, latest.SensorsTotal)
	}
	if !latest.WallRefused || !latest.FitnessUnchanged {
		t.Fatalf("wall_refused/fitness_unchanged = %v/%v, want true/true", latest.WallRefused, latest.FitnessUnchanged)
	}
	if latest.BlockReason != nil {
		t.Fatalf("green run must carry no block_reason, got %v", latest.BlockReason)
	}
}

func TestPgSelfTestRedRunStoresBlockReason(t *testing.T) {
	ctx := context.Background()
	pool := startSelfTestPostgres(t)

	h := healthyHarness()
	h.mutedSensor["archtest"] = true
	report, br := Run(h, at)
	if err := (&PgRunLog{Pool: pool}).Record(ctx, RunToLedger(report, br)); err != nil {
		t.Fatalf("record red run: %v", err)
	}
	latest, err := (&PgRunLog{Pool: pool}).Latest(ctx)
	if err != nil {
		t.Fatalf("latest: %v", err)
	}
	if latest.Verdict != VerdictRed || latest.BlockReason == nil {
		t.Fatalf("red run must store a block_reason, got %q / %v", latest.Verdict, latest.BlockReason)
	}
	if latest.BlockReason.Code != CodeMutedSensor {
		t.Fatalf("block_reason code = %q, want MUTED_SENSOR", latest.BlockReason.Code)
	}
}

func runAsRole(ctx context.Context, pool *pgxpool.Pool, role, sql string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+pgx.Identifier{role}.Sanitize()); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, sql)
	return err
}

func TestSelfTestRunsAgentSelectOnly(t *testing.T) {
	ctx := context.Background()
	pool := startSelfTestPostgres(t)

	denied := []struct{ name, sql string }{
		{"INSERT", `INSERT INTO runtime.self_test_runs (at, verdict, sensors_fired, sensors_total, wall_refused, fitness_baseline_hash, fitness_current_hash, fitness_unchanged) VALUES (now(),'green',5,5,true,'h','h',true)`},
		{"TRUNCATE", "TRUNCATE runtime.self_test_runs"},
	}
	for _, d := range denied {
		t.Run(d.name, func(t *testing.T) {
			err := runAsRole(ctx, pool, "aidos_agent", d.sql)
			if err == nil {
				t.Fatalf("%s on runtime.self_test_runs must be denied for the agent (SELECT-only)", d.name)
			}
			if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
				t.Fatalf("%s denied for the wrong reason: %v", d.name, err)
			}
		})
	}
	// The agent CAN SELECT the ledger.
	if err := runAsRole(ctx, pool, "aidos_agent", "SELECT count(*) FROM runtime.self_test_runs"); err != nil {
		t.Fatalf("agent SELECT on runtime.self_test_runs must be allowed: %v", err)
	}
}

// The wall holds end-to-end: PgHarness.ProbeWall refuses the agent write above the line
// on kernel, mirrors AND fitness. This is the WALL guarantee proven against real GRANTs.
func TestPgHarnessWallProbeRefusesAgentWrites(t *testing.T) {
	ctx := context.Background()
	pool := startSelfTestPostgres(t)

	// Seed the fitness baseline so the fitness probe has rows to read.
	seedFitness(t, pool)

	h := &PgHarness{
		Pool:      pool,
		AgentRole: "aidos_agent",
		Sensors:   []string{"gofmt", "vet", "lint", "archtest", "affected"},
		SensorProber: func(id string) (string, bool) {
			return "redden " + id, true // every sensor fires (the healthy path)
		},
		Baseline: "", // set below from the seeded rows
	}
	// Pin the baseline to the current (just-seeded) hash so a healthy run is green.
	h.Baseline = fitnessProbe(h).CurrentHash
	h.rows = nil // force re-read in Run

	report, br := Run(h, at)
	if br != nil {
		t.Fatalf("healthy PgHarness must not block: %s\n%s", br.Code, br.Explanation)
	}
	if report.Verdict != VerdictGreen {
		t.Fatalf("verdict = %q, want green; wall=%+v fitness=%+v", report.Verdict, report.WallProbe, report.FitnessProbe)
	}
	if !report.WallProbe.AllRefused() {
		t.Fatalf("the wall must refuse every above-the-line agent write: %+v", report.WallProbe.Attempts)
	}
	_ = ctx
}

// A breached wall (agent gains INSERT on kernel) reddens the PgHarness run.
func TestPgHarnessBreachedWallReddens(t *testing.T) {
	ctx := context.Background()
	pool := startSelfTestPostgres(t)
	seedFitness(t, pool)

	// Inject the breach: grant the agent INSERT on kernel.truth.
	if _, err := pool.Exec(ctx, "GRANT INSERT ON kernel.truth TO aidos_agent"); err != nil {
		t.Fatalf("inject wall breach: %v", err)
	}

	h := &PgHarness{
		Pool:         pool,
		AgentRole:    "aidos_agent",
		Sensors:      []string{"gofmt"},
		SensorProber: func(id string) (string, bool) { return "redden " + id, true },
	}
	h.Baseline = fitnessProbe(h).CurrentHash
	h.rows = nil

	report, br := Run(h, at)
	if report.Verdict != VerdictRed {
		t.Fatalf("a breached wall must redden, got %q", report.Verdict)
	}
	if br == nil || br.Code != CodeWallBreached {
		t.Fatalf("breach must emit WALL_BREACHED, got %v", br)
	}
	for _, a := range report.WallProbe.Attempts {
		if a.Schema == SchemaKernel && a.Refused {
			t.Fatal("kernel attempt must report refused == false after the breach")
		}
	}
}

func TestSelfTestVerdictCheckConstraint(t *testing.T) {
	ctx := context.Background()
	pool := startSelfTestPostgres(t)

	_, err := pool.Exec(ctx,
		`INSERT INTO runtime.self_test_runs (at, verdict, sensors_fired, sensors_total, wall_refused, fitness_baseline_hash, fitness_current_hash, fitness_unchanged)
		 VALUES (now(),'amber',5,5,true,'h','h',true)`)
	if err == nil {
		t.Fatal("a third verdict 'amber' must violate the CHECK constraint")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("expected a constraint violation, got: %v", err)
	}
}

func seedFitness(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO fitness.waterline (id, body, version)
		 VALUES ('baseline', '{"above":["kernel","mirrors","fitness"],"below":["runtime","gen"]}'::jsonb, 'v1')`)
	if err != nil {
		t.Fatalf("seed fitness baseline: %v", err)
	}
}
